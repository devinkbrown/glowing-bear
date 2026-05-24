'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface TenorGif {
  id: string;
  title: string;
  url: string;
  preview: string;
  dims: [number, number];
}

interface Props {
  apiKey: string;
  onSelect: (url: string) => void;
  onClose: () => void;
}

export default function GifPicker({ apiKey, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TenorGif[]>([]);
  const [trending, setTrending] = useState<TenorGif[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (!apiKey) return;
    const ac = new AbortController();
    fetch(`https://tenor.googleapis.com/v2/featured?key=${encodeURIComponent(apiKey)}&limit=30&media_filter=gif,tinygif&contentfilter=medium`, { signal: ac.signal })
      .then(r => r.json())
      .then(data => {
        if (data.results) setTrending(mapResults(data.results));
      })
      .catch(() => {});
    return () => ac.abort();
  }, [apiKey]);

  const search = useCallback((q: string) => {
    if (!apiKey || !q.trim()) { setResults([]); return; }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    fetch(`https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(q)}&key=${encodeURIComponent(apiKey)}&limit=30&media_filter=gif,tinygif&contentfilter=medium`, { signal: ac.signal })
      .then(r => r.json())
      .then(data => {
        if (data.results) setResults(mapResults(data.results));
        setLoading(false);
      })
      .catch((err) => { if (err.name !== 'AbortError') setLoading(false); });
  }, [apiKey]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const onInput = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 350);
  };

  const gifs = query.trim() ? results : trending;

  // Close on escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 bg-gray-900 border border-white/[0.06] rounded-xl shadow-xl overflow-hidden animate-slide-down"
      style={{ maxHeight: 'min(340px, 50vh)' }}>
      {/* Search bar */}
      <div className="px-3 pt-3 pb-2 border-b border-white/[0.04]">
        <div className="flex items-center gap-2">
          <input ref={inputRef} type="text" value={query} onChange={e => onInput(e.target.value)}
            placeholder="Search GIFs..."
            className="flex-1 bg-white/[0.04] border border-white/[0.06] rounded-lg text-[13px] sm:text-[12px] text-gray-200 px-3 py-2 sm:py-1.5 outline-none focus:border-[var(--custom-accent,#818cf8)]/30 placeholder:text-gray-600 transition-colors" />
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 active:text-gray-100 transition-colors p-2 -mr-1 rounded-lg">
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
        {!query.trim() && <p className="text-[10px] text-gray-600 mt-1.5 ml-0.5">Trending</p>}
      </div>

      {/* GIF grid */}
      <div className="overflow-y-auto p-2" style={{ maxHeight: 'min(270px, calc(50vh - 70px))' }}>
        {loading && gifs.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <span className="w-4 h-4 border-2 border-gray-600 border-t-[var(--custom-accent,#818cf8)] rounded-full animate-spin" />
          </div>
        ) : gifs.length === 0 ? (
          <p className="text-gray-500 text-[12px] text-center py-8">
            {query.trim() ? 'No GIFs found' : 'Loading...'}
          </p>
        ) : (
          <div className="columns-2 sm:columns-3 gap-1.5">
            {gifs.map(gif => (
              <button key={gif.id} onClick={() => { onSelect(gif.url); onClose(); }}
                className="block w-full mb-1.5 rounded-lg overflow-hidden hover:ring-2 hover:ring-[var(--custom-accent,#818cf8)]/50 active:ring-2 active:ring-[var(--custom-accent,#818cf8)]/70 transition-all cursor-pointer break-inside-avoid">
                <img src={gif.preview} alt={gif.title} loading="lazy"
                  className="w-full block rounded-lg" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tenor attribution */}
      <div className="px-3 py-1.5 border-t border-white/[0.04] flex items-center justify-end">
        <span className="text-[9px] text-gray-600 tracking-wide">Powered by Tenor</span>
      </div>
    </div>
  );
}

function mapResults(items: Array<Record<string, unknown>>): TenorGif[] {
  return items.map((item: Record<string, unknown>) => {
    const media = item.media_formats as Record<string, { url: string; dims: number[] }> | undefined;
    const gif = media?.gif;
    const tiny = media?.tinygif;
    return {
      id: String(item.id),
      title: String(item.title ?? ''),
      url: gif?.url ?? tiny?.url ?? '',
      preview: tiny?.url ?? gif?.url ?? '',
      dims: (tiny?.dims ?? gif?.dims ?? [200, 200]) as [number, number],
    };
  }).filter(g => g.url);
}
