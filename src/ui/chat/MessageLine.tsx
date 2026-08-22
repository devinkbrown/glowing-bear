// MessageLine — renders a single chat line in all its variants:
// system (join/part/quit/nick/mode/topic), action, notice, whisper, and
// regular messages (desktop column layout + mobile stacked layout), plus
// the raw/fset/plugin special-buffer monospace views.
//
// Ported from the old React MessageLine with three intentional additions:
//   - context menu gains a React row (emoji → bridge sendReactionTag)
//   - E2EE overlay: 'TSUMUGI1 ' payloads render decryptedFor() plaintext
//   - .irc-chan-ref click delegation joins the referenced channel

/* eslint-disable solid/no-innerhtml --
   innerHTML here is fed exclusively by formatText()/cachedFormatText(), which
   HTML-escapes the raw IRC text before injecting its own markup. */

import { createMemo, createSignal, onCleanup, For, Match, Show, Switch } from 'solid-js';
import type { JSX } from 'solid-js';
import type { WeeChatLine } from '@/types';
import type { BufferKind } from '@/lib/bufferKind';
import { nickColor } from '@/lib/nickcolor';
import { formatTimestamp } from '@/lib/timestamps';
import { formatText, stripFormatting } from '@/lib/irc-classic/formatter';
import { stripColors } from '@/lib/weechat/strip-colors';
import { parseEventFeedText, type ParsedEventFeed } from '@/lib/ircx/parser';
import {
  buffersState,
  closeActivityPanel,
  isBot,
  isMessageSaved,
  sendInput,
  settings,
  showOnyxChrome,
  sourceFromLine,
  toggleSavedMessage,
} from '@/state';
import { sendReactionTag, decryptedFor } from '@/state/bridge';
import {
  openThread,
  recordLinePreview,
  replyPreviewFor,
  requestScrollToMessage,
  resolveThreadRoot,
  setPendingReply,
} from '@/state/threads';

export interface MessageLineProps {
  line: WeeChatLine;
  grouped: boolean;
  bufferKind: BufferKind;
  bufferPtr: string;
  isDesktop: boolean;
}

