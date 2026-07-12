// Message input bar — textarea with auto-resize, per-buffer drafts, input
// history, tab completion, IRC formatting shortcuts, uploads, GIF picker,
// typing notifications, and the E2EE DM send path.

import { createEffect, createSignal, lazy, onCleanup, untrack, Show, Suspense } from 'solid-js';
import {
  buffersState,
  completionState,
  draftsState,
  getDraft,
  setDraft,
  clearDraft,
  pushHistory,
  flushDrafts,
  complete,
  cycleCompletion,
  resetCompletion,
  sendInput,
  settings,
} from '@/state';
import type { BridgeSettings, BufferEntry } from '@/state';
import { sendTyping, canE2ee, sendE2eeDm } from '@/state/bridge';
import { pendingReplyFor, clearPendingReply } from '@/state/threads';
import { sendReply } from '@/core/bridge';
import { bufferKind } from '@/lib/bufferKind';
import { uploadFile, UploadError } from '@/lib/upload/upload';
// GifPicker is only mounted when the user opens the picker (Show gate below), so
// defer its chunk off the first-paint fetch — the static import pulled the
// ~28kB gif-picker chunk eagerly on boot even though it is on-demand UI.
const GifPicker = lazy(() => import('./GifPicker'));

const MIN_INPUT_HEIGHT = 44;
const MAX_INPUT_HEIGHT = 160;
const SUBMIT_DEBOUNCE_MS = 300;
const TYPING_ACTIVE_THROTTLE_MS = 3000;
const TYPING_PAUSE_DELAY_MS = 5000;
/** Ignore a GIF-button toggle that lands right after an outside-click close. */
const GIF_REOPEN_GUARD_MS = 250;

const IRC_BOLD = '\x02';
const IRC_ITALIC = '\x1d';
const IRC_UNDERLINE = '\x1f';

interface PastePreview {
  file: File;
  dataUrl: string;
}

function inputPlaceholder(entry: BufferEntry | undefined): string {
  if (!entry) return '';
  switch (bufferKind(entry.buffer)) {
    case 'raw': return 'Raw log (read-only)';
    case 'fset': return '/fset filter or command...';
    case 'core': return 'WeeChat command...';
    case 'plugin': return 'Command...';
    default: return 'Message...';
  }
}

/**
 * The e2eeDms preference is added to BridgeSettings by the bridge module;
 * read it defensively so this component is valid against the base type too.
 */
function e2eeDmsEnabled(): boolean {
  const bridge = settings.bridge as BridgeSettings & { e2eeDms?: boolean };
  return bridge.e2eeDms === true;
}

