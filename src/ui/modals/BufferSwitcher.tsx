// BufferSwitcher — Ctrl+K command palette: fuzzy buffer filter, arrow-key
// navigation, Enter to jump, type glyphs, unread/highlight badges. Solid port
// of the old React BufferSwitcher; mount while activeModal === 'bufferSwitcher'.

import { createEffect, createMemo, createSignal, For, on, onMount, Show } from 'solid-js';
import { closeModal, getSorted, setActive } from '@/state';

interface SwitcherItem {
  id: string;
  name: string;
  fullName: string;
  type: string;
  unread: number;
  highlighted: number;
}

/** Lower is better: 0 prefix match, 1 substring, 2 in-order subsequence. */
function fuzzyScore(haystack: string, q: string): number | null {
  const n = haystack.toLowerCase();
  if (n.startsWith(q)) return 0;
  if (n.includes(q)) return 1;
  let qi = 0;
  for (let i = 0; i < n.length && qi < q.length; i++) {
    if (n[i] === q[qi]) qi++;
  }
  return qi === q.length ? 2 : null;
}

function bestScore(item: SwitcherItem, q: string): number | null {
  const byName = fuzzyScore(item.name, q);
  const byFull = fuzzyScore(item.fullName, q);
  if (byName === null) return byFull;
  if (byFull === null) return byName;
  return Math.min(byName, byFull);
}

export default function BufferSwitcher() {
  const [query, setQuery] = createSignal('');
  const [selected, setSelected] = createSignal(0);

  let inputRef: HTMLInputElement | undefined;
  let listRef: HTMLDivElement | undefined;

  const items = createMemo<SwitcherItem[]>(() => {
    const all = getSorted()
      .filter((e) => !e.buffer.hidden)
      .map((e) => ({
        id: e.buffer.id,
        name: e.buffer.shortName || e.buffer.name,
        fullName: e.buffer.fullName,
        type: e.buffer.localVars['type'] ?? '',
        unread: e.unread,
        highlighted: e.highlighted,
      }));

    const q = query().trim().toLowerCase();
    if (!q) return all;

    return all
      .map((item) => ({ item, score: bestScore(item, q) }))
      .filter((s): s is { item: SwitcherItem; score: number } => s.score !== null)
      .sort((a, b) => {
        if (a.score !== b.score) return a.score - b.score;
        return a.item.name.length - b.item.name.length;
      })
      .map((s) => s.item);
  });

  // Reset the selection whenever the query changes
  createEffect(on(query, () => setSelected(0), { defer: true }));

  onMount(() => inputRef?.focus());

  // Keep the selected row visible
  createEffect(() => {
    const idx = selected();
    const el = listRef?.children[idx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  });

  const pick = (id: string): void => {
    setActive(id);
    closeModal();
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, items().length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items()[selected()];
      if (item) pick(item.id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    }
  };

  return (
    <div
      class="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] sm:pt-[18vh] px-3 sm:px-0"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      {/* The backdrop covers the overlay, so outside clicks target it — close from here too. */}
      <div class="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => closeModal()} />
      <div
        class="relative w-full max-w-[min(440px,calc(100vw-1.5rem))] rounded-2xl border border-white/[0.06] bg-gray-900 shadow-2xl overflow-hidden animate-slide-down"
        style={{ 'box-shadow': '0 25px 80px rgba(0,0,0,0.5)' }}
      >
        {/* Search */}
        <div class="flex items-center gap-3 px-4 py-4 sm:py-3.5 border-b border-white/[0.04]">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="text-gray-600 shrink-0 sm:w-4 sm:h-4">
            <circle cx="6.5" cy="6.5" r="4.5" />
            <path d="M10 10l4 4" />
          </svg>
          <input
            ref={(el) => (inputRef = el)}
            type="text"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to channel..."
            class="flex-1 bg-transparent text-[15px] sm:text-[14px] text-gray-100 outline-none placeholder:text-gray-600"
          />
          <kbd class="text-[10px] font-mono text-gray-600 bg-white/[0.04] border border-white/[0.06] rounded px-1.5 py-0.5 hidden sm:inline">esc</kbd>
        </div>

        {/* Results */}
        <div ref={(el) => (listRef = el)} class="max-h-[60vh] sm:max-h-[320px] overflow-y-auto py-1">
          <Show when={items().length === 0}>
            <div class="px-4 py-8 text-center text-gray-600 text-[14px] sm:text-[13px]">No buffers match</div>
          </Show>
          <For each={items()}>
            {(item, i) => (
              <button
                onClick={() => pick(item.id)}
                onMouseEnter={() => setSelected(i())}
                class="w-full text-left px-4 py-3.5 sm:py-2.5 flex items-center gap-3 text-[15px] sm:text-[13px] transition-colors"
                classList={{
                  'bg-[var(--custom-accent,#818cf8)]/10 text-gray-100': i() === selected(),
                  'text-gray-400 hover:bg-white/[0.02]': i() !== selected(),
                }}
              >
                <BufTypeGlyph type={item.type} fullName={item.fullName} />
                <span class="truncate flex-1">{item.name}</span>
                <Show when={item.highlighted > 0}>
                  <span class="text-[10px] font-bold bg-red-500/80 text-white rounded-full px-2 py-0.5 min-w-[22px] text-center">{item.highlighted}</span>
                </Show>
                <Show when={item.unread > 0 && item.highlighted === 0}>
                  <span class="text-[10px] font-medium bg-white/[0.06] text-gray-400 rounded-full px-2 py-0.5 min-w-[22px] text-center">{item.unread}</span>
                </Show>
              </button>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}

function BufTypeGlyph(props: { type: string; fullName: string }) {
  const cls = 'text-[13px] sm:text-[11px] text-gray-600 font-mono w-5 sm:w-4 text-center shrink-0';
  const glyph = () => {
    if (props.type === 'channel') return '#';
    if (props.type === 'private') return '@';
    if (props.type === 'server') return '~';
    if (/fset/i.test(props.fullName)) return 'S';
    if (/raw/i.test(props.fullName)) return 'R';
    return '*';
  };
  return <span class={cls}>{glyph()}</span>;
}
