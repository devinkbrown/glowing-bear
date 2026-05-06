'use client';

import type { Reaction } from '@/types';

interface Props {
  reactions: Reaction[];
  onReact?: (emoji: string) => void;
}

export default function ReactionBar({ reactions, onReact }: Props) {
  if (reactions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-0.5 ml-[76px]">
      {reactions.map(r => (
        <button key={r.emoji}
          onClick={() => onReact?.(r.emoji)}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/5 border border-white/8 hover:bg-white/10 transition-colors text-[12px]"
          title={r.nicks.join(', ')}>
          <span>{r.emoji}</span>
          <span className="text-gray-400 text-[11px]">{r.nicks.length}</span>
        </button>
      ))}
    </div>
  );
}
