'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useStore } from '@/stores';

interface Props {
  onClose: () => void;
}

export default function BufferSwitcher({ onClose }: Props) {
  const buffers = useStore(s => s.buffers);
  const setActiveBuffer = useStore(s => s.setActiveBuffer);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => {
    const all = [...buffers.entries()]
      .filter(([, e]) => !e.buffer.hidden)
      .map(([id, e]) => ({
        id,
        name: e.buffer.shortName || e.buffer.name,
        fullName: e.buffer.fullName,
        type: e.buffer.localVars['type'] ?? '',
        unread: e.unread,
        highlighted: e.highlighted,
      }));

    if (!query.trim()) return all;
    const q = query.toLowerCase();
    return all
      .filter(b => b.name.toLowerCase().includes(q) || b.fullName.toLowerCase().includes(q))
      .sort((a, b) => {
        const aStart = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bStart = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        if (aStart !== bStart) return aStart - bStart;
        return a.name.length - b.name.length;
      });
  }, [buffers, query]);

  useEffect(() => { setSelected(0); }, [query]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Scroll selected into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.children[selected] as HTMLElement;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  function pick(id: string) {
    setActiveBuffer(id);
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[selected]) pick(items[selected].id); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] sm:pt-[18vh] px-3 sm:px-0"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" />
      <div className="relative w-full max-w-[440px] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-white/[0.06] bg-gray-900 shadow-2xl overflow-hidden animate-slide-down"
        style={{ boxShadow: '0 25px 80px rgba(0,0,0,0.5)' }}>

        {/* Search */}
        <div className="flex items-center gap-3 px-4 py-4 sm:py-3.5 border-b border-white/[0.04]">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-gray-600 shrink-0 sm:w-4 sm:h-4">
            <circle cx="6.5" cy="6.5" r="4.5" /><path d="M10 10l4 4" />
          </svg>
          <input ref={inputRef} type="text" value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown} placeholder="Jump to channel..."
            className="flex-1 bg-transparent text-[15px] sm:text-[14px] text-gray-100 outline-none placeholder:text-gray-600" />
          <kbd className="text-[10px] font-mono text-gray-600 bg-white/[0.04] border border-white/[0.06] rounded px-1.5 py-0.5 hidden sm:inline">esc</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[60vh] sm:max-h-[320px] overflow-y-auto py-1">
          {items.length === 0 && (
            <div className="px-4 py-8 text-center text-gray-600 text-[14px] sm:text-[13px]">No buffers match</div>
          )}
          {items.map((item, i) => (
            <button key={item.id} onClick={() => pick(item.id)}
              onMouseEnter={() => setSelected(i)}
              className={`w-full text-left px-4 py-3.5 sm:py-2.5 flex items-center gap-3 text-[15px] sm:text-[13px] transition-colors
                ${i === selected ? 'bg-indigo-500/10 text-indigo-200' : 'text-gray-400 hover:bg-white/[0.02]'}`}>
              <span className="text-[13px] sm:text-[11px] text-gray-600 font-mono w-5 sm:w-4 text-center shrink-0">
                {item.type === 'channel' ? '#' : item.type === 'private' ? '@' : '*'}
              </span>
              <span className="truncate flex-1">{item.name}</span>
              {item.highlighted > 0 && (
                <span className="text-[10px] font-bold bg-red-500/80 text-white rounded-full px-2 py-0.5 min-w-[22px] text-center">{item.highlighted}</span>
              )}
              {item.unread > 0 && !item.highlighted && (
                <span className="text-[10px] font-medium bg-white/[0.06] text-gray-400 rounded-full px-2 py-0.5 min-w-[22px] text-center">{item.unread}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
