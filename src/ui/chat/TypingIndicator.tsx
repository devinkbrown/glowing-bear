// TypingIndicator — "X is typing" line with bouncing dots, fed by the
// buffer's typing record (nick → { state, expiry }). Expired entries are
// pruned via buffers.pruneTyping on a 3 s interval while anyone is typing.

import { createEffect, createMemo, createSignal, on, onCleanup, Show } from 'solid-js';
import { buffersState, pruneTyping } from '@/state';

export interface TypingIndicatorProps {
  bufferPtr: string;
}

const PRUNE_INTERVAL_MS = 3000;
const DOT_CLASS = 'w-[4px] h-[4px] rounded-full bg-[var(--custom-accent,#818cf8)]/50 animate-bounce';

export default function TypingIndicator(props: TypingIndicatorProps) {
  const entry = () => buffersState.buffers[props.bufferPtr];
  // Re-evaluation clock so expiry filtering advances between store updates.
  const [now, setNow] = createSignal(Date.now());

  // Prune once whenever the target buffer changes.
  createEffect(on(() => props.bufferPtr, (ptr) => pruneTyping(ptr)));

  const hasTypers = createMemo(() => Object.keys(entry()?.typing ?? {}).length > 0);

  // While anyone is typing, prune + re-tick every 3 s.
  createEffect(() => {
    if (!hasTypers()) return;
    const ptr = props.bufferPtr;
    const id = setInterval(() => {
      pruneTyping(ptr);
      setNow(Date.now());
    }, PRUNE_INTERVAL_MS);
    onCleanup(() => clearInterval(id));
  });

  const typers = createMemo(() => {
    const e = entry();
    if (!e) return [] as string[];
    const t = now();
    return Object.entries(e.typing)
      .filter(([, info]) => info.state === 'active' && info.expiry > t)
      .map(([nick]) => nick);
  });

  const text = createMemo(() => {
    const list = typers();
    if (list.length === 1) return `${list[0]} is typing`;
    if (list.length === 2) return `${list[0]} and ${list[1]} are typing`;
    return `${list[0]} and ${list.length - 1} others are typing`;
  });

  return (
    <Show when={typers().length > 0}>
      <div class="px-3 sm:px-4 py-1 text-[11px] text-gray-600 flex items-center gap-2 animate-fade-in">
        <span class="flex gap-[3px]">
          <span class={DOT_CLASS} style={{ 'animation-delay': '0ms' }} />
          <span class={DOT_CLASS} style={{ 'animation-delay': '150ms' }} />
          <span class={DOT_CLASS} style={{ 'animation-delay': '300ms' }} />
        </span>
        <span class="truncate">{text()}</span>
      </div>
    </Show>
  );
}
