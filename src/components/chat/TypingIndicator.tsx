'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/stores';

export default function TypingIndicator() {
  const activeBuffer = useStore(s => s.activeBuffer);
  const buffers = useStore(s => s.buffers);
  const pruneTyping = useStore(s => s.pruneTyping);
  const [, tick] = useState(0);

  const entry = activeBuffer ? buffers.get(activeBuffer) : null;
  const hasTypers = entry ? entry.typing.size > 0 : false;

  useEffect(() => {
    if (!activeBuffer) return;
    pruneTyping(activeBuffer);
  }, [activeBuffer, pruneTyping]);

  useEffect(() => {
    if (!hasTypers || !activeBuffer) return;
    const id = setInterval(() => {
      pruneTyping(activeBuffer);
      tick(t => t + 1);
    }, 3000);
    return () => clearInterval(id);
  }, [hasTypers, activeBuffer, pruneTyping]);

  if (!entry) return null;

  const typers = [...entry.typing.entries()]
    .filter(([, t]) => t.state === 'active' && t.expiry > Date.now())
    .map(([nick]) => nick);

  if (typers.length === 0) return null;

  const text =
    typers.length === 1 ? `${typers[0]} is typing` :
    typers.length === 2 ? `${typers[0]} and ${typers[1]} are typing` :
    `${typers[0]} and ${typers.length - 1} others are typing`;

  return (
    <div className="px-3 sm:px-4 py-1 text-[11px] text-gray-600 flex items-center gap-2 animate-fade-in">
      <span className="flex gap-[3px]">
        <span className="w-[4px] h-[4px] rounded-full bg-indigo-400/50 animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-[4px] h-[4px] rounded-full bg-indigo-400/50 animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-[4px] h-[4px] rounded-full bg-indigo-400/50 animate-bounce" style={{ animationDelay: '300ms' }} />
      </span>
      <span className="truncate">{text}</span>
    </div>
  );
}
