// Message input bar — textarea with auto-resize, per-buffer drafts, input
// history, tab completion, IRC formatting shortcuts, uploads, GIF picker,
// typing notifications, and the E2EE DM send path.

import { createEffect, createSignal, onCleanup, untrack, Show } from 'solid-js';
import {
  buffersState,
  completionState,
  complete,
  cycleCompletion,
  resetCompletion,
  sendInput,
  settings,
} from '@/state';
import type { BridgeSettings, BufferEntry } from '@/state';
import { sendTyping, canE2ee, sendE2eeDm } from '@/state/bridge';
import { bufferKind } from '@/lib/bufferKind';
import { uploadFile, UploadError } from '@/lib/upload/upload';
import GifPicker from './GifPicker';

const MIN_INPUT_HEIGHT = 44;
const MAX_INPUT_HEIGHT = 160;
const HISTORY_LIMIT = 100;
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
  const [history, setHistory] = createSignal<string[]>([]);
  const [historyIdx, setHistoryIdx] = createSignal(-1);
  const [showGif, setShowGif] = createSignal(false);
  const [uploading, setUploading] = createSignal(false);
  const [uploadError, setUploadError] = createSignal<string | null>(null);
  const [pastePreview, setPastePreview] = createSignal<PastePreview | null>(null);
  const [focused, setFocused] = createSignal(false);

  let inputEl: HTMLTextAreaElement | undefined;
  let fileEl: HTMLInputElement | undefined;
  let wrapperEl: HTMLDivElement | undefined;

  /** Per-buffer drafts, keyed by buffer pointer (in-memory, non-reactive). */
  const drafts: Record<string, string> = {};
  let lastSubmitTime = 0;
  let gifDismissedAt = 0;

  const activeBuffer = () => buffersState.activeBuffer;
  const activeEntry = () => {
    const ptr = activeBuffer();
    return ptr ? buffersState.buffers[ptr] : undefined;
  };
  const hasText = () => text().trim().length > 0;

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

  // -------------------------------------------------------------------------
  // Draft persistence across buffer switches
  // -------------------------------------------------------------------------

  let prevBuffer: string | null = null;
  createEffect(() => {
    const active = buffersState.activeBuffer;
    if (active === prevBuffer) return;
    untrack(() => {
      if (prevBuffer) {
        const current = text();
        if (current) drafts[prevBuffer] = current;
        else delete drafts[prevBuffer];
        stopTyping('done');
      }
      if (active) {
        setText(drafts[active] ?? '');
        delete drafts[active];
        setHistoryIdx(-1);
        resetCompletion();
        inputEl?.focus();
      }
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
    void deliver(trimmed, ptr);
    setHistory((prev) => [trimmed, ...prev].slice(0, HISTORY_LIMIT));
    setHistoryIdx(-1);
    setText('');
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
      const entries = history();
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
        const item = history()[historyIdx() - 1];
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
        <GifPicker
          apiKey={settings.tenorApiKey}
          onSelect={(url) => {
            const ptr = activeBuffer();
            if (ptr) void deliver(url, ptr);
          }}
          onClose={closeGif}
        />
      </Show>

      {/* Input row */}
      <div class="px-2 sm:px-3 pt-2 pb-1.5">
        <div
          class="flex items-end gap-1.5 rounded-2xl sm:rounded-xl transition-all duration-200 border px-2 sm:px-3 py-1.5"
          classList={{
            'bg-white/[0.04] ring-1 ring-[var(--custom-accent,#818cf8)]/20 border-[var(--custom-accent,#818cf8)]/30': focused(),
            'bg-white/[0.02] border-white/[0.06]': !focused(),
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
              class="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-300 active:bg-white/[0.08] transition-colors disabled:opacity-20 disabled:cursor-default"
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
              class="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg transition-colors disabled:opacity-20 disabled:cursor-default"
              classList={{
                'text-[var(--custom-accent,#818cf8)] bg-[var(--custom-accent,#818cf8)]/10': showGif(),
                'text-gray-500 hover:text-gray-300 active:bg-white/[0.08]': !showGif(),
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
                class="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center rounded-xl sm:rounded-lg transition-all duration-150"
                classList={{
                  'bg-[var(--custom-accent,#818cf8)] text-white hover:opacity-85 active:scale-90 shadow-sm shadow-black/30': hasText(),
                  'bg-transparent text-gray-700 cursor-default': !hasText(),
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
