// ThreadPanel — an optional derived view over the canonical relay timeline.
//
// It never owns a second message collection: root/reply membership is rebuilt
// from the active buffer's msgid and reply-parent links. A stable buffer name
// keeps the selection alive across relay pointer churn, while missing roots are
// fetched in bounded absolute-history stages and centered by buffers.addLines.

import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import type { BufferEntry, WeeChatLine } from '@/types';
import {
  buffersState,
  historyReceipt,
  requestHistoryTotal,
  sendTo,
  setActive,
} from '@/state';
import { sendReply } from '@/core/bridge';
import { stripFormatting } from '@/lib/irc-classic/formatter';
import { createMediaQuery } from '@/primitives/mediaQuery';
import {
  buildThreadView,
  closeThread,
  markThreadRead,
  openThread,
  requestScrollToMessage,
  resolveThreadRoot,
  threadReadThroughFor,
  threadsState,
  threadUnreadCount,
} from '@/state/threads';
import { formatDate, formatNumber, t } from '@/lib/i18n';
import { isImeComposing } from '@/primitives/ime';
import { activateOverlayFocus } from '@/primitives/overlayFocus';

const HISTORY_PAGE = 500;
const HISTORY_ATTEMPTS = 9;
const HISTORY_MAX_TOTAL = 100_000;

function stableKey(entry: BufferEntry): string {
  return entry.buffer.fullName || entry.buffer.name;
}

function plainMessage(line: WeeChatLine): string {
  return stripFormatting(line.message).trim();
}

function timeLabel(line: WeeChatLine): string {
  return formatDate(line.date, { hour: '2-digit', minute: '2-digit' });
}

