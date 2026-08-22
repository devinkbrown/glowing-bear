// MessageLine render tests — regular/action/system/whisper variants,
// highlight styling, bot badge, timestamp settings, mIRC formatting,
// HTML escaping of message bodies, and the E2EE placeholder overlay.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import type { WeeChatLine } from '@/types';
import {
  addLine,
  activityState,
  clearBuffers,
  clearIrcx,
  markBot,
  markOnyxServer,
  resetActivity,
  resetSettings,
  setActiveBuffer,
  setSessionKind,
  updateSettings,
  upsertBuffer,
} from '@/state';
import type { WeeChatBuffer } from '@/types';
import { decryptedFor } from '@/state/bridge';
import { threadsState, recordLinePreview, resetThreads, pendingReplyFor } from '@/state/threads';
import { nickColor } from '@/lib/nickcolor';
import MessageLine from './MessageLine';

vi.mock('@/state/bridge', () => ({
  bridgeState: { status: 'off', nick: null, error: null, e2eeReady: false },
  _setBridgeState: vi.fn(),
  _setBridgeBackend: vi.fn(),
  bridgeRun: vi.fn(),
  sendTyping: vi.fn(),
  sendReactionTag: vi.fn(),
  markRead: vi.fn(),
  canE2ee: vi.fn(() => false),
  _storeDecryptedOverlay: vi.fn(),
  decryptedFor: vi.fn(() => null),
  _setPeerDmKey: vi.fn(),
  _ingestEncryptedDm: vi.fn(),
  sendE2eeDm: vi.fn(async () => false),
}));

const decryptedForMock = vi.mocked(decryptedFor);

// Unique line ids per test — MessageLine caches formatted HTML per line id.
let lineSeq = 0;

function makeLine(over: Partial<WeeChatLine> = {}): WeeChatLine {
  const now = new Date();
  return {
    id: `line_${++lineSeq}`,
    buffer: '0xb',
    date: now,
    datePrinted: now,
    displayed: true,
    highlight: false,
    tags: [],
    prefix: '',
    message: 'hello world',
    nick: 'alice',
    ircTags: new Map(),
    ...over,
  };
}

function renderLine(line: WeeChatLine) {
  return render(() => (
    <MessageLine line={line} grouped={false} bufferKind="channel" bufferPtr="0xb" isDesktop={true} />
  ));
}

