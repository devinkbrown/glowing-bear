// MessageLine render tests — regular/action/system/whisper variants,
// highlight styling, bot badge, timestamp settings, mIRC formatting,
// HTML escaping of message bodies, and the E2EE placeholder overlay.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup } from '@solidjs/testing-library';
import type { WeeChatLine } from '@/types';
import { clearBuffers, clearIrcx, markBot, resetSettings, updateSettings } from '@/state';
import { decryptedFor } from '@/state/bridge';
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

  it('renders wrapped Orochi EVENT server-buffer errors as structured Event Spine rows', () => {
    const line = makeLine({
      nick: '',
      prefix: 'irc',
      message: 'irc: command "EVENT" not found: "@orochi.io/category=CONNECT;orochi.io/severity=notice :eshmaki.me EVENT kain USER CONNECT C!webchat@2600:382:991d:6db8:2842:c3da:f220:c6b5"',
    });
    const { container, getByText } = renderLine(line);

    expect(getByText('USER')).toBeInTheDocument();
    expect(getByText('CONNECT')).toBeInTheDocument();
    expect(container.textContent).toContain('C!webchat@2600:382:991d:6db8:2842:c3da:f220:c6b5');
    expect(container.textContent).toContain('eshmaki.me -> kain');
    expect(container.textContent).not.toContain('command "EVENT" not found');
  });

  it('renders bare-tag Orochi EVENT lines as structured Event Spine rows', () => {
    const line = makeLine({
      nick: '',
      prefix: 'irc',
      message: 'orochi.io/category=SERVICE;orochi.io/severity=notice :eshmaki.me EVENT kain MEDIA PROFILE #root C codecs=kaguravox,kaguravis fec=rs_block',
    });
    const { container, getByText } = renderLine(line);

    expect(getByText('MEDIA')).toBeInTheDocument();
    expect(getByText('PROFILE')).toBeInTheDocument();
    expect(container.textContent).toContain('#root C');
    expect(container.textContent).toContain('codecs=kaguravox,kaguravis');
    expect(container.textContent).toContain('fec=rs_block');
    expect(container.textContent).not.toContain('orochi.io/category');
  });

  it('escapes HTML in message bodies — an <img> payload renders as text', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const { container } = renderLine(makeLine({ message: payload }));

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain(payload);
  });

  it('renders the encrypted placeholder for TSUMUGI1 payloads when decryption yields nothing', () => {
    const line = makeLine({ message: 'TSUMUGI1 xyz', msgid: 'mid-1' });
    const { container } = renderLine(line);

    expect(decryptedForMock).toHaveBeenCalledWith('mid-1', 'TSUMUGI1 xyz');
    expect(container.textContent).toContain('encrypted message');
    expect(container.textContent).not.toContain('TSUMUGI1');
  });
});
