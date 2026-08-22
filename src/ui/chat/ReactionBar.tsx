// ReactionBar — emoji reaction pills under a message line. Each pill shows
// the emoji + reactor count with the reactor nicks as a tooltip; clicking a
// pill sends the same reaction through the onyx-server bridge.

import { For, Show } from 'solid-js';
import type { Reaction } from '@/types';
import { sendReactionTag } from '@/state/bridge';

export interface ReactionBarProps {
  bufferPtr: string;
  msgid: string;
  reactions: Reaction[];
}

export default function ReactionBar(props: ReactionBarProps) {
  return (
    <Show when={props.reactions.length > 0}>
      <div class="flex flex-wrap gap-1 mt-0.5 px-3 sm:px-0 sm:ml-[170px]">
        <For each={props.reactions}>
          {(reaction) => (
            <button
              onClick={() => sendReactionTag(props.bufferPtr, props.msgid, reaction.emoji)}
              class="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/5 border border-white/[0.08] hover:bg-white/10 active:scale-95 transition-all text-[12px]"
              title={reaction.nicks.join(', ')}
            >
              <span>{reaction.emoji}</span>
              <span class="text-gray-400 text-[11px] tabular-nums">{reaction.nicks.length}</span>
            </button>
          )}
        </For>
      </div>
    </Show>
  );
}
