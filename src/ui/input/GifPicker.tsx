// Tenor GIF picker — featured (trending) view, debounced search, masonry
// grid, click-to-send. Closes on Escape or outside click.

import { createSignal, onCleanup, onMount, For, Show } from 'solid-js';
import { useClickOutside } from '@/primitives/clickOutside';

const SEARCH_DEBOUNCE_MS = 350;
const TENOR_BASE = 'https://tenor.googleapis.com/v2';
const TENOR_COMMON_PARAMS = 'limit=30&media_filter=gif,tinygif&contentfilter=medium';

interface TenorGif {
  id: string;
  title: string;
  url: string;
  preview: string;
  dims: [number, number];
}

interface TenorMediaFormat {
  url?: string;
  dims?: number[];
}

interface TenorItem {
  id?: unknown;
  title?: unknown;
  media_formats?: Record<string, TenorMediaFormat | undefined>;
}

interface TenorResponse {
  results?: TenorItem[];
}

interface GifPickerProps {
  apiKey: string;
  onSelect: (url: string) => void | Promise<void>;
  onClose: () => void;
}

function mapResults(items: TenorItem[]): TenorGif[] {
  return items
    .map((item) => {
      const gif = item.media_formats?.['gif'];
      const tiny = item.media_formats?.['tinygif'];
      return {
        id: String(item.id),
        title: String(item.title ?? ''),
        url: gif?.url ?? tiny?.url ?? '',
        preview: tiny?.url ?? gif?.url ?? '',
        dims: (tiny?.dims ?? gif?.dims ?? [200, 200]) as [number, number],
      };
    })
    .filter((gif) => gif.url);
}

export default function GifPicker(props: GifPickerProps) {
  const [query, setQuery] = createSignal('');
  const [results, setResults] = createSignal<TenorGif[]>([]);
  const [trending, setTrending] = createSignal<TenorGif[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [selecting, setSelecting] = createSignal(false);

  let rootEl: HTMLDivElement | undefined;
  let inputEl: HTMLInputElement | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let searchAbort: AbortController | null = null;

  const selectGif = async (url: string): Promise<void> => {
    if (selecting()) return;
    setSelecting(true);
    try {
      await props.onSelect(url);
    } finally {
      setSelecting(false);
    }
  };

  useClickOutside(() => rootEl, () => props.onClose());

  onMount(() => {
    inputEl?.focus();

    if (!props.apiKey) return;
    const ac = new AbortController();
    onCleanup(() => ac.abort());
    fetch(
      `${TENOR_BASE}/featured?key=${encodeURIComponent(props.apiKey)}&${TENOR_COMMON_PARAMS}`,
      { signal: ac.signal },
    )
      .then((r) => r.json() as Promise<TenorResponse>)
      .then((data) => {
        if (data.results) setTrending(mapResults(data.results));
      })
      .catch(() => {
        // Trending fetch failure is non-fatal — the empty state renders.
      });
  });

  onCleanup(() => {
    searchAbort?.abort();
    if (debounceTimer !== undefined) clearTimeout(debounceTimer);
  });

  const search = (q: string) => {
    if (!props.apiKey || !q.trim()) {
      setResults([]);
      return;
    }
    searchAbort?.abort();
    const ac = new AbortController();
    searchAbort = ac;
    setLoading(true);
    fetch(
      `${TENOR_BASE}/search?q=${encodeURIComponent(q)}&key=${encodeURIComponent(props.apiKey)}&${TENOR_COMMON_PARAMS}`,
      { signal: ac.signal },
    )
      .then((r) => r.json() as Promise<TenorResponse>)
      .then((data) => {
        if (data.results) setResults(mapResults(data.results));
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!(err instanceof DOMException && err.name === 'AbortError')) setLoading(false);
      });
  };

  const onInput = (value: string) => {
    setQuery(value);
    if (debounceTimer !== undefined) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => search(value), SEARCH_DEBOUNCE_MS);
  };

  const gifs = () => (query().trim() ? results() : trending());

  // Close on Escape
  onMount(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', handler);
    onCleanup(() => window.removeEventListener('keydown', handler));
  });

  return (
    <div
      ref={(el) => (rootEl = el)}
      class="absolute bottom-full left-0 right-0 mb-1 bg-gray-900 border border-white/[0.06] rounded-xl shadow-xl overflow-hidden animate-slide-down"
      style={{ 'max-height': 'min(340px, 50vh)' }}
    >
      {/* Search bar */}
      <div class="px-3 pt-3 pb-2 border-b border-white/[0.04]">
        <div class="flex items-center gap-2">
          <input
            ref={(el) => (inputEl = el)}
            type="text"
            value={query()}
            onInput={(e) => onInput(e.currentTarget.value)}
            placeholder="Search GIFs..."
            class="flex-1 bg-white/[0.04] border border-white/[0.06] rounded-lg text-[13px] sm:text-[12px] text-gray-200 px-3 py-2 sm:py-1.5 outline-none focus:border-[var(--custom-accent,#818cf8)]/30 placeholder:text-gray-600 transition-colors"
          />
          <button
            onClick={() => props.onClose()}
            class="text-gray-500 hover:text-gray-300 active:text-gray-100 transition-colors p-2 -mr-1 rounded-lg"
            aria-label="Close GIF picker"
          >
            <svg class="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
        <Show when={!query().trim()}>
          <p class="text-[10px] text-gray-600 mt-1.5 ml-0.5">Trending</p>
        </Show>
      </div>

      {/* GIF grid */}
      <div class="overflow-y-auto p-2" style={{ 'max-height': 'min(270px, calc(50vh - 70px))' }}>
        <Show
          when={!(loading() && gifs().length === 0)}
          fallback={
            <div class="flex items-center justify-center py-8">
              <span class="w-4 h-4 border-2 border-gray-600 border-t-[var(--custom-accent,#818cf8)] rounded-full animate-spin" />
            </div>
          }
        >
          <Show
            when={gifs().length > 0}
            fallback={
              <p class="text-gray-500 text-[12px] text-center py-8">
                {query().trim() ? 'No GIFs found' : 'Loading...'}
              </p>
            }
          >
            <div class="columns-2 sm:columns-3 gap-1.5">
              <For each={gifs()}>
                {(gif) => (
                  <button
                    disabled={selecting()}
                    onClick={() => { void selectGif(gif.url); }}
                    class="block w-full mb-1.5 rounded-lg overflow-hidden hover:ring-2 hover:ring-[var(--custom-accent,#818cf8)]/50 active:ring-2 active:ring-[var(--custom-accent,#818cf8)]/70 transition-all cursor-pointer break-inside-avoid"
                  >
                    <img src={gif.preview} alt={gif.title} loading="lazy" class="w-full block rounded-lg" />
                  </button>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>

      {/* Tenor attribution */}
      <div class="px-3 py-1.5 border-t border-white/[0.04] flex items-center justify-end">
        <span class="text-[9px] text-gray-600 tracking-wide">Powered by Tenor</span>
      </div>
    </div>
  );
}
