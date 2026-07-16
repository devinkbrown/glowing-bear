import { For, onCleanup, onMount, Show, createSignal, createUniqueId } from 'solid-js';
import {
  activityState,
  activityUnreadCount,
  buffersState,
  clearActivity,
  closeActivityPanel,
  markActivityRead,
  removeSavedMessage,
  requestScrollToMessage,
  setActive,
  setActivityTab,
  updateSavedNote,
} from '@/state';
import type { ActivityItem, MessageSource } from '@/state/activity';
import { isImeComposing } from '@/primitives/ime';
import { createMediaQuery } from '@/primitives/mediaQuery';
import { activateOverlayFocus } from '@/primitives/overlayFocus';

type ActivityTab = 'activity' | 'saved';
const ACTIVITY_TABS: readonly ActivityTab[] = ['activity', 'saved'];

function age(timestamp: number): string {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
}

function kindLabel(kind: ActivityItem['kind']): string {
  return kind === 'dm' ? 'Direct message' : kind[0]!.toUpperCase() + kind.slice(1);
}

export default function ActivityPanel() {
  const isDesktop = createMediaQuery('(min-width: 1024px)');
  const [status, setStatus] = createSignal('');
  let closeButton: HTMLButtonElement | undefined;
  let backdrop: HTMLButtonElement | undefined;
  let panel: HTMLElement | undefined;
  const tabGroupId = createUniqueId();
  const tabRefs: Partial<Record<ActivityTab, HTMLButtonElement>> = {};

  const tabId = (tab: ActivityTab): string => `${tabGroupId}-tab-${tab}`;
  const panelId = (tab: ActivityTab): string => `${tabGroupId}-panel-${tab}`;
  const selectTab = (tab: ActivityTab, focus = false): void => {
    setActivityTab(tab);
    if (focus) queueMicrotask(() => tabRefs[tab]?.focus());
  };
  const onTabKeyDown = (
    current: ActivityTab,
    event: KeyboardEvent & { currentTarget: HTMLButtonElement },
  ): void => {
    if (isImeComposing(event)) return;
    const index = ACTIVITY_TABS.indexOf(current);
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl'
      || document.documentElement.dir === 'rtl';
    let nextIndex: number | undefined;
    if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = ACTIVITY_TABS.length - 1;
    else if (event.key === 'ArrowLeft') nextIndex = index + (rtl ? 1 : -1);
    else if (event.key === 'ArrowRight') nextIndex = index + (rtl ? -1 : 1);
    if (nextIndex === undefined) return;
    event.preventDefault();
    const wrapped = (nextIndex + ACTIVITY_TABS.length) % ACTIVITY_TABS.length;
    selectTab(ACTIVITY_TABS[wrapped]!, true);
  };

  const close = () => closeActivityPanel();
  const jump = (source: MessageSource) => {
    if (!source.bufferKey || (!source.msgid && !source.lineId)) {
      setStatus('This event has no timeline source.');
      return;
    }
    const entry = Object.values(buffersState.buffers).find((candidate) =>
      (candidate.buffer.fullName || candidate.buffer.name) === source.bufferKey,
    );
    if (!entry) {
      setStatus('Source unavailable: its buffer is not connected.');
      return;
    }
    const target = source.msgid ? entry.msgIndex[source.msgid] : entry.lines.find((line) => line.id === source.lineId);
    if (!target) {
      setStatus('Source expired from loaded history or the selected archive retention window.');
      return;
    }
    setActive(entry.buffer.id);
    if (target.msgid) requestScrollToMessage(target.msgid);
    setStatus('Jumped to source.');
    if (!isDesktop()) close();
  };

  onMount(() => {
    if (!panel) return;
    const deactivate = activateOverlayFocus({
      panel,
      backdrop,
      initialFocus: closeButton,
      onDismiss: close,
    });
    onCleanup(deactivate);
  });

  return (
    <>
      <button ref={(el) => (backdrop = el)} type="button" aria-label="Close activity" aria-hidden="true" tabindex="-1" onClick={close}
        class="fixed inset-0 z-40 hidden bg-black/70 backdrop-blur-sm max-lg:block" />
      <aside ref={(el) => (panel = el)} role="dialog" aria-modal="true" tabindex="-1" aria-label="Activity and saved messages"
        class="fixed inset-x-0 bottom-0 z-50 flex h-[min(78dvh,720px)] flex-col overflow-hidden rounded-t-3xl border-t border-white/[0.08] bg-gray-950/98 lg:static lg:z-10 lg:h-full lg:w-[360px] lg:shrink-0 lg:rounded-none lg:border-l lg:border-t-0 lg:bg-gray-950/92">
        <header class="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <div>
            <p class="text-[9px] font-black uppercase tracking-[0.18em] text-gray-600">Your local view</p>
            <h2 class="text-[15px] font-black text-gray-100">Activity</h2>
          </div>
          <button ref={(el) => (closeButton = el)} type="button" aria-label="Close activity panel" onClick={close}
            class="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.035] text-gray-500 hover:text-gray-200">✕</button>
        </header>
        <div role="tablist" aria-label="Activity views" aria-orientation="horizontal"
          class="grid grid-cols-2 gap-1 border-b border-white/[0.06] p-2">
          <button ref={(element) => { tabRefs.activity = element; }} id={tabId('activity')}
            type="button" role="tab" aria-selected={activityState.tab === 'activity'} aria-controls={panelId('activity')}
            tabindex={activityState.tab === 'activity' ? 0 : -1}
            onClick={() => selectTab('activity')} onKeyDown={(event) => onTabKeyDown('activity', event)}
            class="rounded-xl px-3 py-2 text-[11px] font-black" classList={{ 'bg-white/[0.08] text-gray-100': activityState.tab === 'activity', 'text-gray-500': activityState.tab !== 'activity' }}>
            Inbox {activityUnreadCount() > 0 ? `(${activityUnreadCount()})` : ''}
          </button>
          <button ref={(element) => { tabRefs.saved = element; }} id={tabId('saved')}
            type="button" role="tab" aria-selected={activityState.tab === 'saved'} aria-controls={panelId('saved')}
            tabindex={activityState.tab === 'saved' ? 0 : -1}
            onClick={() => selectTab('saved')} onKeyDown={(event) => onTabKeyDown('saved', event)}
            class="rounded-xl px-3 py-2 text-[11px] font-black" classList={{ 'bg-white/[0.08] text-gray-100': activityState.tab === 'saved', 'text-gray-500': activityState.tab !== 'saved' }}>
            Saved ({activityState.saved.length})
          </button>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto p-3">
          <section id={panelId('activity')} role="tabpanel" aria-labelledby={tabId('activity')}
            hidden={activityState.tab !== 'activity'}>
            <div class="mb-2 flex justify-end gap-3">
              <button type="button" onClick={() => markActivityRead()} class="text-[9px] font-bold text-gray-500 hover:text-gray-200">Mark all read</button>
              <button type="button" onClick={clearActivity} class="text-[9px] font-bold text-red-300">Clear</button>
            </div>
            <Show when={activityState.items.length > 0} fallback={<Empty text="No mentions, replies, DMs, calls, or operator alerts yet." />}>
              <div class="space-y-2">
                <For each={activityState.items}>{(item) => (
                  <button type="button" onClick={() => { markActivityRead(item.id); jump(item); }}
                    class="block w-full rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3 text-left" classList={{ 'border-[var(--custom-accent,#818cf8)]/25': item.unread }}>
                    <div class="flex items-center justify-between gap-2 text-[9px]">
                      <span class="font-black uppercase tracking-wide text-[var(--custom-accent,#818cf8)]">{kindLabel(item.kind)}</span><span class="text-gray-600">{age(item.timestamp)}</span>
                    </div>
                    <p class="mt-1 truncate text-[10px] font-bold text-gray-500">{item.bufferName} · {item.sender}</p>
                    <p class="mt-1 line-clamp-2 text-[12px] text-gray-200">{item.preview}</p>
                  </button>
                )}</For>
              </div>
            </Show>
          </section>
          <section id={panelId('saved')} role="tabpanel" aria-labelledby={tabId('saved')}
            hidden={activityState.tab !== 'saved'}>
            <Show when={activityState.saved.length > 0} fallback={<Empty text="No saved messages in the current archive window." />}>
              <div class="space-y-2">
                <For each={activityState.saved}>{(item) => (
                  <article class="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3">
                    <div class="flex items-center justify-between gap-2 text-[9px] text-gray-600">
                      <span class="truncate font-black uppercase tracking-wide">{item.bufferName} · {item.sender}</span><span>{age(item.timestamp)}</span>
                    </div>
                    <p class="mt-1 break-words text-[12px] text-gray-200">{item.preview}</p>
                    <input aria-label={`Note for ${item.preview}`} value={item.note} placeholder="Add a private note…"
                      onChange={(event) => updateSavedNote(item.id, event.currentTarget.value)}
                      class="mt-2 w-full rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-1.5 text-[10px] text-gray-300 outline-none" />
                    <div class="mt-2 flex justify-end gap-2">
                      <button type="button" onClick={() => jump(item)} class="text-[10px] font-bold text-gray-400 hover:text-gray-100">Jump</button>
                      <button type="button" onClick={() => removeSavedMessage(item.id)} class="text-[10px] font-bold text-red-300">Remove</button>
                    </div>
                  </article>
                )}</For>
              </div>
            </Show>
          </section>
        </div>
        <Show when={status()}><p role="status" class="border-t border-white/[0.06] px-4 py-2 text-[10px] text-gray-500">{status()}</p></Show>
      </aside>
    </>
  );
}

function Empty(props: { text: string }) {
  return <p class="rounded-2xl border border-dashed border-white/[0.07] px-4 py-8 text-center text-[11px] text-gray-600">{props.text}</p>;
}
