// MessageView live-region tests (SC 4.1.3 Status Messages).
//
// The message feed carries a role="log" aria-live="polite" region fed
// NEW-TAIL-ONLY. These pin the semantics that matter:
//   - the region exists with polite/additions semantics;
//   - the existing transcript is NOT announced on mount (silent baseline);
//   - a genuinely new tail message IS announced;
//   - a requestHistory-style PREPEND does NOT hit the live region.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, waitFor } from '@solidjs/testing-library';
import type { WeeChatBuffer } from '@/lib/weechat/model';
import type { WeeChatLine } from '@/types';
import { addLine, addLines, clearBuffers, upsertBuffer, resetSettings } from '@/state';
import MessageView from './MessageView';

const PTR = '0xchan';

// jsdom has no matchMedia; MessageView's createMediaQuery needs it.
function stubMatchMedia(): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function channelBuffer(): WeeChatBuffer {
  return {
    id: PTR,
    number: 1,
    name: 'alpha',
    fullName: 'irc.net.#alpha',
    shortName: '#alpha',
    title: '',
    type: 0,
    nicksCount: 2,
    localVars: { type: 'channel', plugin: 'irc' },
    notify: 3,
    hidden: false,
  };
}

let seq = 0;
function makeLine(over: Partial<WeeChatLine> = {}): WeeChatLine {
  const now = new Date();
  return {
    id: `line_${++seq}`,
    buffer: PTR,
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

function liveRegion(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('[role="log"]');
  expect(el).not.toBeNull();
  return el!;
}

beforeEach(() => {
  stubMatchMedia();
  globalThis.localStorage?.clear();
  resetSettings();
  clearBuffers();
  seq = 0;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MessageView live region', () => {
  it('exposes a polite additions-only log region', () => {
    upsertBuffer(channelBuffer());
    const { container } = render(() => <MessageView bufferPtr={PTR} />);

    const region = liveRegion(container);
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('aria-relevant', 'additions');
  });

  it('does not announce the existing transcript on mount', () => {
    upsertBuffer(channelBuffer());
    addLine(PTR, makeLine({ nick: 'bob', message: 'old backlog line' }), []);

    const { container } = render(() => <MessageView bufferPtr={PTR} />);

    expect(liveRegion(container).textContent).not.toContain('old backlog line');
  });

  it('announces a newly-appended tail message', async () => {
    upsertBuffer(channelBuffer());
    addLine(PTR, makeLine({ nick: 'bob', message: 'baseline' }), []);
    const { container } = render(() => <MessageView bufferPtr={PTR} />);

    addLine(PTR, makeLine({ nick: 'carol', message: 'fresh incoming' }), []);

    await waitFor(() =>
      expect(liveRegion(container).textContent).toContain('carol: fresh incoming'),
    );
  });

  it('does NOT announce a prepended history page', async () => {
    upsertBuffer(channelBuffer());
    addLine(PTR, makeLine({ nick: 'bob', message: 'baseline' }), []);
    const { container } = render(() => <MessageView bufferPtr={PTR} />);

    // A genuine tail message announces first...
    addLine(PTR, makeLine({ nick: 'carol', message: 'fresh incoming' }), []);
    await waitFor(() =>
      expect(liveRegion(container).textContent).toContain('fresh incoming'),
    );

    // ...then a requestHistory-style prepend of an older page must stay silent.
    const older = new Date(Date.now() - 3_600_000);
    addLines(
      PTR,
      [
        makeLine({ nick: 'dave', message: 'ancient prepended one', date: older }),
        makeLine({ nick: 'dave', message: 'ancient prepended two', date: older }),
      ],
      true,
    );

    // Give any effect a chance to (wrongly) fire, then assert silence.
    await new Promise((r) => setTimeout(r, 0));
    const text = liveRegion(container).textContent ?? '';
    expect(text).not.toContain('ancient prepended one');
    expect(text).not.toContain('ancient prepended two');
    // The only announced line remains the real tail message.
    expect(text).toContain('fresh incoming');
  });
});
