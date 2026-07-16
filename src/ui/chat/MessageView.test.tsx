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
import { render, cleanup, waitFor, fireEvent } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import type { WeeChatBuffer } from '@/lib/weechat/model';
import type { WeeChatLine } from '@/types';
import { addLine, addLines, clearBuffers, upsertBuffer, resetSettings, setSearchOpen, updateSettings } from '@/state';
import { parseSearchQuery } from '@/lib/search/grammar';
import { matchesQuery } from '@/lib/search/matcher';
import MessageView, {
  buildRenderItems,
  createGlobalCountState,
  globalMatchTotal,
  type CountBuffer,
  type RenderItemInput,
} from './MessageView';

const archiveClient = vi.hoisted(() => ({
  searchArchive: vi.fn(),
  archiveMessages: vi.fn().mockResolvedValue(undefined),
  configureArchive: vi.fn().mockResolvedValue(undefined),
  deleteArchiveBuffer: vi.fn().mockResolvedValue(undefined),
  wipeArchive: vi.fn().mockResolvedValue(undefined),
  archiveStats: vi.fn().mockResolvedValue({ messages: 0, bytes: 0, buffers: [] }),
}));

vi.mock('@/lib/archive/client', () => archiveClient);

const PTR = '0xchan';
const PTR2 = '0xchan2';

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

function channelBuffer(id = PTR, name = 'alpha'): WeeChatBuffer {
  return {
    id,
    number: 1,
    name,
    fullName: `irc.net.#${name}`,
    shortName: `#${name}`,
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
  setSearchOpen(false);
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

  it('stays byte-for-byte identical to a full rebuild across a long append sequence', () => {
    // Mixed nicks, a day rollover mid-stream, and same-nick runs so grouping,
    // day separators, and the group-across-boundary path all exercise. Feeding
    // one line at a time (the real per-message tick) must never diverge from a
    // from-scratch build of the same accumulated array.
    const base = new Date(2026, 0, 1, 23, 58, 0).getTime();
    const nicks = ['alice', 'alice', 'bob', 'alice', 'carol', 'carol'];
    const lines: WeeChatLine[] = [];
    let incremental: ReturnType<typeof buildRenderItems> | null = null;

    for (let i = 0; i < 40; i++) {
      lines.push(
        makeLine({
          nick: nicks[i % nicks.length],
          message: `m${i}`,
          // +90s per line marches past midnight, forcing a day separator.
          date: new Date(base + i * 90_000),
        }),
      );
      // IMPORTANT: pass a fresh array snapshot each tick, mirroring how the store
      // exposes a growing list; buildRenderItems must reuse its prefix internally.
      incremental = buildRenderItems(incremental, baseInput([...lines]));
      expect(shapeOf(incremental)).toEqual(shapeOf(scratch(baseInput([...lines]))));
    }
    expect(incremental!.items.length).toBeGreaterThan(40); // day separators added
  });
});

