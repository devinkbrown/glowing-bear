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
import MessageView, { buildRenderItems, type RenderItemInput } from './MessageView';

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

describe('buildRenderItems (incremental render-item cache)', () => {
  const baseInput = (lines: WeeChatLine[], over: Partial<RenderItemInput> = {}): RenderItemInput => ({
    ptr: PTR,
    special: false,
    readMarker: undefined,
    matches: null,
    query: '',
    lines,
    ...over,
  });

  // A from-scratch reference build, to prove incremental output stays identical.
  const scratch = (input: RenderItemInput) => buildRenderItems(null, input);

  // Full observable shape of each item (identity aside) — catches any divergence
  // in day-separator placement, read-marker insertion, grouping, or dimming.
  const shapeOf = (build: { items: readonly unknown[] }) =>
    (build.items as { kind: string; key: string; grouped?: boolean; dimmed?: boolean }[]).map(
      (it) => ({ kind: it.kind, key: it.key, grouped: it.grouped, dimmed: it.dimmed }),
    );

  it('reuses the existing prefix by reference on a single tail append', () => {
    // Distinct nicks/times so nothing groups — one msg item per line.
    const lines = Array.from({ length: 50 }, (_, i) =>
      makeLine({ nick: `u${i}`, message: `m${i}`, date: new Date(2026, 0, 1, 12, 0, i) }),
    );
    const first = buildRenderItems(null, baseInput(lines));

    const appended = [...lines, makeLine({ nick: 'zed', message: 'tail', date: new Date(2026, 0, 1, 12, 1, 0) })];
    const second = buildRenderItems(first, baseInput(appended));

    // Exactly one new item; every prior item object is the SAME reference (no
    // whole-array rebuild, no per-row remount for untouched rows).
    expect(second.items.length).toBe(first.items.length + 1);
    for (let i = 0; i < first.items.length; i++) {
      expect(second.items[i]).toBe(first.items[i]);
    }
    // ...and the full shape matches a from-scratch build item-for-item.
    expect(shapeOf(second)).toEqual(shapeOf(scratch(baseInput(appended))));
  });

  it('stays identical to a full rebuild while search dimming is active', () => {
    const lines = Array.from({ length: 6 }, (_, i) =>
      makeLine({ nick: `u${i}`, message: i % 2 === 0 ? `hit ${i}` : `miss ${i}`, date: new Date(2026, 0, 1, 12, 0, i) }),
    );
    const matchIds = (ls: WeeChatLine[]) => {
      const ids: Record<string, true> = {};
      for (const l of ls) if (l.message.includes('hit')) ids[l.id] = true;
      return ids;
    };
    const input1 = baseInput(lines, { query: 'hit', matches: { ids: matchIds(lines) } });
    const first = buildRenderItems(null, input1);

    const next = makeLine({ nick: 'zed', message: 'hit tail', date: new Date(2026, 0, 1, 12, 1, 0) });
    const appended = [...lines, next];
    const input2 = baseInput(appended, { query: 'hit', matches: { ids: matchIds(appended) } });
    const second = buildRenderItems(first, input2);

    // Reused prefix keeps its dimmed flags; new tail dims from current matches;
    // whole thing equals a from-scratch dim pass.
    expect(shapeOf(second)).toEqual(shapeOf(scratch(input2)));
  });

  it('carries same-nick grouping across the append boundary (window top edge)', () => {
    const t0 = new Date(2026, 0, 1, 12, 0, 0);
    const lines = [makeLine({ nick: 'alice', message: 'one', date: t0 })];
    const first = buildRenderItems(null, baseInput(lines));

    // Same nick, within the 5-min window → the appended line must group even
    // though its predecessor lives only in the reused prefix.
    const next = makeLine({ nick: 'alice', message: 'two', date: new Date(2026, 0, 1, 12, 1, 0) });
    const second = buildRenderItems(first, baseInput([...lines, next]));

    const tail = second.items[second.items.length - 1];
    expect(tail?.kind).toBe('msg');
    expect(tail?.kind === 'msg' && tail.grouped).toBe(true);
    expect(shapeOf(second)).toEqual(shapeOf(scratch(baseInput([...lines, next]))));
  });

  it('emits a fresh day separator when an appended line crosses a day boundary', () => {
    const day1 = [makeLine({ nick: 'a', message: 'day1', date: new Date(2026, 0, 1, 23, 59, 0) })];
    const first = buildRenderItems(null, baseInput(day1));
    const firstDayItems = first.items.filter((it) => it.kind === 'day').length;

    const nextDay = makeLine({ nick: 'a', message: 'day2', date: new Date(2026, 0, 2, 0, 1, 0) });
    const second = buildRenderItems(first, baseInput([...day1, nextDay]));

    expect(second.items.filter((it) => it.kind === 'day').length).toBe(firstDayItems + 1);
    expect(shapeOf(second)).toEqual(shapeOf(scratch(baseInput([...day1, nextDay]))));
  });

  it('inserts the read marker at the append boundary (marker index == prev length)', () => {
    const lines = [
      makeLine({ nick: 'a', message: 'read', date: new Date(2026, 0, 1, 12, 0, 0) }),
      makeLine({ nick: 'b', message: 'read too', date: new Date(2026, 0, 1, 12, 0, 1) }),
    ];
    // Marker points one past the current tail — no marker item yet.
    const first = buildRenderItems(null, baseInput(lines, { readMarker: 2 }));
    expect(first.items.some((it) => it.kind === 'readMarker')).toBe(false);

    // The appended line sits exactly at the marker index → marker appears before it.
    const next = makeLine({ nick: 'c', message: 'unread', date: new Date(2026, 0, 1, 12, 0, 2) });
    const second = buildRenderItems(first, baseInput([...lines, next], { readMarker: 2 }));
    expect(second.items.some((it) => it.kind === 'readMarker')).toBe(true);
    expect(shapeOf(second)).toEqual(shapeOf(scratch(baseInput([...lines, next], { readMarker: 2 }))));
  });

  it('full-rebuilds (new item objects) when the search query changes', () => {
    const lines = [makeLine({ nick: 'a', message: 'hello', date: new Date(2026, 0, 1, 12, 0, 0) })];
    const first = buildRenderItems(null, baseInput(lines));

    const second = buildRenderItems(
      first,
      baseInput(lines, { query: 'hello', matches: { ids: { [lines[0]!.id]: true } } }),
    );
    // Shape input changed → not the same objects.
    expect(second.items[0]).not.toBe(first.items[0]);
  });

  it('full-rebuilds when the front is trimmed (MAX_LINES eviction)', () => {
    const lines = Array.from({ length: 5 }, (_, i) =>
      makeLine({ nick: `u${i}`, message: `m${i}`, date: new Date(2026, 0, 1, 12, 0, i) }),
    );
    const first = buildRenderItems(null, baseInput(lines));

    // Drop the front line, append a new tail — indices shift, so this is NOT a
    // clean append and must rebuild from scratch (identical to a fresh build).
    const trimmed = [...lines.slice(1), makeLine({ nick: 'new', message: 'tail', date: new Date(2026, 0, 1, 12, 0, 9) })];
    const second = buildRenderItems(first, baseInput(trimmed));

    expect(second.items[0]).not.toBe(first.items[0]);
    expect(shapeOf(second)).toEqual(shapeOf(scratch(baseInput(trimmed))));
  });

  it('returns the prior build unchanged when nothing appended or reshaped', () => {
    const lines = [makeLine({ nick: 'a', message: 'x', date: new Date(2026, 0, 1, 12, 0, 0) })];
    const first = buildRenderItems(null, baseInput(lines));
    const second = buildRenderItems(first, baseInput(lines));
    expect(second).toBe(first);
  });
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

  it('announces each successive tail line exactly once (back-scan baseline)', async () => {
    upsertBuffer(channelBuffer());
    addLine(PTR, makeLine({ nick: 'bob', message: 'baseline' }), []);
    const { container } = render(() => <MessageView bufferPtr={PTR} />);

    addLine(PTR, makeLine({ nick: 'carol', message: 'first tail' }), []);
    addLine(PTR, makeLine({ nick: 'dave', message: 'second tail' }), []);
    addLine(PTR, makeLine({ nick: 'erin', message: 'third tail' }), []);

    await waitFor(() =>
      expect(liveRegion(container).textContent).toContain('third tail'),
    );
    const text = liveRegion(container).textContent ?? '';
    // Baseline transcript stays silent; every genuine tail appears once.
    expect(text).not.toContain('baseline');
    expect(text.match(/first tail/g)?.length).toBe(1);
    expect(text.match(/second tail/g)?.length).toBe(1);
    expect(text.match(/third tail/g)?.length).toBe(1);
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