beforeEach(() => {
  globalThis.localStorage?.clear();
  resetSettings();
  clearBuffers();
  clearIrcx();
  resetThreads();
  resetActivity();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MessageLine', () => {
  it('renders a regular message with nick and formatted body', () => {
    const { container, getByText } = renderLine(makeLine({ nick: 'alice', message: 'hello world' }));

    const nickEl = container.querySelector('.msg-nick');
    expect(nickEl).not.toBeNull();
    expect(nickEl!.textContent).toContain('alice');
    expect(getByText('hello world')).toBeInTheDocument();
    expect(container.querySelector('.msg-row')).not.toBeNull();
  });

  it('renders the /me action variant with the nick in bold and italic body', () => {
    const { container, getByText } = renderLine(makeLine({ isAction: true, nick: 'alice', message: 'waves hello' }));

    const strong = container.querySelector('strong');
    expect(strong).not.toBeNull();
    expect(strong!.textContent).toBe('alice');
    expect(getByText('waves hello')).toBeInTheDocument();
    // Action rows do not use the regular nick column.
    expect(container.querySelector('.msg-nick')).toBeNull();
  });

  it('renders join/part/quit system variants with event colors', () => {
    const cases: Array<[Partial<WeeChatLine>, string]> = [
      [{ isJoin: true, message: 'bob has joined #alpha' }, 'text-emerald-400/75'],
      [{ isPart: true, message: 'bob has left #alpha' }, 'text-red-400/65'],
      [{ isQuit: true, message: 'bob has quit (bye)' }, 'text-red-400/65'],
    ];
    for (const [over, colorClass] of cases) {
      const { container, unmount } = renderLine(makeLine({ nick: 'bob', ...over }));
      const row = container.querySelector('.msg-system');
      expect(row).not.toBeNull();
      const body = row!.querySelector('.msg-body');
      expect(body).not.toBeNull();
      expect(body!.classList.contains(colorClass)).toBe(true);
      expect(container.textContent).toContain(over.message as string);
      unmount();
    }
  });

  it('renders the whisper variant with a WHISPER label', () => {
    const { container, getByText } = renderLine(makeLine({ isWhisper: true, nick: 'alice', message: 'psst secret' }));

    expect(getByText('WHISPER')).toBeInTheDocument();
    expect(getByText('psst secret')).toBeInTheDocument();
    expect(container.querySelector('.border-amber-500\\/40')).not.toBeNull();
  });

  it('applies the highlight class when line.highlight is set', () => {
    const { container } = renderLine(makeLine({ highlight: true }));
    const row = container.querySelector('.msg-row');
    expect(row).not.toBeNull();
    expect(row!.classList.contains('msg-highlight')).toBe(true);
  });

  it('does not apply the highlight class on a plain line', () => {
    const { container } = renderLine(makeLine({ highlight: false }));
    expect(container.querySelector('.msg-highlight')).toBeNull();
  });

  it('opens the stable root thread from a nested reply action', () => {
    upsertBuffer({
      id: '0xb', number: 1, name: 'irc.fixture.#darkbear', fullName: 'irc.fixture.#darkbear',
      shortName: '#darkbear', title: '', type: 0, nicksCount: 0,
      localVars: { type: 'channel', channel: '#darkbear', server: 'fixture' },
      notify: 3, hidden: false,
    });
    const root = makeLine({ id: 'root-line', msgid: 'root', message: 'root body' });
    const parent = makeLine({ id: 'parent-line', msgid: 'parent', replyTo: 'root', message: 'parent body' });
    const child = makeLine({ id: 'child-line', msgid: 'child', replyTo: 'parent', message: 'child body' });
    addLine('0xb', root, []);
    addLine('0xb', parent, []);
    addLine('0xb', child, []);

    const { getByLabelText } = renderLine(child);
    fireEvent.click(getByLabelText('Open message thread'));

    expect(threadsState.activeThread).toEqual({
      bufferPtr: '0xb',
      bufferKey: 'irc.fixture.#darkbear',
      rootMsgid: 'root',
    });
  });

  it('saves a message only after local archive opt-in', () => {
    updateSettings({ archiveRetention: '7d' });
    upsertBuffer({
      id: '0xb', number: 1, name: 'irc.fixture.#darkbear', fullName: 'irc.fixture.#darkbear',
      shortName: '#darkbear', title: '', type: 0, nicksCount: 0,
      localVars: { type: 'channel' }, notify: 3, hidden: false,
    });
    const message = makeLine({ id: 'saved-line', msgid: 'saved-msg', message: 'keep this' });
    addLine('0xb', message, []);

    const { getByLabelText } = renderLine(message);
    fireEvent.click(getByLabelText('Save message'));

    expect(activityState.saved).toHaveLength(1);
    expect(activityState.saved[0]?.preview).toBe('keep this');
    expect(getByLabelText('Remove saved message')).toBeInTheDocument();
  });

  it('shows the BOT badge for nicks marked via ircx markBot', () => {
    markBot('helper');
    const { getByText } = renderLine(makeLine({ nick: 'helper', message: 'beep boop' }));
    expect(getByText('BOT')).toBeInTheDocument();
  });

  it('shows no BOT badge for unmarked nicks', () => {
    const { queryByText } = renderLine(makeLine({ nick: 'human' }));
    expect(queryByText('BOT')).toBeNull();
  });

  it('renders a timestamp by default and none when timestampFormat is off', () => {
    const withTs = renderLine(makeLine());
    expect(withTs.container.querySelector('.msg-ts')).not.toBeNull();
    withTs.unmount();

    updateSettings({ timestampFormat: 'off' });
    const noTs = renderLine(makeLine());
    expect(noTs.container.querySelector('.msg-ts')).toBeNull();
  });

  it('renders mIRC bold codes as an .irc-bold span', () => {
    const { container } = renderLine(makeLine({ message: 'plain \x02bolded\x02 tail' }));
    const bold = container.querySelector('.irc-bold');
    expect(bold).not.toBeNull();
    expect(bold!.textContent).toBe('bolded');
    expect(container.textContent).toContain('plain');
    expect(container.textContent).toContain('tail');
  });

  it('renders WeeChat relay color attributes from mIRC-colored messages', () => {
    const { container } = renderLine(makeLine({ message: 'plain \x19F04red\x19\x1c tail' }));
    const red = container.querySelector('span[style*="color:#ff5555"]');
    expect(red).not.toBeNull();
    expect(red!.textContent).toBe('red');
    expect(container.textContent).toContain('plain');
    expect(container.textContent).toContain('tail');
  });

  it('renders live WeeChat option and extended color controls in buffer messages', () => {
    const { container } = renderLine(makeLine({ message: '\x19F@00176trev\x1928 (\x1927host\x1928)\x19F03 quit' }));
    const extended = container.querySelector('span[style*="color:#d787d7"]');
    const delimiter = container.querySelector('span[style*="color:#16a34a"]');
    expect(extended).not.toBeNull();
    expect(extended!.textContent).toBe('trev');
    expect(delimiter).not.toBeNull();
    expect(container.textContent).toContain('trev (host) quit');
  });

  it('renders ANSI colors from default WeeChat relay buffer lines', () => {
    const { container } = renderLine(makeLine({ message: 'plain \x1b[31mred\x1b[0m tail' }));
    const red = container.querySelector('span[style*="color:#cd0000"]');
    expect(red).not.toBeNull();
    expect(red!.textContent).toBe('red');
    expect(container.textContent).toContain('plain');
    expect(container.textContent).toContain('tail');
  });

  it('renders wrapped Onyx Server EVENT server-buffer errors as structured Event Spine rows', () => {
    const line = makeLine({
      nick: '',
      prefix: 'irc',
      message: 'irc: command "EVENT" not found: "@onyx_server.io/category=CONNECT;onyx_server.io/severity=notice :eshmaki.me EVENT kain USER CONNECT C!webchat@2600:382:991d:6db8:2842:c3da:f220:c6b5"',
    });
    const { container, getByText } = renderLine(line);

    expect(getByText('USER')).toBeInTheDocument();
    expect(getByText('CONNECT')).toBeInTheDocument();
    expect(container.textContent).toContain('C!webchat@2600:382:991d:6db8:2842:c3da:f220:c6b5');
    expect(container.textContent).toContain('eshmaki.me -> kain');
    expect(container.textContent).not.toContain('command "EVENT" not found');
  });

  it('renders bare-tag Onyx Server EVENT lines as structured Event Spine rows', () => {
    const line = makeLine({
      nick: '',
      prefix: 'irc',
      message: 'onyx_server.io/category=SERVICE;onyx_server.io/severity=notice :eshmaki.me EVENT kain MEDIA PROFILE #root C codecs=cadencevox,cadencevis fec=rs_block',
    });
    const { container, getByText } = renderLine(line);

    expect(getByText('MEDIA')).toBeInTheDocument();
    expect(getByText('PROFILE')).toBeInTheDocument();
    expect(container.textContent).toContain('#root C');
    expect(container.textContent).toContain('codecs=cadencevox,cadencevis');
    expect(container.textContent).toContain('fec=rs_block');
    expect(container.textContent).not.toContain('onyx_server.io/category');
  });

  it('escapes HTML in message bodies — an <img> payload renders as text', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const { container } = renderLine(makeLine({ message: payload }));

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain(payload);
  });

  it('tints the nick deterministically — the same nick always yields the same color', () => {
    const first = renderLine(makeLine({ nick: 'alice' }));
    const firstColor = (first.container.querySelector('.msg-nick') as HTMLElement).style.color;
    expect(firstColor).not.toBe('');
    first.unmount();

    const second = renderLine(makeLine({ nick: 'alice' }));
    const secondColor = (second.container.querySelector('.msg-nick') as HTMLElement).style.color;
    // Same nick across independent renders resolves to the identical tint.
    expect(secondColor).toBe(firstColor);
  });

  it('tints two different nicks with distinguishable colors', () => {
    // alice (#56b6c2) and bob (#e6db74) map to different palette entries.
    const aliceRun = renderLine(makeLine({ nick: 'alice' }));
    const aliceColor = (aliceRun.container.querySelector('.msg-nick') as HTMLElement).style.color;
    aliceRun.unmount();

    const bobRun = renderLine(makeLine({ nick: 'bob' }));
    const bobColor = (bobRun.container.querySelector('.msg-nick') as HTMLElement).style.color;

    expect(aliceColor).not.toBe('');
    expect(bobColor).not.toBe('');
    expect(bobColor).not.toBe(aliceColor);
  });

  it('applies the nickColor helper value and keeps the nick a plain text node', () => {
    const { container } = renderLine(makeLine({ nick: 'carol' }));
    const nickEl = container.querySelector('.msg-nick') as HTMLElement;
    // Color is carried only via the inline style, never by injecting markup.
    expect(nickEl.textContent).toBe('carol');
    expect(nickEl.querySelector('img')).toBeNull();
    // The applied tint is exactly the helper's deterministic output.
    const expected = document.createElement('span');
    expected.style.color = nickColor('carol');
    expect(nickEl.style.color).toBe(expected.style.color);
  });

  it('omits the nick tint when the colorNicks setting is off', () => {
    updateSettings({ colorNicks: false });
    const { container } = renderLine(makeLine({ nick: 'alice' }));
    const nickEl = container.querySelector('.msg-nick') as HTMLElement;
    expect(nickEl.style.color).toBe('');
  });

  it('renders the encrypted placeholder for TSUMUGI1 payloads when decryption yields nothing', () => {
    const line = makeLine({ message: 'TSUMUGI1 xyz', msgid: 'mid-1' });
    const { container } = renderLine(line);

    expect(decryptedForMock).toHaveBeenCalledWith('mid-1', 'TSUMUGI1 xyz');
    expect(container.textContent).toContain('encrypted message');
    expect(container.textContent).not.toContain('TSUMUGI1');
  });

  // ── Reply affordance (P3.5) ──────────────────────────────────────────────

  it('sets the buffer pending-reply target when the reply control is clicked', () => {
    const line = makeLine({ nick: 'alice', message: 'parent text', msgid: 'p1' });
    const { container } = renderLine(line);

    const replyBtn = container.querySelector('.reply-action') as HTMLButtonElement | null;
    expect(replyBtn).not.toBeNull();
    expect(replyBtn!.getAttribute('aria-label')).toBe('Reply to alice');

    replyBtn!.click();
    const target = pendingReplyFor('0xb');
    expect(target).toEqual({ msgid: 'p1', nick: 'alice', preview: 'parent text' });
  });

  it('offers no reply control on a line without a msgid', () => {
    const { container } = renderLine(makeLine({ msgid: undefined }));
    expect(container.querySelector('.reply-action')).toBeNull();
  });

  it('shows a "replying to" indicator resolving the parent preview', () => {
    recordLinePreview('parent-1', 'the original message');
    const { container } = renderLine(makeLine({ message: 'a reply', msgid: 'child-1', replyTo: 'parent-1' }));

    const quote = container.querySelector('.reply-quote') as HTMLButtonElement | null;
    expect(quote).not.toBeNull();
    expect(quote!.getAttribute('aria-label')).toBe('Jump to replied message');
    expect(quote!.textContent).toContain('the original message');
  });

  it('falls back to a generic label when the parent preview is unknown', () => {
    const { container } = renderLine(makeLine({ msgid: 'child-2', replyTo: 'unseen' }));
    const quote = container.querySelector('.reply-quote') as HTMLButtonElement;
    expect(quote.textContent).toContain('replying to a message');
  });

  it('renders a reply preview as inert text, never as markup', () => {
    // A hostile parent body must never become live DOM in the indicator.
    recordLinePreview('parent-x', '<img src=x onerror=alert(1)>');
    const { container } = renderLine(makeLine({ msgid: 'child-x', replyTo: 'parent-x' }));

    const quote = container.querySelector('.reply-quote') as HTMLElement;
    expect(quote.querySelector('img')).toBeNull();
    expect(quote.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('hides react affordances on generic WeeChat buffers', () => {
    setSessionKind('weechat-generic');
    const { container, queryByLabelText } = renderLine(makeLine({ msgid: 'm-react-a' }));
    fireEvent.contextMenu(container.querySelector('.msg-row')!);
    expect(queryByLabelText(/React with/)).toBeNull();
  });

  it('offers react on Onyx chrome', () => {
    setSessionKind('weechat-onyx');
    markOnyxServer('eshmaki');
    upsertBuffer({
      id: '0xb',
      number: 1,
      name: 'irc.eshmaki.#alpha',
      fullName: 'irc.eshmaki.#alpha',
      shortName: '#alpha',
      title: '',
      type: 0,
      nicksCount: 0,
      localVars: { type: 'channel', server: 'eshmaki', channel: '#alpha' },
      notify: 0,
      hidden: false,
    } satisfies WeeChatBuffer);
    setActiveBuffer('0xb');
    const { container, getAllByLabelText } = renderLine(makeLine({ msgid: 'm-react-b' }));
    fireEvent.contextMenu(container.querySelector('.msg-row')!);
    expect(getAllByLabelText(/React with/).length).toBeGreaterThan(0);
  });

  it('captures a sanitized preview into the store when replying', () => {
    const { container } = renderLine(makeLine({ nick: 'bob', message: 'line one\nline two', msgid: 'm9' }));
    (container.querySelector('.reply-action') as HTMLButtonElement).click();
    // stripFormatting + threads sanitize collapse the newline to a space.
    expect(threadsState.replyPreview['m9']).toBe('line one line two');
    expect(pendingReplyFor('0xb')?.preview).toBe('line one line two');
  });
});