export default function InputBar() {
  const [text, setText] = createSignal('');
  const [historyIdx, setHistoryIdx] = createSignal(-1);
  const [showGif, setShowGif] = createSignal(false);
  const [uploading, setUploading] = createSignal(false);
  const [uploadError, setUploadError] = createSignal<string | null>(null);
  const [pastePreview, setPastePreview] = createSignal<PastePreview | null>(null);
  const [focused, setFocused] = createSignal(false);

  let inputEl: HTMLTextAreaElement | undefined;
  let fileEl: HTMLInputElement | undefined;
  let wrapperEl: HTMLDivElement | undefined;

  let lastSubmitTime = 0;
  let gifDismissedAt = 0;

  const activeBuffer = () => buffersState.activeBuffer;
  const activeEntry = () => {
    const ptr = activeBuffer();
    return ptr ? buffersState.buffers[ptr] : undefined;
  };
  const hasText = () => text().trim().length > 0;

  /** The active buffer's pending reply target (reactive store read), if any. */
  const replyTarget = () => {
    const ptr = activeBuffer();
    return ptr ? pendingReplyFor(ptr) : undefined;
  };

  const cancelReply = () => {
    const ptr = activeBuffer();
    if (ptr) clearPendingReply(ptr);
    inputEl?.focus();
  };

  /**
   * Stable per-buffer draft key. Drafts persist by buffer NAME (not the WeeChat
   * pointer, which changes across reconnect/reload) so an unsent draft survives
   * a reload — matching the db-* pin/mute persistence convention.
   */
  const draftKeyFor = (entry: BufferEntry | undefined): string | null =>
    entry ? (entry.buffer.fullName || entry.buffer.name) : null;
  const activeDraftKey = (): string | null => draftKeyFor(activeEntry());

  // -------------------------------------------------------------------------
  // Typing notifications (bridge no-ops when it is off)
  // -------------------------------------------------------------------------

  let typingPtr: string | null = null;
  let lastTypingSent = 0;
  let pauseTimer: ReturnType<typeof setTimeout> | undefined;

  function stopTyping(state: 'paused' | 'done'): void {
    if (pauseTimer !== undefined) {
      clearTimeout(pauseTimer);
      pauseTimer = undefined;
    }
    if (typingPtr) {
      sendTyping(typingPtr, state);
      typingPtr = null;
    }
    lastTypingSent = 0;
  }

  function noteTyping(value: string): void {
    const ptr = activeBuffer();
    if (!ptr) return;
    // Cleared input, or a slash command being typed: not a message in flight.
    if (!value.trim() || value.startsWith('/')) {
      stopTyping('done');
      return;
    }
    if (typingPtr && typingPtr !== ptr) stopTyping('done');
    const now = Date.now();
    if (now - lastTypingSent >= TYPING_ACTIVE_THROTTLE_MS) {
      lastTypingSent = now;
      typingPtr = ptr;
      sendTyping(ptr, 'active');
    }
    if (pauseTimer !== undefined) clearTimeout(pauseTimer);
    pauseTimer = setTimeout(() => {
      pauseTimer = undefined;
      if (typingPtr) sendTyping(typingPtr, 'paused');
      lastTypingSent = 0;
    }, TYPING_PAUSE_DELAY_MS);
  }

  onCleanup(() => stopTyping('done'));

  // Flush any debounced draft/history writes before the tab is hidden or torn
  // down, so text typed within the debounce window is not lost on reload.
  if (typeof window !== 'undefined') {
    const flushOnHide = () => flushDrafts();
    window.addEventListener('pagehide', flushOnHide);
    document.addEventListener('visibilitychange', flushOnHide);
    onCleanup(() => {
      window.removeEventListener('pagehide', flushOnHide);
      document.removeEventListener('visibilitychange', flushOnHide);
    });
  }

  // -------------------------------------------------------------------------
  // Draft persistence across buffer switches
  // -------------------------------------------------------------------------

  let prevBuffer: string | null = null;
  let prevKey: string | null = null;
  createEffect(() => {
    const active = buffersState.activeBuffer;
    if (active === prevBuffer) return;
    untrack(() => {
      if (prevBuffer) {
        // Persist the outgoing buffer's unsent text (empty clears it).
        if (prevKey) setDraft(prevKey, text());
        stopTyping('done');
      }
      const key = active ? draftKeyFor(buffersState.buffers[active]) : null;
      if (active) {
        setText(key ? getDraft(key) : '');
        setHistoryIdx(-1);
        resetCompletion();
        inputEl?.focus();
      }
      prevKey = key;
    });
    prevBuffer = active;
  });

  // Auto-resize textarea — smooth, no flash
  createEffect(() => {
    void text();
    const el = inputEl;
    if (!el) return;
    el.style.height = '0';
    const next = Math.min(Math.max(el.scrollHeight, MIN_INPUT_HEIGHT), MAX_INPUT_HEIGHT);
    el.style.height = `${next}px`;
  });

  // On focus, ensure the input area is visible above the iOS keyboard
  const handleFocus = () => {
    setFocused(true);
    setTimeout(() => {
      wrapperEl?.scrollIntoView({ block: 'end', behavior: 'smooth' });
    }, 300);
    setTimeout(() => {
      wrapperEl?.scrollIntoView({ block: 'end', behavior: 'smooth' });
    }, 600);
  };

  const handleBlur = () => setFocused(false);

  // -------------------------------------------------------------------------
  // Message delivery — E2EE path for query buffers, relay otherwise
  // -------------------------------------------------------------------------

  async function deliver(message: string, pointer: string): Promise<void> {
    if (!message.startsWith('/')) {
      const entry = buffersState.buffers[pointer];
      if (entry && bufferKind(entry.buffer) === 'query' && e2eeDmsEnabled()) {
        const peer = entry.buffer.localVars['channel'] || entry.buffer.shortName;
        if (peer && canE2ee(peer)) {
          try {
            if (await sendE2eeDm(peer, message)) return;
          } catch {
            // E2EE send failed — fall back to the relay path below.
          }
        }
      }
    }
    sendInput(message, pointer);
  }

  const submit = () => {
    const trimmed = text().trim();
    const ptr = activeBuffer();
    if (!trimmed || !ptr) return;
    const now = Date.now();
    if (now - lastSubmitTime < SUBMIT_DEBOUNCE_MS) return;
    lastSubmitTime = now;
    // A pending reply threads the message via the direct bridge with a
    // +draft/reply tag; if that path is unavailable (no bridge / non-channel /
    // slash command) fall back to the plain relay send, which cannot carry it.
    const isCommand = trimmed.startsWith('/');
    const reply = pendingReplyFor(ptr);
    const linked = reply !== undefined && !isCommand && sendReply(ptr, trimmed, reply.msgid);
    if (!linked) void deliver(trimmed, ptr);
    // Clear the reply only when a content message was sent; a slash command
    // leaves the chip up so the pending reply survives an interleaved command.
    if (reply && !isCommand) clearPendingReply(ptr);
    pushHistory(trimmed);
    setHistoryIdx(-1);
    setText('');
    const key = activeDraftKey();
    if (key) clearDraft(key);
    resetCompletion();
    stopTyping('done');
  };

  // -------------------------------------------------------------------------
  // Uploads
  // -------------------------------------------------------------------------

  async function handleFileUpload(file: File): Promise<void> {
    const ptr = activeBuffer();
    if (!ptr) return;
    setUploading(true);
    setUploadError(null);
    try {
      // settings.uploadUrl wins when set; the lib falls back to
      // VITE_MEDIA_URL / same-origin '/upload' otherwise.
      const { url } = await uploadFile(file, {
        mediaUrl: settings.uploadUrl.trim() || undefined,
      });
      await deliver(url, ptr);
    } catch (err) {
      if (err instanceof UploadError) setUploadError(err.message);
      else setUploadError(`Upload failed: ${err instanceof Error ? err.message : 'network error'}`);
    } finally {
      setUploading(false);
    }
  }

  const onPaste = (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item && item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => setPastePreview({ file, dataUrl: String(reader.result) });
        reader.readAsDataURL(file);
        return;
      }
    }
  };

  const confirmPasteUpload = async () => {
    const preview = pastePreview();
    if (!preview) return;
    await handleFileUpload(preview.file);
    setPastePreview(null);
  };

  // -------------------------------------------------------------------------
  // Keyboard handling
  // -------------------------------------------------------------------------

  const onKeyDown = (e: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const value = text();
      if (completionState.active) {
        const result = cycleCompletion(!e.shiftKey);
        if (result) setText(result);
      } else {
        const cursor = e.currentTarget.selectionStart ?? value.length;
        const result = complete(value, cursor, activeBuffer());
        if (result !== value) setText(result);
      }
      return;
    }
    if (completionState.active && e.key !== 'Shift') resetCompletion();

    if (e.key === 'ArrowUp' && !text().includes('\n')) {
      e.preventDefault();
      const entries = draftsState.history;
      if (entries.length > 0) {
        const newIdx = Math.min(historyIdx() + 1, entries.length - 1);
        const item = entries[newIdx];
        if (item !== undefined) {
          setHistoryIdx(newIdx);
          setText(item);
        }
      }
      return;
    }

    if (e.key === 'ArrowDown' && !text().includes('\n')) {
      e.preventDefault();
      if (historyIdx() > 0) {
        const item = draftsState.history[historyIdx() - 1];
        if (item !== undefined) {
          setHistoryIdx(historyIdx() - 1);
          setText(item);
        }
      } else {
        setHistoryIdx(-1);
        setText('');
      }
      return;
    }

    if (e.ctrlKey && !e.altKey && !e.metaKey) {
      const el = e.currentTarget;
      let code = '';
      switch (e.key.toLowerCase()) {
        case 'b': code = IRC_BOLD; break;
        case 'i': code = IRC_ITALIC; break;
        case 'u': code = IRC_UNDERLINE; break;
      }
      if (code) {
        e.preventDefault();
        const value = text();
        const start = el.selectionStart ?? value.length;
        const end = el.selectionEnd ?? start;
        if (start !== end) {
          setText(`${value.slice(0, start)}${code}${value.slice(start, end)}${code}${value.slice(end)}`);
          el.setSelectionRange(end + 2, end + 2);
        } else {
          setText(value.slice(0, start) + code + value.slice(start));
          el.setSelectionRange(start + 1, start + 1);
        }
      }
    }
  };

  // -------------------------------------------------------------------------
  // GIF picker toggling (outside-click close comes from the picker itself)
  // -------------------------------------------------------------------------

  const closeGif = () => {
    setShowGif(false);
    gifDismissedAt = Date.now();
  };

  const toggleGif = () => {
    if (!showGif() && Date.now() - gifDismissedAt < GIF_REOPEN_GUARD_MS) return;
    setShowGif(!showGif());
  };

  return (
    <div
      ref={(el) => (wrapperEl = el)}
      class="shrink-0 relative input-bar-wrapper border-t border-white/[0.05]"
      style={{ 'padding-bottom': 'var(--input-bottom-pad, max(0.5rem, env(safe-area-inset-bottom)))' }}
    >
      {/* Paste preview */}
      <Show when={pastePreview()}>
        {(preview) => (
          <div class="absolute bottom-full left-2 right-2 sm:left-3 sm:right-3 mb-1 bg-gray-900 border border-white/[0.06] rounded-xl p-3 shadow-xl animate-slide-down">
            <div class="flex items-start gap-3">
              <img
                src={preview().dataUrl}
                alt="Paste preview"
                class="max-h-[80px] sm:max-h-[120px] max-w-[140px] sm:max-w-[200px] rounded-lg border border-white/[0.06]"
              />
              <div class="flex-1 min-w-0">
                <p class="text-[12px] text-gray-300 mb-1">Upload pasted image?</p>
                <p class="text-[11px] text-gray-500 mb-2 sm:mb-3 truncate">
                  {preview().file.name} ({(preview().file.size / 1024).toFixed(0)} KB)
                </p>
                <div class="flex gap-2">
                  <button
                    onClick={() => void confirmPasteUpload()}
                    disabled={uploading()}
                    class="px-4 py-2 sm:px-3 sm:py-1 rounded-lg text-[12px] sm:text-[11px] font-medium bg-[var(--custom-accent,#818cf8)] text-white hover:opacity-85 active:opacity-70 disabled:opacity-40 transition-all"
                  >
                    {uploading() ? 'Uploading...' : 'Upload'}
                  </button>
                  <button
                    onClick={() => setPastePreview(null)}
                    class="px-4 py-2 sm:px-3 sm:py-1 rounded-lg text-[12px] sm:text-[11px] font-medium text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] active:bg-white/[0.08] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Show>

      {/* Upload error toast */}
      <Show when={uploadError()}>
        <div class="absolute bottom-full left-2 right-2 sm:left-3 sm:right-3 mb-1 bg-red-900/80 border border-red-500/20 rounded-xl px-3 py-2 shadow-xl animate-slide-down flex items-center gap-2">
          <span class="text-[12px] text-red-200 flex-1">{uploadError()}</span>
          <button
            onClick={() => setUploadError(null)}
            class="text-red-400 hover:text-red-200 shrink-0 text-[11px] font-medium"
          >
            Dismiss
          </button>
        </div>
      </Show>

      {/* GIF picker */}
      <Show when={showGif()}>
        <Suspense fallback={null}>
          <GifPicker
            apiKey={settings.tenorApiKey}
            onSelect={(url) => {
              const ptr = activeBuffer();
              if (ptr) void deliver(url, ptr);
            }}
            onClose={closeGif}
          />
        </Suspense>
      </Show>

      {/* Input row */}
      <div class="px-2 sm:px-3 pt-2 pb-1.5">
        {/* Reply chip — shown while a pending reply target is set for this buffer */}
        <Show when={replyTarget()}>
          {(reply) => (
            <div class="flex items-center gap-2 mb-1.5 pl-2.5 pr-1.5 py-1.5 rounded-lg bg-white/[0.03] border-l-2 border-[var(--custom-accent,#818cf8)]">
              <svg class="w-3.5 h-3.5 shrink-0 text-[var(--custom-accent,#818cf8)]" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 4 2 8l4 4M2 8h7a5 5 0 0 1 5 5v0" />
              </svg>
              <div class="flex-1 min-w-0 leading-tight">
                <span class="text-[11px] font-medium text-[var(--custom-accent,#818cf8)]">
                  Replying to {reply().nick || 'message'}
                </span>
                <span class="block text-[12px] text-gray-400 truncate">{reply().preview}</span>
              </div>
              <button
                onClick={cancelReply}
                aria-label="Cancel reply"
                class="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-200 hover:bg-white/[0.06] active:scale-90 transition-[color,background-color,transform] duration-150"
              >
                <svg class="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </div>
          )}
        </Show>
        <div
          class="flex items-end gap-1.5 rounded-2xl sm:rounded-xl border px-2 sm:px-3 py-1.5 transition-[background-color,border-color,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
          classList={{
            'bg-white/[0.05] border-[var(--custom-accent,#818cf8)]/40 ring-1 ring-[var(--custom-accent,#818cf8)]/25 shadow-lg shadow-black/25': focused(),
            'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.03] hover:border-white/[0.1]': !focused(),
          }}
        >
          {/* Text input */}
          <textarea
            ref={(el) => (inputEl = el)}
            value={text()}
            onInput={(e) => {
              const value = e.currentTarget.value;
              setText(value);
              noteTyping(value);
              // Persist the active draft (debounced in the store) so mid-typing
              // text survives a reload without a buffer switch.
              const key = activeDraftKey();
              if (key) setDraft(key, value);
            }}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={inputPlaceholder(activeEntry())}
            disabled={!activeBuffer()}
            rows={1}
            enterkeyhint="send"
            autocomplete="off"
            autocorrect="on"
            spellcheck
            class="flex-1 bg-transparent text-[15px] sm:text-[14px] text-gray-200 py-2 outline-none resize-none placeholder:text-gray-500 disabled:opacity-20 leading-[1.45]"
            style={{ 'min-height': `${MIN_INPUT_HEIGHT}px`, 'max-height': `${MAX_INPUT_HEIGHT}px` }}
          />

          {/* Action buttons — inside the input container */}
          <div class="flex items-center gap-0.5 pb-1.5 shrink-0">
            {/* Upload */}
            <button
              onClick={() => fileEl?.click()}
              disabled={!activeBuffer()}
              class="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-200 hover:bg-white/[0.06] active:bg-white/[0.1] active:scale-90 transition-[color,background-color,transform] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] disabled:opacity-20 disabled:cursor-default disabled:hover:bg-transparent disabled:active:scale-100"
              title="Upload file"
              aria-label="Upload file"
            >
              <svg class="w-[17px] h-[17px] sm:w-[15px] sm:h-[15px]" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 10v2.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5V10" />
                <path d="M8 2v8M5 5l3-3 3 3" />
              </svg>
            </button>
            <input
              ref={(el) => (fileEl = el)}
              type="file"
              accept="image/*,video/*,audio/*,.pdf,.txt,.zip"
              class="hidden"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (file) void handleFileUpload(file);
                e.currentTarget.value = '';
              }}
            />

            {/* GIF */}
            <button
              onClick={toggleGif}
              disabled={!activeBuffer()}
              class="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg transition-[color,background-color,transform] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-90 disabled:opacity-20 disabled:cursor-default disabled:active:scale-100"
              classList={{
                'text-[var(--custom-accent,#818cf8)] bg-[var(--custom-accent,#818cf8)]/15 ring-1 ring-[var(--custom-accent,#818cf8)]/25': showGif(),
                'text-gray-500 hover:text-gray-200 hover:bg-white/[0.06] active:bg-white/[0.1]': !showGif(),
              }}
              title="GIF"
              aria-label="GIF picker"
            >
              <span class="text-[11px] sm:text-[10px] font-bold tracking-tight">GIF</span>
            </button>

            {/* Send / uploading */}
            <Show
              when={!uploading()}
              fallback={
                <div class="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center">
                  <span class="w-4 h-4 border-2 border-gray-600 border-t-[var(--custom-accent,#818cf8)] rounded-full animate-spin" />
                </div>
              }
            >
              <button
                onClick={submit}
                disabled={!hasText() || !activeBuffer()}
                class="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center rounded-xl sm:rounded-lg transition-[opacity,transform,box-shadow,background-color,filter] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]"
                classList={{
                  'bg-[var(--custom-accent,#818cf8)] text-white hover:brightness-110 active:scale-90 shadow-md shadow-[var(--custom-accent,#818cf8)]/30': hasText(),
                  'bg-white/[0.03] text-gray-600 cursor-default': !hasText(),
                }}
                aria-label="Send"
              >
                <svg class="w-[17px] h-[17px] sm:w-[15px] sm:h-[15px]" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M1.7 1.4a.8.8 0 0 1 .9-.1l11.5 6a.8.8 0 0 1 0 1.4l-11.5 6a.8.8 0 0 1-1.1-.9L3.1 9H7a.8.8 0 0 0 0-1.6H3.1L1.5 2.3a.8.8 0 0 1 .2-.9z" />
                </svg>
              </button>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}