describe('globalMatchTotal (bounded cross-buffer match count)', () => {
  const q = (raw: string) => parseSearchQuery(raw, Date.now());

  // Build a CountBuffer whose predicate invocations we can count, so we can
  // assert which buffers actually got rescanned.
  const buf = (ptr: string, channel: string, msgs: string[]): CountBuffer => ({
    ptr,
    channel,
    lines: msgs.map((m, i) =>
      makeLine({ id: `${ptr}_${i}`, nick: 'u', message: m, date: new Date(2026, 0, 1, 12, 0, i) }),
    ),
  });

  it('sums matches across all buffers on the first pass', () => {
    const state = createGlobalCountState();
    const buffers = [buf('A', '#a', ['deploy', 'lunch']), buf('B', '#b', ['deploy', 'deploy'])];
    const total = globalMatchTotal(state, q('deploy'), true, buffers, (l, ch) =>
      matchesQuery({ nick: l.nick ?? null, channel: ch, timestamp: l.date.getTime(), text: l.message }, q('deploy')),
    );
    expect(total).toBe(3);
  });

  it('does NOT rescan an unchanged buffer when only another buffer grew', () => {
    const state = createGlobalCountState();
    const query = q('deploy');
    const match = (l: WeeChatLine, ch: string, calls: { ptr: string }[]) => {
      calls.push({ ptr: ch });
      return matchesQuery(
        { nick: l.nick ?? null, channel: ch, timestamp: l.date.getTime(), text: l.message },
        query,
      );
    };

    const a = buf('A', '#a', ['deploy', 'lunch', 'deploy']);
    const b1 = buf('B', '#b', ['deploy']);
    const firstCalls: { ptr: string }[] = [];
    const first = globalMatchTotal(state, query, true, [a, b1], (l, ch) => match(l, ch, firstCalls));
    expect(first).toBe(3); // 2 in A + 1 in B
    // First pass touches every line in both buffers.
    expect(firstCalls.filter((c) => c.ptr === '#a').length).toBe(3);
    expect(firstCalls.filter((c) => c.ptr === '#b').length).toBe(1);

    // B gains a matching line; A is byte-identical (same line objects/sig).
    const b2: CountBuffer = { ...b1, lines: [...b1.lines, makeLine({ id: 'B_1', nick: 'u', message: 'deploy again', date: new Date(2026, 0, 1, 12, 5, 0) })] };
    const secondCalls: { ptr: string }[] = [];
    const second = globalMatchTotal(state, query, true, [a, b2], (l, ch) => match(l, ch, secondCalls));
    expect(second).toBe(4); // A's cached 2 + B's rescanned 2
    // The unrelated buffer A was NOT rescanned; only B's two lines were.
    expect(secondCalls.filter((c) => c.ptr === '#a').length).toBe(0);
    expect(secondCalls.filter((c) => c.ptr === '#b').length).toBe(2);
  });

  it('invalidates every cached buffer when the query changes', () => {
    const state = createGlobalCountState();
    const a = buf('A', '#a', ['deploy', 'lunch']);
    const q1 = q('deploy');
    const first = globalMatchTotal(state, q1, true, [a], (l, ch) =>
      matchesQuery({ nick: l.nick ?? null, channel: ch, timestamp: l.date.getTime(), text: l.message }, q1),
    );
    expect(first).toBe(1);

    const q2 = q('lunch');
    const calls: string[] = [];
    const second = globalMatchTotal(state, q2, true, [a], (l, ch) => {
      calls.push(l.message);
      return matchesQuery({ nick: l.nick ?? null, channel: ch, timestamp: l.date.getTime(), text: l.message }, q2);
    });
    expect(second).toBe(1);
    // New query => A fully rescanned despite an unchanged signature.
    expect(calls.length).toBe(2);
  });

  it('re-scans a buffer whose front was trimmed even at equal length', () => {
    const state = createGlobalCountState();
    const query = q('deploy');
    const doCount = (buffers: CountBuffer[], calls: string[]) =>
      globalMatchTotal(state, query, true, buffers, (l, ch) => {
        calls.push(l.id);
        return matchesQuery(
          { nick: l.nick ?? null, channel: ch, timestamp: l.date.getTime(), text: l.message },
          query,
        );
      });

    const a = buf('A', '#a', ['deploy', 'lunch', 'deploy']); // ids A_0,A_1,A_2
    doCount([a], []);
    // Trim front + append tail: length stays 3 but first/last ids move.
    const trimmed: CountBuffer = {
      ...a,
      lines: [...a.lines.slice(1), makeLine({ id: 'A_9', nick: 'u', message: 'deploy tail', date: new Date(2026, 0, 1, 12, 9, 0) })],
    };
    const calls: string[] = [];
    const total = doCount([trimmed], calls);
    expect(total).toBe(2); // lunch, deploy, deploy tail => 2 matches
    expect(calls.length).toBe(3); // rescanned, not served stale from cache
  });

  it('evicts cache entries for closed buffers', () => {
    const state = createGlobalCountState();
    const query = q('deploy');
    const run = (buffers: CountBuffer[]) =>
      globalMatchTotal(state, query, true, buffers, (l, ch) =>
        matchesQuery({ nick: l.nick ?? null, channel: ch, timestamp: l.date.getTime(), text: l.message }, query),
      );
    run([buf('A', '#a', ['deploy']), buf('B', '#b', ['deploy'])]);
    expect(state.perBuffer.has('B')).toBe(true);
    run([buf('A', '#a', ['deploy'])]); // B closed
    expect(state.perBuffer.has('B')).toBe(false);
    expect(state.perBuffer.has('A')).toBe(true);
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

  it('does NOT replay a buffer transcript into the live region on switch', async () => {
    // Two channels, each with pre-existing backlog.
    upsertBuffer(channelBuffer(PTR, 'alpha'));
    upsertBuffer(channelBuffer(PTR2, 'beta'));
    addLine(PTR, makeLine({ nick: 'bob', message: 'alpha baseline', buffer: PTR }), []);
    addLine(PTR2, makeLine({ nick: 'zoe', message: 'beta backlog line', buffer: PTR2 }), []);

    const [ptr, setPtr] = createSignal(PTR);
    const { container } = render(() => <MessageView bufferPtr={ptr()} />);

    // Confirm the region is live on the first buffer.
    addLine(PTR, makeLine({ nick: 'carol', message: 'alpha fresh', buffer: PTR }), []);
    await waitFor(() =>
      expect(liveRegion(container).textContent).toContain('alpha fresh'),
    );

    // Switch buffers — the second buffer's whole transcript must stay silent.
    setPtr(PTR2);
    await new Promise((r) => setTimeout(r, 0));

    const text = liveRegion(container).textContent ?? '';
    expect(text).not.toContain('beta backlog line');

    // ...and a genuinely new tail on the now-active buffer still announces.
    addLine(PTR2, makeLine({ nick: 'ivy', message: 'beta fresh after switch', buffer: PTR2 }), []);
    await waitFor(() =>
      expect(liveRegion(container).textContent).toContain('beta fresh after switch'),
    );
    expect(liveRegion(container).textContent).not.toContain('beta backlog line');
  });
});

describe('MessageView filter-grammar search', () => {
  // Open the Ctrl+F search bar AFTER the mount's buffer-switch effect (which
  // clears searchOpen inside a rAF) has settled, then return the input node.
  async function openSearch(container: HTMLElement): Promise<HTMLInputElement> {
    await new Promise((r) => setTimeout(r, 30));
    setSearchOpen(true);
    let input: HTMLInputElement | null = null;
    await waitFor(() => {
      input = container.querySelector<HTMLInputElement>('input[placeholder="Search messages..."]');
      expect(input).not.toBeNull();
    });
    return input!;
  }

  // The match-count element in the search bar (distinct tabular-nums span).
  function countText(container: HTMLElement): string {
    const bar = container.querySelector('input[placeholder="Search messages..."]')?.parentElement;
    return bar?.textContent ?? '';
  }

  it('a bare term keeps the classic message-OR-nick substring behavior', async () => {
    upsertBuffer(channelBuffer());
    addLine(PTR, makeLine({ nick: 'alice', message: 'deploy shipped' }), []);
    addLine(PTR, makeLine({ nick: 'bob', message: 'lunch time' }), []);
    addLine(PTR, makeLine({ nick: 'carol', message: 'another deploy' }), []);
    const { container } = render(() => <MessageView bufferPtr={PTR} />);

    const input = await openSearch(container);
    fireEvent.input(input, { target: { value: 'deploy' } });

    await waitFor(() => expect(countText(container)).toContain('2 found'));
  });

  it('keeps an unfinished IME search open when composition emits Escape', async () => {
    upsertBuffer(channelBuffer());
    const { container } = render(() => <MessageView bufferPtr={PTR} />);

    const input = await openSearch(container);
    fireEvent.input(input, { target: { value: '検索中' } });
    fireEvent.keyDown(input, { key: 'Escape', isComposing: true });

    expect(input).toHaveValue('検索中');
    expect(container.querySelector('input[placeholder="Search messages..."]')).toBe(input);

    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => {
      expect(container.querySelector('input[placeholder="Search messages..."]')).toBeNull();
    });
  });

  it('from: filters the current buffer to a single nick', async () => {
    upsertBuffer(channelBuffer());
    addLine(PTR, makeLine({ nick: 'alice', message: 'one' }), []);
    addLine(PTR, makeLine({ nick: 'alice', message: 'two' }), []);
    addLine(PTR, makeLine({ nick: 'bob', message: 'three' }), []);
    const { container } = render(() => <MessageView bufferPtr={PTR} />);

    const input = await openSearch(container);
    fireEvent.input(input, { target: { value: 'from:alice' } });

    await waitFor(() => expect(countText(container)).toContain('2 found'));
  });

  it('after: bounds the current buffer by timestamp', async () => {
    upsertBuffer(channelBuffer());
    const old = new Date(Date.now() - 4 * 3_600_000); // 4h ago
    addLine(PTR, makeLine({ nick: 'alice', message: 'ancient', date: old }), []);
    addLine(PTR, makeLine({ nick: 'bob', message: 'recent one' }), []);
    addLine(PTR, makeLine({ nick: 'carol', message: 'recent two' }), []);
    const { container } = render(() => <MessageView bufferPtr={PTR} />);

    const input = await openSearch(container);
    fireEvent.input(input, { target: { value: 'after:1h' } });

    // Only the two "now" lines fall within the last hour.
    await waitFor(() => expect(countText(container)).toContain('2 found'));
  });

  it('in:#other surfaces cross-buffer matches while the current buffer shows 0', async () => {
    upsertBuffer(channelBuffer(PTR, 'alpha'));
    upsertBuffer(channelBuffer(PTR2, 'beta'));
    addLine(PTR, makeLine({ nick: 'alice', message: 'alpha talk', buffer: PTR }), []);
    addLine(PTR2, makeLine({ nick: 'zoe', message: 'beta one', buffer: PTR2 }), []);
    addLine(PTR2, makeLine({ nick: 'zoe', message: 'beta two', buffer: PTR2 }), []);
    const { container } = render(() => <MessageView bufferPtr={PTR} />);

    const input = await openSearch(container);
    fireEvent.input(input, { target: { value: 'in:#beta' } });

    await waitFor(() => {
      const t = countText(container);
      expect(t).toContain('0 here');
      expect(t).toContain('2 across buffers');
    });
  });

  it('moves from the search input through archived results with arrow keys', async () => {
    archiveClient.searchArchive.mockResolvedValue([
      {
        key: 'a', bufferKey: 'irc.net.#alpha', bufferName: '#alpha', lineId: 'a',
        timestamp: 200, sender: 'alice', text: 'deploy ready', msgid: 'a', replyParent: '',
        snippet: 'deploy ready',
      },
      {
        key: 'b', bufferKey: 'irc.net.#alpha', bufferName: '#alpha', lineId: 'b',
        timestamp: 100, sender: 'bob', text: 'deploy queued', msgid: 'b', replyParent: '',
        snippet: 'deploy queued',
      },
    ]);
    updateSettings({ archiveRetention: '7d' });
    upsertBuffer(channelBuffer());
    const { container } = render(() => <MessageView bufferPtr={PTR} />);

    const input = await openSearch(container);
    fireEvent.input(input, { target: { value: 'deploy' } });
    let results!: NodeListOf<HTMLButtonElement>;
    await waitFor(() => {
      results = container.querySelectorAll<HTMLButtonElement>('button[data-archive-hit-index]');
      expect(results).toHaveLength(2);
    });

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    await waitFor(() => expect(document.activeElement).toBe(results![0]));
    fireEvent.keyDown(results![0]!, { key: 'ArrowDown' });
    await waitFor(() => expect(document.activeElement).toBe(results![1]));
    fireEvent.keyDown(results![1]!, { key: 'ArrowUp' });
    await waitFor(() => expect(document.activeElement).toBe(results![0]));
  });
});