export default function ThreadPanel() {
  const isDesktop = createMediaQuery('(min-width: 1024px)');
  const [draft, setDraft] = createSignal('');
  const [historyExhausted, setHistoryExhausted] = createSignal(false);
  let closeButton: HTMLButtonElement | undefined;
  let backdrop: HTMLButtonElement | undefined;
  let panel: HTMLElement | undefined;
  let fetchKey = '';
  let fetchAttempts = 0;
  let requestedTotal = 0;
  let receiptNonce = 0;

  const selection = () => threadsState.activeThread;
  const entry = createMemo<BufferEntry | undefined>(() => {
    const selected = selection();
    if (!selected) return undefined;
    const direct = buffersState.buffers[selected.bufferPtr];
    if (direct && stableKey(direct) === selected.bufferKey) return direct;
    return Object.values(buffersState.buffers).find((candidate) => stableKey(candidate) === selected.bufferKey);
  });
  const view = createMemo(() => {
    const selected = selection();
    return buildThreadView(entry()?.lines ?? [], selected?.rootMsgid ?? '');
  });
  const readThrough = () => {
    const selected = selection();
    return selected ? threadReadThroughFor(selected.bufferKey, selected.rootMsgid) : undefined;
  };
  const unread = createMemo(() => threadUnreadCount(view(), readThrough()));

  const dismiss = () => {
    const selected = selection();
    if (selected && view().latestTimestamp > 0) {
      markThreadRead(selected.bufferKey, selected.rootMsgid, view().latestTimestamp);
    }
    closeThread();
  };

  const jumpTo = (msgid: string | undefined) => {
    const current = entry();
    if (!current || !msgid) return;
    setActive(current.buffer.id);
    requestScrollToMessage(msgid);
    if (!isDesktop()) dismiss();
  };

  const submit = () => {
    const text = draft().trim();
    const selected = selection();
    const current = entry();
    if (!text || !selected || !current) return;
    const sent = sendReply(current.buffer.id, text, selected.rootMsgid)
      || sendTo(current.buffer.id, text);
    if (!sent) return;
    setDraft('');
  };

  // Missing-parent loading is deliberately user-triggered and bounded. Each
  // absolute request doubles until the root appears, the relay reports fewer
  // lines than requested (history exhausted), or the 100k safety limit lands.
  createEffect(() => {
    const selected = selection();
    const current = entry();
    const root = view().root;
    const receipt = historyReceipt();
    if (!selected) return;
    const key = `${selected.bufferKey}\0${selected.rootMsgid}`;
    if (key !== fetchKey) {
      fetchKey = key;
      fetchAttempts = 0;
      requestedTotal = 0;
      receiptNonce = receipt.nonce;
      setHistoryExhausted(false);
    }
    if (root?.replyTo && current) {
      const resolved = resolveThreadRoot(root, current.msgIndex);
      if (resolved && resolved !== selected.rootMsgid) {
        openThread(current.buffer.id, selected.bufferKey, resolved);
        return;
      }
    }
    if (root || !current || current.loading || historyExhausted()) return;
    if (
      requestedTotal > 0 &&
      receipt.nonce > receiptNonce &&
      receipt.bufferPtr === current.buffer.id
    ) {
      receiptNonce = receipt.nonce;
      if (receipt.returnedCount < requestedTotal) {
        setHistoryExhausted(true);
        return;
      }
    }
    if (fetchAttempts >= HISTORY_ATTEMPTS || requestedTotal >= HISTORY_MAX_TOTAL) {
      setHistoryExhausted(true);
      return;
    }
    const loaded = current.lines.filter((line) => !line.id.startsWith('_opt_')).length;
    requestedTotal = requestedTotal === 0
      ? Math.min(HISTORY_MAX_TOTAL, loaded + HISTORY_PAGE)
      : Math.min(HISTORY_MAX_TOTAL, Math.max(requestedTotal + HISTORY_PAGE, requestedTotal * 2));
    fetchAttempts += 1;
    receiptNonce = receipt.nonce;
    requestHistoryTotal(requestedTotal, current.buffer.id);
  });

  onMount(() => {
    if (!panel) return;
    const deactivate = activateOverlayFocus({
      panel,
      backdrop,
      initialFocus: closeButton,
      onDismiss: dismiss,
    });
    onCleanup(deactivate);
  });

  return (
    <>
      <button
        ref={(element) => (backdrop = element)}
        type="button"
        aria-label={t('thread.closeBackdrop')}
        aria-hidden="true"
        tabindex="-1"
        class="fixed inset-0 z-40 hidden bg-black/70 backdrop-blur-sm max-lg:block"
        onClick={dismiss}
      />
      <aside
        ref={(element) => (panel = element)}
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        aria-label={t('thread.label')}
        class="thread-panel fixed inset-x-0 bottom-0 z-50 flex h-[min(78dvh,720px)] min-h-0 flex-col overflow-hidden rounded-t-3xl border-t border-white/[0.08] bg-gray-950/98 shadow-2xl lg:static lg:z-10 lg:h-full lg:w-[360px] lg:shrink-0 lg:rounded-none lg:border-l lg:border-t-0 lg:bg-gray-950/92"
      >
        <header class="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
          <div class="min-w-0">
            <p class="text-[9px] font-black uppercase tracking-[0.18em] text-gray-600">{t('thread.conversation')}</p>
            <div class="mt-0.5 flex items-center gap-2">
              <h2 class="text-[15px] font-black tracking-tight text-gray-100">{t('thread.title')}</h2>
              <Show when={unread() > 0} fallback={<span class="text-[9px] font-semibold text-gray-600">{t('thread.upToDate')}</span>}>
                <span class="rounded-full bg-[var(--custom-accent,#818cf8)]/15 px-2 py-0.5 text-[9px] font-black text-[var(--custom-accent,#818cf8)]">
                  {t('thread.unread', { count: formatNumber(unread()) })}
                </span>
              </Show>
            </div>
          </div>
          <button
            ref={(element) => (closeButton = element)}
            type="button"
            aria-label={t('thread.close')}
            class="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.035] text-gray-500 hover:text-gray-200 hover:bg-white/[0.06]"
            onClick={dismiss}
          >
            <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <Show when={entry()} fallback={
            <div class="rounded-2xl border border-white/[0.06] bg-white/[0.025] px-4 py-6 text-center text-[11px] text-gray-500">
              {t('thread.waitingReconnect')}
            </div>
          }>
            <Show when={view().root} fallback={
              <div class="rounded-2xl border border-amber-500/15 bg-amber-500/[0.04] px-4 py-4">
                <p class="text-[11px] font-bold text-amber-200/80">
                  {historyExhausted() ? t('thread.rootUnavailable') : t('thread.loadingRoot')}
                </p>
                <p class="mt-1 text-[10px] leading-relaxed text-gray-600">
                  {t('thread.loadedReplies')}
                </p>
              </div>
            }>
              {(root) => (
                <ThreadMessage line={root()} root onJump={() => jumpTo(root().msgid)} />
              )}
            </Show>

            <div class="my-3 flex items-center gap-2 px-1">
              <span class="h-px flex-1 bg-white/[0.06]" />
              <span class="text-[9px] font-black uppercase tracking-[0.14em] text-gray-600">
                {t(view().replies.length === 1 ? 'thread.replyCount' : 'thread.repliesCount', {
                  count: formatNumber(view().replies.length),
                })}
                {' · '}
                {t(view().participants.length === 1 ? 'thread.participantCount' : 'thread.participantsCount', {
                  count: formatNumber(view().participants.length),
                })}
              </span>
              <span class="h-px flex-1 bg-white/[0.06]" />
            </div>

            <Show when={view().replies.length > 0} fallback={
              <p class="rounded-2xl border border-dashed border-white/[0.07] px-4 py-6 text-center text-[11px] text-gray-600">
                {t('thread.noReplies')}
              </p>
            }>
              <div class="space-y-2">
                <For each={view().replies}>
                  {(reply) => <ThreadMessage line={reply} onJump={() => jumpTo(reply.msgid)} />}
                </For>
              </div>
            </Show>
          </Show>
        </div>

        <footer class="shrink-0 border-t border-white/[0.06] bg-gray-950/95 p-3">
          <label class="sr-only" for="thread-composer">{t('thread.reply')}</label>
          <div class="flex items-end gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-2 focus-within:border-[var(--custom-accent,#818cf8)]/35">
            <textarea
              id="thread-composer"
              value={draft()}
              rows={1}
              placeholder={t('thread.replyPlaceholder')}
              class="max-h-28 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-[12px] leading-relaxed text-gray-100 outline-none placeholder:text-gray-600"
              onInput={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (isImeComposing(event)) return;
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
            />
            <button
              type="button"
              aria-label={t('thread.send')}
              disabled={!draft().trim() || !entry()}
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--custom-accent,#818cf8)] text-white transition-all hover:brightness-110 active:scale-95 disabled:opacity-30"
              onClick={submit}
            >
              <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 2.5l12 5.5-12 5.5 2-5.5zM4 8h10" />
              </svg>
            </button>
          </div>
          <p class="mt-1.5 px-1 text-[9px] text-gray-700">{t('thread.footer')}</p>
        </footer>
      </aside>
    </>
  );
}

function ThreadMessage(props: { line: WeeChatLine; root?: boolean; onJump: () => void }) {
  return (
    <article
      data-thread-message={props.line.msgid ?? props.line.id}
      class="rounded-2xl border border-white/[0.06] bg-white/[0.025] px-3 py-2.5"
      classList={{ 'border-[var(--custom-accent,#818cf8)]/20 bg-[var(--custom-accent,#818cf8)]/[0.045]': props.root }}
    >
      <div class="flex items-center justify-between gap-2">
        <div class="min-w-0">
          <span class="truncate text-[11px] font-black text-gray-300">{props.line.nick || t('thread.server')}</span>
          <Show when={props.root}><span class="ml-1.5 text-[8px] font-black uppercase tracking-[0.12em] text-[var(--custom-accent,#818cf8)]">{t('thread.root')}</span></Show>
        </div>
        <button type="button" onClick={() => props.onJump()} class="shrink-0 text-[9px] font-semibold text-gray-600 hover:text-gray-300">
          {timeLabel(props.line)} · {t('thread.jump')}
        </button>
      </div>
      <p class="mt-1 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-gray-200">{plainMessage(props.line)}</p>
    </article>
  );
}