const URL_RE = /https?:\/\/[^\s<"']+/g;
// Channel status sigils, Onyx Server (*!.@+) + standard IRC (~&@%+) prefixes.
const NICK_PREFIX_RE = /^([*!.~&@%+])/;
const E2EE_PREFIX = 'TSUMUGI1 ';
const E2EE_PLACEHOLDER = '\u{1F512} encrypted message';
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP_PX = 10;

/** Emoji offered in the context-menu React row. */
const REACT_EMOJI = ['\u{1F44D}', '❤️', '\u{1F602}', '\u{1F62E}', '\u{1F622}', '\u{1F389}', '\u{1F525}', '\u{1F440}'];

// ── formatText LRU (virtualized rows remount on scroll; cache across them) ──
const FORMAT_CACHE_MAX = 600;
const formatCache = new Map<string, { text: string; inline: boolean; html: string }>();

function cachedFormatText(id: string, text: string, inline: boolean): string {
  const hit = formatCache.get(id);
  if (hit && hit.text === text && hit.inline === inline) {
    // LRU bump
    formatCache.delete(id);
    formatCache.set(id, hit);
    return hit.html;
  }
  const html = formatText(text, inline);
  formatCache.set(id, { text, inline, html });
  if (formatCache.size > FORMAT_CACHE_MAX) {
    const oldest = formatCache.keys().next().value;
    if (oldest !== undefined) formatCache.delete(oldest);
  }
  return html;
}

// ── Context menu ─────────────────────────────────────────────────────────────

interface ContextMenuProps {
  x: number;
  y: number;
  text: string;
  urls: string[];
  canReact: boolean;
  onReact: (emoji: string) => void;
  canReply: boolean;
  onReply: () => void;
  canOpenThread: boolean;
  onOpenThread: () => void;
  canSave: boolean;
  saved: boolean;
  onToggleSaved: () => void;
  onClose: () => void;
}

function MessageContextMenu(props: ContextMenuProps) {
  const left = () => Math.min(props.x, window.innerWidth - 240);
  const top = () => Math.min(props.y, window.innerHeight - 200);

  return (
    <>
      <div class="fixed inset-0 z-[90]" onClick={() => props.onClose()} onTouchStart={() => props.onClose()} />
      <div class="fixed z-[100] animate-fade-up" style={{ left: `${left()}px`, top: `${top()}px` }}>
        <div class="bg-gray-900 border border-white/[0.1] rounded-xl shadow-2xl overflow-hidden min-w-[150px]">
          <Show when={props.canReact}>
            <div class="flex items-center gap-0.5 px-2 pt-2 pb-1.5 border-b border-white/[0.06]">
              <For each={REACT_EMOJI}>
                {(emoji) => (
                  <button
                    onClick={() => props.onReact(emoji)}
                    class="w-7 h-7 flex items-center justify-center rounded-lg text-[15px] hover:bg-white/[0.08] active:scale-90 transition-all"
                    aria-label={`React with ${emoji}`}
                  >
                    {emoji}
                  </button>
                )}
              </For>
            </div>
          </Show>
          <div class="py-1">
            <Show when={props.canReply}>
              <button
                onClick={() => {
                  props.onReply();
                  props.onClose();
                }}
                class="w-full flex items-center gap-2.5 px-3 py-2.5 sm:py-2 text-[13px] sm:text-[12px] text-gray-300 hover:bg-white/[0.04] active:bg-white/[0.08] transition-colors"
              >
                <svg class="w-3.5 h-3.5 shrink-0 -scale-x-100" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M8 4L4 8l4 4M4 8h6a4 4 0 014 4" />
                </svg>
                Reply
              </button>
            </Show>
            <Show when={props.canOpenThread}>
              <button
                onClick={() => {
                  props.onOpenThread();
                  props.onClose();
                }}
                class="w-full flex items-center gap-2.5 px-3 py-2.5 sm:py-2 text-[13px] sm:text-[12px] text-gray-300 hover:bg-white/[0.04] active:bg-white/[0.08] transition-colors"
              >
                <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2.5 3.5h11v7h-6l-3.5 3v-3H2.5z" />
                </svg>
                Open thread
              </button>
            </Show>
            <Show when={props.canSave}>
              <button
                onClick={() => {
                  props.onToggleSaved();
                  props.onClose();
                }}
                class="w-full flex items-center gap-2.5 px-3 py-2.5 sm:py-2 text-[13px] sm:text-[12px] text-gray-300 hover:bg-white/[0.04] active:bg-white/[0.08] transition-colors"
              >
                <span class="w-3.5 text-center">{props.saved ? '★' : '☆'}</span>
                {props.saved ? 'Remove saved message' : 'Save message'}
              </button>
            </Show>
            <button
              onClick={() => {
                navigator.clipboard.writeText(props.text).catch(() => undefined);
                props.onClose();
              }}
              class="w-full flex items-center gap-2.5 px-3 py-2.5 sm:py-2 text-[13px] sm:text-[12px] text-gray-300 hover:bg-white/[0.04] active:bg-white/[0.08] transition-colors"
            >
              <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="5" y="5" width="9" height="9" rx="1.5" />
                <path d="M5 11H3.5A1.5 1.5 0 012 9.5v-7A1.5 1.5 0 013.5 1h7A1.5 1.5 0 0112 2.5V5" />
              </svg>
              Copy Text
            </button>
            <Show when={props.urls.length > 0}>
              <button
                onClick={() => {
                  const url = props.urls[0];
                  if (url) navigator.clipboard.writeText(url).catch(() => undefined);
                  props.onClose();
                }}
                class="w-full flex items-center gap-2.5 px-3 py-2.5 sm:py-2 text-[13px] sm:text-[12px] text-gray-300 hover:bg-white/[0.04] active:bg-white/[0.08] transition-colors"
              >
                <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                  <path d="M6.5 9.5l3-3M7 10a3 3 0 01-4.24 0 3 3 0 010-4.24L4.5 4M9 6a3 3 0 014.24 0 3 3 0 010 4.24L11.5 12" />
                </svg>
                Copy Link
              </button>
            </Show>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Special buffers (raw log / fset / plugin) ───────────────────────────────

function SpecialLine(props: { line: WeeChatLine; kind: BufferKind }) {
  const html = createMemo(() => cachedFormatText(props.line.id, props.line.message, false));
  const prefix = createMemo(() => (props.line.prefix ? stripColors(props.line.prefix).trim() : ''));
  const timestamp = createMemo(() =>
    settings.timestampFormat === 'off' ? '' : formatTimestamp(props.line.date, settings.timestampFormat),
  );

  return (
    <Switch
      fallback={
        <div class="flex items-start gap-1.5 px-3 sm:px-2 py-px text-[12px] leading-[1.6] text-gray-400">
          <Show when={timestamp()}>
            <span class="text-gray-600 shrink-0 text-[11px] font-mono tabular-nums select-none">{timestamp()}</span>
          </Show>
          <Show when={prefix()}>
            <span class="text-gray-500 shrink-0 font-medium">{prefix()}</span>
          </Show>
          <span class="flex-1 irc-msg-text whitespace-pre-wrap" innerHTML={html()} />
        </div>
      }
    >
      <Match when={props.kind === 'raw'}>
        {(() => {
          const isSend = () => prefix() === '>>>' || prefix() === '>>' || prefix().includes('→') || prefix().includes('>>');
          const isRecv = () => prefix() === '<<<' || prefix() === '<<' || prefix().includes('←') || prefix().includes('<<');
          return (
            <div
              class="flex items-start gap-1.5 px-3 sm:px-2 py-px font-mono text-[11px] leading-[1.6] hover:bg-white/[0.02] transition-colors"
              classList={{
                'text-sky-400/70': isSend(),
                'text-emerald-400/60': !isSend() && isRecv(),
                'text-gray-500': !isSend() && !isRecv(),
              }}
            >
              <Show when={timestamp()}>
                <span class="text-gray-600 shrink-0 w-[52px] text-right tabular-nums select-none">{timestamp()}</span>
              </Show>
              <span
                class="w-4 text-center shrink-0 font-bold"
                classList={{
                  'text-sky-500/60': isSend(),
                  'text-emerald-500/50': !isSend() && isRecv(),
                  'text-gray-600': !isSend() && !isRecv(),
                }}
              >
                {isSend() ? '→' : isRecv() ? '←' : '·'}
              </span>
              <span class="flex-1 break-all whitespace-pre-wrap irc-msg-text" innerHTML={html()} />
            </div>
          );
        })()}
      </Match>
      <Match when={props.kind === 'fset'}>
        <div class="flex items-start gap-1.5 px-3 sm:px-2 py-px font-mono text-[11px] leading-[1.6] text-gray-300 hover:bg-white/[0.02] transition-colors">
          <Show when={prefix()}>
            <span class="text-gray-500 shrink-0 select-none">{prefix()}</span>
          </Show>
          <span class="flex-1 whitespace-pre-wrap irc-msg-text" innerHTML={html()} />
        </div>
      </Match>
    </Switch>
  );
}

function eventTone(event: ParsedEventFeed): string {
  const key = `${event.category} ${event.verb ?? ''}`;
  if (/(CONNECT|JOIN|ROSTER)/.test(key)) return 'border-emerald-500/20 bg-emerald-500/[0.055] text-emerald-200';
  if (/(DISCONNECT|LEAVE|QUIT|KILL|ERROR)/.test(key)) return 'border-rose-500/20 bg-rose-500/[0.055] text-rose-200';
  if (/(MEDIA|SERVICE)/.test(key)) return 'border-sky-500/20 bg-sky-500/[0.055] text-sky-200';
  if (/(OPER|SECURITY|POLICY)/.test(key)) return 'border-amber-500/20 bg-amber-500/[0.055] text-amber-200';
  // Uncategorised events are informational — carry --role-info, not the accent.
  return 'border-[var(--role-info,#7dd3fc)]/20 bg-[var(--role-info,#7dd3fc)]/[0.055] text-gray-200';
}

function EventFeedLine(props: { event: ParsedEventFeed; timestamp: string; rowHandlers: JSX.HTMLAttributes<HTMLDivElement> }) {
  const attrs = () => Object.entries(props.event.attrs);
  const targetText = () => {
    const pieces = [
      props.event.channel,
      props.event.subject,
      props.event.sender,
    ].filter(Boolean);
    return pieces.join(' ');
  };
  const metaText = () => [props.event.source, props.event.target].filter(Boolean).join(' -> ');

  return (
    <div
      class={`msg-row py-1.5 sm:py-1 ${eventTone(props.event)}`}
      {...props.rowHandlers}
    >
      <Show when={props.timestamp}>
        <span class="msg-ts">{props.timestamp}</span>
      </Show>
      <span class="msg-nick-spacer" />
      <div class="msg-body min-w-0">
        <div class="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-lg border border-current/10 px-2 py-1 text-[12px] leading-snug">
          <span class="rounded bg-current/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.14em]">
            {props.event.category}
          </span>
          <Show when={props.event.verb}>
            <span class="font-bold uppercase tracking-[0.08em]">{props.event.verb}</span>
          </Show>
          <Show when={targetText()}>
            <span class="min-w-0 break-all text-gray-100/90">{targetText()}</span>
          </Show>
          <Show when={props.event.detail}>
            <span class="min-w-0 break-words text-gray-300/75">- {props.event.detail}</span>
          </Show>
          <For each={attrs()}>
            {([key, value]) => (
              <span class="rounded border border-white/[0.08] bg-black/20 px-1.5 py-0.5 font-mono text-[10px] text-gray-300/80">
                {key}={value}
              </span>
            )}
          </For>
          <Show when={metaText()}>
            <span class="font-mono text-[10px] text-gray-500">{metaText()}</span>
          </Show>
        </div>
      </div>
    </div>
  );
}

// ── Reply affordances ────────────────────────────────────────────────────────

// Compact "replying to …" indicator shown above a message that carries a
// +draft/reply tag (line.replyTo = parent msgid). The preview is a plain string
// from the threads store, rendered as a text node (auto-escaped) — never
// innerHTML. Activating it asks the message list to scroll to the parent.
function ReplyingToIndicator(props: { parentMsgid: string }) {
  const preview = () => replyPreviewFor(props.parentMsgid);
  return (
    <button
      type="button"
      class="reply-quote mb-0.5 flex max-w-full items-center gap-1 truncate text-left text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
      aria-label="Jump to replied message"
      onClick={() => requestScrollToMessage(props.parentMsgid)}
    >
      <svg class="w-3 h-3 shrink-0 -scale-x-100 opacity-70" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 4L4 8l4 4M4 8h6a4 4 0 014 4" />
      </svg>
      <span class="truncate">{preview() ?? 'replying to a message'}</span>
    </button>
  );
}

// Hover/focus "reply" control appended to a message body. Hidden until the row
// is hovered or the control is focused (keyboard-reachable), then sets the
// buffer's pending reply target.
function ReplyAction(props: { nick: string; canReply: boolean; onReply: () => void }) {
  return (
    <Show when={props.canReply}>
      <button
        type="button"
        class="reply-action ml-1.5 inline-flex shrink-0 items-center justify-center rounded p-0.5 align-middle text-gray-500 opacity-0 transition-opacity hover:text-gray-200 focus-visible:opacity-100 group-hover:opacity-100"
        aria-label={`Reply to ${props.nick || 'message'}`}
        onClick={() => props.onReply()}
      >
        <svg class="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 4L4 8l4 4M4 8h6a4 4 0 014 4" />
        </svg>
      </button>
    </Show>
  );
}

function ThreadAction(props: { canOpen: boolean; onOpen: () => void }) {
  return (
    <Show when={props.canOpen}>
      <button
        type="button"
        class="reply-action ml-1 inline-flex shrink-0 items-center justify-center rounded p-0.5 align-middle text-gray-500 opacity-0 transition-opacity hover:text-gray-200 focus-visible:opacity-100 group-hover:opacity-100"
        aria-label="Open message thread"
        onClick={() => props.onOpen()}
      >
        <svg class="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2.5 3.5h11v7h-6l-3.5 3v-3H2.5z" />
        </svg>
      </button>
    </Show>
  );
}

function SaveAction(props: { canSave: boolean; saved: boolean; onToggle: () => void }) {
  return (
    <Show when={props.canSave}>
      <button
        type="button"
        class="reply-action ml-1 inline-flex shrink-0 items-center justify-center rounded p-0.5 align-middle text-[14px] leading-none text-gray-500 opacity-0 transition-opacity hover:text-gray-200 focus-visible:opacity-100 group-hover:opacity-100"
        aria-label={props.saved ? 'Remove saved message' : 'Save message'}
        onClick={() => props.onToggle()}
      >
        {props.saved ? '★' : '☆'}
      </button>
    </Show>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function MessageLine(props: MessageLineProps) {
  const [menu, setMenu] = createSignal<{ x: number; y: number } | null>(null);
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let pressX = 0;
  let pressY = 0;
  onCleanup(() => {
    if (longPressTimer) clearTimeout(longPressTimer);
  });

  const isSpecial = () => props.bufferKind === 'raw' || props.bufferKind === 'fset' || props.bufferKind === 'plugin';
  const isSystem = () =>
    !!(props.line.isJoin || props.line.isPart || props.line.isQuit || props.line.isNick || props.line.isMode || props.line.isTopic);

  // E2EE overlay — encrypted payloads render their decrypted plaintext (or a
  // lock placeholder while the bridge has nothing for this msgid).
  const displayText = createMemo(() => {
    const raw = props.line.message;
    if (raw.startsWith(E2EE_PREFIX)) {
      return decryptedFor(props.line.msgid, raw) ?? E2EE_PLACEHOLDER;
    }
    return raw;
  });

  const html = createMemo(() => cachedFormatText(props.line.id, displayText(), settings.inlineImages));
  const plainText = createMemo(() => stripFormatting(displayText()));
  const urls = createMemo(() => displayText().match(URL_RE) ?? []);
  const eventFeed = createMemo(() => (props.bufferKind === 'raw' ? null : parseEventFeedText(displayText())));

  const timestamp = createMemo(() =>
    settings.timestampFormat === 'off' ? '' : formatTimestamp(props.line.date, settings.timestampFormat),
  );

  const nick = () => props.line.nick ?? '';
  const nickIsBot = createMemo(() => (nick() ? isBot(nick()) : false));
  const nickStyle = createMemo(() => (settings.colorNicks && nick() ? { color: nickColor(nick()) } : undefined));

  const prefixChar = createMemo(() => {
    if (!settings.showPrefixes || !props.line.prefix) return '';
    const clean = stripColors(props.line.prefix);
    return (clean.match(NICK_PREFIX_RE) ?? [''])[0] ?? '';
  });

  const eventColor = () =>
    props.line.isJoin
      ? 'text-emerald-400/75'
      : props.line.isPart || props.line.isQuit
        ? 'text-red-400/65'
        : props.line.isNick
          ? 'text-amber-400/70'
          : props.line.isMode
            ? 'text-sky-400/65'
            : 'text-purple-400/65'; // topic

  // Set this buffer's pending reply target to this line, capturing a sanitized
  // plain-text preview (stripFormatting → threads store sanitizes further). The
  // preview is also recorded by msgid so a reply that quotes this line can
  // resolve its "replying to …" text.
  const startReply = () => {
    const msgid = props.line.msgid;
    if (!msgid) return;
    const preview = plainText();
    recordLinePreview(msgid, preview);
    setPendingReply(props.bufferPtr, { msgid, nick: props.line.nick ?? '', preview });
  };
  const canReply = () => !!props.line.msgid && props.bufferKind !== 'raw' && props.bufferKind !== 'fset' && props.bufferKind !== 'plugin';
  const messageSource = () => {
    const entry = buffersState.buffers[props.bufferPtr];
    return entry ? sourceFromLine(entry, props.line) : null;
  };
  const canSave = () => settings.archiveRetention !== 'off' && messageSource() !== null;
  const saved = () => {
    const source = messageSource();
    return source ? isMessageSaved(source) : false;
  };
  const toggleSaved = () => {
    const source = messageSource();
    if (source && settings.archiveRetention !== 'off') toggleSavedMessage(source);
  };
  const openLineThread = () => {
    const entry = buffersState.buffers[props.bufferPtr];
    if (!entry) return;
    const rootMsgid = resolveThreadRoot(props.line, entry.msgIndex);
    if (!rootMsgid) return;
    closeActivityPanel();
    openThread(
      props.bufferPtr,
      entry.buffer.fullName || entry.buffer.name,
      rootMsgid,
    );
  };

  // ── Context menu triggers (right-click on desktop, long-press on touch) ──
  const openMenu = (x: number, y: number) => setMenu({ x, y });

  const onContextMenu = (e: MouseEvent) => {
    if (props.isDesktop) {
      e.preventDefault();
      openMenu(e.clientX, e.clientY);
    }
  };
  const onTouchStart = (e: TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    pressX = touch.clientX;
    pressY = touch.clientY;
    longPressTimer = setTimeout(() => openMenu(pressX, pressY), LONG_PRESS_MS);
  };
  const onTouchMove = (e: TouchEvent) => {
    if (!longPressTimer) return;
    const touch = e.touches[0];
    if (!touch) return;
    if (Math.abs(touch.clientX - pressX) > LONG_PRESS_SLOP_PX || Math.abs(touch.clientY - pressY) > LONG_PRESS_SLOP_PX) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };
  const onTouchEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  const rowHandlers = {
    onContextMenu,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel: onTouchEnd,
  };

  // Click delegation inside innerHTML: channel-ref buttons join the channel;
  // image links keep their native new-tab anchor behavior.
  const onBodyClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    const chanBtn = target?.closest('.irc-chan-ref');
    if (chanBtn) {
      e.preventDefault();
      const chan = chanBtn.getAttribute('data-channel');
      if (chan) sendInput(`/join ${chan}`);
    }
  };

  const botBadge = (extraClass: string) => (
    <Show when={nickIsBot()}>
      <span
        class={`px-1 py-px rounded text-[7px] font-bold uppercase tracking-wider bg-[var(--role-primary,#818cf8)]/15 text-[var(--role-primary,#818cf8)] border border-[var(--role-primary,#818cf8)]/20 leading-none ${extraClass}`}
      >
        BOT
      </span>
    </Show>
  );

  return (
    <>
      <Switch
        fallback={
          /* ── Regular message, desktop column layout ── */
          <div
            class={`msg-row group flex ${settings.compactMode || props.grouped ? '' : 'msg-gap'} ${props.line.highlight ? 'msg-highlight' : ''}`}
            {...rowHandlers}
          >
            <Show when={timestamp()}>
              <span class={`msg-ts ${props.grouped ? 'invisible' : ''}`}>{timestamp()}</span>
            </Show>
            <Show when={!props.grouped} fallback={<span class="msg-nick" />}>
              <span class="msg-nick" style={nickStyle()}>
                {prefixChar()}{nick()}
                {botBadge('ml-1 inline-flex align-middle')}
              </span>
            </Show>
            <div class="msg-body">
              <Show when={props.line.replyTo}>{(pid) => <ReplyingToIndicator parentMsgid={pid()} />}</Show>
              <span class="irc-msg-text text-[13px] text-gray-200" innerHTML={html()} onClick={onBodyClick} />
              <ReplyAction nick={nick()} canReply={canReply()} onReply={startReply} />
              <ThreadAction canOpen={canReply()} onOpen={openLineThread} />
              <SaveAction canSave={canSave()} saved={saved()} onToggle={toggleSaved} />
            </div>
          </div>
        }
      >
        <Match when={isSpecial()}>
          <SpecialLine line={props.line} kind={props.bufferKind} />
        </Match>

        <Match when={eventFeed()}>
          {(event) => <EventFeedLine event={event()} timestamp={timestamp()} rowHandlers={rowHandlers} />}
        </Match>

        <Match when={isSystem()}>
          <div class={`msg-row msg-system ${settings.compactMode ? '' : 'msg-gap'}`} {...rowHandlers}>
            <Show when={timestamp()}>
              <span class="msg-ts">{timestamp()}</span>
            </Show>
            <span class="msg-nick-spacer" />
            <span class={`msg-body ${eventColor()} text-[11px] sm:text-[12px]`} innerHTML={html()} onClick={onBodyClick} />
          </div>
        </Match>

        <Match when={props.line.isAction}>
          <div
            class={`msg-row ${settings.compactMode ? '' : 'py-0.5'} ${props.line.highlight ? 'msg-highlight' : ''}`}
            {...rowHandlers}
          >
            <Show when={timestamp()}>
              <span class={`msg-ts ${props.grouped ? 'invisible' : ''}`}>{timestamp()}</span>
            </Show>
            <span class="msg-nick-spacer" />
            <div class="msg-body text-gray-400/90 text-[14px] sm:text-[13px] italic">
              <span class="not-italic text-gray-500/60 mr-1 text-[11px]">*</span>
              <strong style={nickStyle()} class="not-italic">{nick()}</strong>{' '}
              <span class="irc-msg-text" innerHTML={html()} onClick={onBodyClick} />
            </div>
          </div>
        </Match>

        <Match when={props.line.isNotice}>
          <div class={`msg-row ${settings.compactMode ? '' : 'py-0.5'}`} {...rowHandlers}>
            <Show when={timestamp()}>
              <span class="msg-ts">{timestamp()}</span>
            </Show>
            <span class="msg-nick-spacer" />
            <div class="msg-body">
              <span class="text-[var(--role-info,#7dd3fc)]/40 text-[11px] mr-1">&raquo;</span>
              <span class="text-[var(--role-info,#7dd3fc)]/80 text-[13px] font-semibold tracking-tight">-{nick()}-</span>{' '}
              <span class="text-[var(--role-info,#7dd3fc)]/70 irc-msg-text text-[13px]" innerHTML={html()} onClick={onBodyClick} />
            </div>
          </div>
        </Match>

        <Match when={props.line.isWhisper}>
          <div
            class={`msg-row ${settings.compactMode ? '' : 'py-0.5'} bg-amber-500/[0.04] border-l-2 border-amber-500/40`}
            {...rowHandlers}
          >
            <Show when={timestamp()}>
              <span class={`msg-ts ${props.grouped ? 'invisible' : ''}`}>{timestamp()}</span>
            </Show>
            <Show when={!props.grouped} fallback={<span class="msg-nick" />}>
              <span class="msg-nick" style={nickStyle()}>
                <span class="text-amber-500/60 text-[10px] font-medium mr-1">WHISPER</span>
                {prefixChar()}{nick()}
              </span>
            </Show>
            <div class="msg-body">
              <span class="irc-msg-text text-[13px] text-amber-200/80" innerHTML={html()} onClick={onBodyClick} />
            </div>
          </div>
        </Match>

        <Match when={!props.isDesktop}>
          {/* ── Regular message, mobile stacked layout ── */}
          <div
            class={`group ${settings.compactMode || props.grouped ? '' : 'mt-2.5'} ${props.line.highlight ? 'msg-highlight' : ''}`}
            {...rowHandlers}
          >
            <Show when={!props.grouped}>
              <div class="flex items-baseline gap-2 px-3 pt-1.5">
                <span
                  class="font-semibold text-[13px] truncate max-w-[60%] inline-flex items-center gap-1"
                  style={nickStyle()}
                >
                  {prefixChar()}{nick()}
                  {botBadge('')}
                </span>
                <Show when={timestamp()}>
                  <span class="text-[10px] text-gray-500 font-mono tabular-nums shrink-0">{timestamp()}</span>
                </Show>
              </div>
            </Show>
            <div class="px-3 pb-0.5">
              <Show when={props.line.replyTo}>{(pid) => <ReplyingToIndicator parentMsgid={pid()} />}</Show>
              <span class="irc-msg-text text-[14px] leading-[1.55] text-gray-200" innerHTML={html()} onClick={onBodyClick} />
              <ReplyAction nick={nick()} canReply={canReply()} onReply={startReply} />
              <ThreadAction canOpen={canReply()} onOpen={openLineThread} />
              <SaveAction canSave={canSave()} saved={saved()} onToggle={toggleSaved} />
            </div>
          </div>
        </Match>
      </Switch>

      <Show when={menu()}>
        {(m) => (
          <MessageContextMenu
            x={m().x}
            y={m().y}
            text={plainText()}
            urls={urls()}
            canReact={!!props.line.msgid && showOnyxChrome()}
            onReact={(emoji) => {
              const msgid = props.line.msgid;
              if (msgid) sendReactionTag(props.bufferPtr, msgid, emoji);
              setMenu(null);
            }}
            canReply={canReply()}
            onReply={startReply}
            canOpenThread={canReply()}
            onOpenThread={openLineThread}
            canSave={canSave()}
            saved={saved()}
            onToggleSaved={toggleSaved}
            onClose={() => setMenu(null)}
          />
        )}
      </Show>
    </>
  );
}
