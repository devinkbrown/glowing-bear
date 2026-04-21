<script lang="ts">
  import { tick } from 'svelte';
  import { chat } from '$lib/stores/chat.svelte.js';
  import { buffers } from '$lib/stores/buffers.svelte.js';
  import { settings } from '$lib/stores/settings.svelte.js';
  import { formatText, nickColor, extractEmbeds } from '$lib/irc/formatter.js';
  import { formatTimestamp, formatFullTimestamp, relativeTime } from '$lib/utils/timestamps.js';
  import type { WeeChatLine } from '$lib/weechat/types.js';
  import BearLogo from './BearLogo.svelte';
  import UserProfile from './UserProfile.svelte';
  import MessageEmbed from './MessageEmbed.svelte';

  interface Props {
    bufferPointer?: string | null;
  }
  const { bufferPointer = null }: Props = $props();

  const activePtr = $derived(bufferPointer ?? buffers.active);
  const entry    = $derived(activePtr ? buffers.buffers.get(activePtr) : null);
  const buf      = $derived(entry?.buffer ?? null);
  const lines    = $derived(entry?.lines ?? []);
  const loading  = $derived(entry?.loading ?? false);
  const reactions = $derived(entry?.reactions ?? new Map());
  const msgIndex  = $derived(entry?.msgIndex ?? new Map());

  // Typing indicator — prune stale entries every 3 s
  const typingUsers = $derived.by(() => {
    const now = Date.now();
    if (!entry) return [] as Array<{ nick: string; state: 'active' | 'paused' }>;
    return [...entry.typing.entries()]
      .filter(([, info]) => info.expiry > now)
      .map(([nick, info]) => ({ nick, state: info.state }));
  });

  // Profile panel state — auto-close when buffer changes
  let profileNick = $state<string | null>(null);
  $effect(() => { void activePtr; profileNick = null; });

  // Mobile long-press action sheet
  interface SheetTarget {
    msgid: string | null;
    nick: string;
    text: string; // plain text of message
  }
  let actionSheet = $state<SheetTarget | null>(null);

  function openActionSheet(msgid: string | null, nick: string, rawMsg: string) {
    const text = rawMsg.replace(/[\x02\x03\x0f\x16\x1a\x1b\x1c\x1d\x1f](\d{1,2}(,\d{1,2})?)?/g, '').replace(/\x19[^\s]*/g, '');
    actionSheet = { msgid, nick, text };
  }
  function closeActionSheet() { actionSheet = null; }
  function sheetReply() {
    if (!actionSheet?.msgid || !bufferPointer === false) return; // primary pane only
    window.dispatchEvent(new CustomEvent('set-reply', { detail: { msgid: actionSheet.msgid, nick: actionSheet.nick, text: actionSheet.text } }));
    closeActionSheet();
  }
  function sheetCopy() {
    if (actionSheet) navigator.clipboard?.writeText(actionSheet.text);
    closeActionSheet();
  }
  function sheetReact() {
    if (!actionSheet?.msgid) { closeActionSheet(); return; }
    // Reuse the react picker — position in centre of screen
    reactPicker = { msgid: actionSheet.msgid, x: window.innerWidth / 2 - 140, y: window.innerHeight / 2 - 30 };
    closeActionSheet();
  }

  // Reaction picker state
  const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👀', '✅'];
  let reactPicker = $state<{ msgid: string; x: number; y: number } | null>(null);

  function openReactPicker(e: MouseEvent, msgid: string) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pickerW = 280;
    const pickerH = 50;
    const x = Math.min(rect.left, vw - pickerW - 8);
    // Prefer above the button; if that clips the top, place below instead
    const yAbove = rect.top - pickerH - 6;
    const yBelow = rect.bottom + 6;
    const y = yAbove >= 8 ? yAbove : Math.min(yBelow, vh - pickerH - 8);
    reactPicker = { msgid, x: Math.max(8, x), y: Math.max(8, y) };
  }

  function sendReaction(emoji: string) {
    if (!reactPicker || !buf) return;
    const target = buf.shortName || buf.name;
    chat.sendInput(`/quote @+react=${emoji};+reply=${reactPicker.msgid} TAGMSG ${target} :`);
    reactPicker = null;
  }

  function closeReactPicker(e: MouseEvent) {
    if (reactPicker && !(e.target as Element).closest('[data-react-picker]')) {
      reactPicker = null;
    }
  }

  $effect(() => {
    const id = setInterval(() => {
      if (activePtr) buffers.pruneTyping(activePtr);
    }, 3000);
    return () => clearInterval(id);
  });

  let viewport: HTMLDivElement;
  let atBottom = $state(true);
  let newCount = $state(0);
  let readMarkerId = $state<string | null>(null);

  // Set when the user sends a message: force-scroll to the very next line that
  // arrives, regardless of atBottom state.  Cleared once used.
  let scrollOnNext = false;

  // When the user sends, ensure we're scrolled to show their echo when it arrives.
  $effect(() => {
    function onScrollBottom() {
      scrollOnNext = true;
      atBottom = true;
      newCount = 0;
      scrollToBottom();
    }
    window.addEventListener('scroll-bottom', onScrollBottom);
    return () => window.removeEventListener('scroll-bottom', onScrollBottom);
  });

  // Buffer scroll resume: remember scroll position when leaving a buffer
  const scrollPositions = new Map<string, number>();

  // Track buffer switches
  let prevActive = $state<string | null>(null);
  $effect(() => {
    const cur = activePtr;
    if (cur !== prevActive) {
      if (prevActive) {
        const old = buffers.buffers.get(prevActive);
        if (old && old.lines.length > 0) {
          readMarkerId = old.lines[old.lines.length - 1].id;
        }
        // Save scroll position
        if (viewport && !atBottom) {
          scrollPositions.set(prevActive, viewport.scrollTop);
        } else if (prevActive) {
          scrollPositions.delete(prevActive);
        }
      }
      prevActive = cur;
      newCount = 0;
      // Restore saved position or go to bottom
      tick().then(() => {
        const saved = cur ? scrollPositions.get(cur) : undefined;
        if (saved !== undefined && viewport) {
          viewport.style.scrollBehavior = 'auto';
          viewport.scrollTop = saved;
          viewport.style.scrollBehavior = '';
          atBottom = false;
        } else {
          atBottom = true;
          scrollToBottom();
        }
      });
    }
  });

  // (onMessageAreaClick is defined above with the lightbox handler)

  // Re-scroll to bottom when font size or compact mode changes (row heights change)
  $effect(() => {
    void settings.fontSize;
    void settings.compactMode;
    if (atBottom) tick().then(scrollToBottom);
  });

  // Scroll on new messages
  let prevLen = $state(0);
  $effect(() => {
    const len = lines.length;
    if (len > prevLen) {
      if (atBottom || scrollOnNext) {
        scrollOnNext = false;
        atBottom = true;
        // Use rAF so the new row is painted before we measure scrollHeight
        requestAnimationFrame(scrollToBottom);
      } else {
        newCount += len - prevLen;
      }
    }
    prevLen = len;
  });

  function scrollToBottom() {
    if (!viewport) return;
    // Disable smooth-scroll for this programmatic jump so onScroll doesn't
    // fire intermediate positions that would flip atBottom back to false.
    viewport.style.scrollBehavior = 'auto';
    viewport.scrollTop = viewport.scrollHeight;
    viewport.style.scrollBehavior = '';
    newCount = 0;
  }
  function onScroll() {
    if (!viewport) return;
    const dist = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    atBottom = dist < 60;
    if (atBottom) newCount = 0;
  }
  function jumpToBottom() { atBottom = true; newCount = 0; scrollToBottom(); }
  function loadMore() { chat.requestHistory(lines.length + 150, activePtr ?? undefined); }

  // ── Formatting helpers ──────────────────────────────────────────────────────

  function isSystemTag(tags: string[]): boolean {
    return tags.some(t =>
      t === 'irc_join'    || t === 'irc_part'    || t === 'irc_quit' ||
      t === 'irc_nick'    || t === 'irc_mode'    || t === 'irc_topic' ||
      t === 'irc_kick'    || t === 'irc_chghost' || t === 'irc_account'
    );
  }

  function isNoticeTag(tags: string[]): boolean {
    return tags.includes('irc_notice');
  }

  function isActionLine(line: WeeChatLine): boolean {
    // ZNC/IRC backend strips CTCP and sets isAction; WeeChat relay keeps raw CTCP wrapper
    return !!line.isAction || (line.message.startsWith('\x01ACTION ') && line.message.endsWith('\x01'));
  }

  function actionText(line: WeeChatLine): string {
    const m = line.message;
    if (m.startsWith('\x01ACTION ') && m.endsWith('\x01')) return m.slice(8, -1);
    // ZNC/IRC backend: message is already the action text
    return m;
  }

  function isJoinPartHidden(line: WeeChatLine): boolean {
    // Always suppress no-op CHGHOST where old and new host are the same (case-insensitive)
    if (line.tags.includes('irc_chghost')) {
      const m = line.message.match(/\(([^)]+)\)\s+has changed host to\s+(\S+)/i);
      if (m && m[1].toLowerCase() === m[2].toLowerCase()) return true;
    }
    if (!settings.joinPartMsgs) {
      return line.tags.some(t =>
        t === 'irc_join' || t === 'irc_part' || t === 'irc_quit' ||
        t === 'irc_chghost' || t === 'irc_account'
      );
    }
    return false;
  }

  // Tick counter for relative timestamps — increments every 30 s so reactive
  // expressions that call ts() re-evaluate.
  let relTick = $state(0);
  $effect(() => {
    if (settings.timestampFormat !== 'relative') return;
    const id = setInterval(() => { relTick++; }, 30_000);
    return () => clearInterval(id);
  });

  function ts(line: WeeChatLine): string {
    if (settings.timestampFormat === 'off') return '';
    if (settings.timestampFormat === 'relative') {
      void relTick; // subscribe to tick
      return relativeTime(line.date);
    }
    return formatTimestamp(line.date, settings.timestampFormat);
  }
  function fullTs(line: WeeChatLine): string { return formatFullTimestamp(line.date); }

  function nickStyle(nick: string): string {
    if (!settings.colorNicks) return '';
    return `color: ${nickColor(nick)}`;
  }

  function fmtMsg(text: string): string { return formatText(text, settings.inlineImages); }

  // ── In-buffer search ────────────────────────────────────────────────────────
  let showSearch = $state(false);
  let searchQuery = $state('');
  let searchCursor = $state(0);
  let searchInputEl = $state<HTMLInputElement | null>(null);

  // Strip IRC formatting codes for plain-text matching
  function stripIRC(s: string): string {
    return s
      .replace(/\x02|\x0f|\x16|\x1d|\x1f/g, '')
      .replace(/\x03\d{0,2}(,\d{0,2})?/g, '')
      .replace(/\x19[^\s]*/g, '')
      .replace(/\x1a.|\x1b./g, '')
      .toLowerCase();
  }

  const searchMatches = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !showSearch) return [] as number[];
    const hits: number[] = [];
    groups.forEach((grp, idx) => {
      const text = grp.lines.map(l => stripIRC(l.message) + ' ' + l.nick).join(' ');
      if (text.includes(q)) hits.push(idx);
    });
    return hits;
  });

  $effect(() => {
    // Reset cursor when query or buffer changes
    void searchQuery;
    void activePtr;
    searchCursor = 0;
  });

  $effect(() => {
    // Scroll matched group into view
    const idx = searchMatches[searchCursor];
    if (idx === undefined || !viewport) return;
    tick().then(() => {
      const el = viewport.querySelector(`[data-grp-idx="${idx}"]`) as HTMLElement | null;
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  });

  function openSearch() {
    showSearch = true;
    tick().then(() => searchInputEl?.focus());
  }

  function closeSearch() {
    showSearch = false;
    searchQuery = '';
  }

  function searchNext(dir: 1 | -1) {
    if (!searchMatches.length) return;
    searchCursor = ((searchCursor + dir) % searchMatches.length + searchMatches.length) % searchMatches.length;
  }

  function onSearchKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { closeSearch(); return; }
    if (e.key === 'Enter') { searchNext(e.shiftKey ? -1 : 1); return; }
  }

  function getReplyContext(replyTo: string): WeeChatLine | null {
    return msgIndex.get(replyTo) ?? null;
  }

  function reactionTitle(nicks: string[]): string {
    return nicks.slice(0, 8).join(', ') + (nicks.length > 8 ? ` +${nicks.length - 8} more` : '');
  }

  // Strip WeeChat/IRC codes from prefix to get plain nick
  // Skip WeeChat extended color specifier: digits, pipes, commas (e.g. |014, 01,02)
  function skipWeeColor(s: string, i: number): number {
    while (i < s.length) {
      const c = s.charCodeAt(i);
      if ((c >= 0x30 && c <= 0x39) || c === 0x7c || c === 0x2c) i++;
      else break;
    }
    return i;
  }

  function getNick(line: WeeChatLine): string {
    let s = line.prefix;
    let out = '';
    let i = 0;
    while (i < s.length) {
      const c = s.charCodeAt(i);
      if (c === 0x19) {
        i++;
        if (i < s.length) {
          const n = s.charCodeAt(i);
          if (n === 0x1c) { i++; }
          else if (n === 0x40) { i += 6; }  // \x19@ + 5-char extended pair
          else if (n === 0x46 || n === 0x42 || n === 0x2a || n === 0x7e) {
            // \x19{F|B|*|~} + color spec: basic (NN) or 256-color (|NNN) or pair
            i++;  // skip type byte
            i = skipWeeColor(s, i);
          }
          else if (n >= 0x30 && n <= 0x39) {
            // \x19 + decimal digits = terminal color pair (variable length)
            i = skipWeeColor(s, i);
          }
          // else: unknown subcode — just consumed \x19
        }
      } else if (c === 0x1a || c === 0x1b) { i += 2; }
      else if (c === 0x1c) { i++; }
      else { out += s[i]; i++; }
    }
    return out.replace(/\x02|\x03\d{0,2}(,\d{0,2})?|\x0f|\x16|\x1d|\x1f/g, '').trim();
  }

  // ── Message grouping ────────────────────────────────────────────────────────
  // Group consecutive messages from the same nick within 5 min into a block.

  interface MessageGroup {
    id: string;           // stable key = first line id
    nick: string;
    modePrefix: string;   // IRC mode prefix char e.g. '.', '@', '+', '' if none
    isSystem: boolean;
    isAction: boolean;
    isNotice: boolean;
    isWhisper: boolean;
    highlight: boolean;
    lines: WeeChatLine[];
    readMarkerBefore: boolean;
    dayLabel: string | null;  // non-null when this group starts a new calendar day
  }

  // ── Lightbox ────────────────────────────────────────────────────────────────
  let lightboxSrc = $state<string | null>(null);

  function onMessageAreaClick(e: MouseEvent) {
    const img = (e.target as Element).closest('img.irc-inline-image') as HTMLImageElement | null;
    if (img) { e.preventDefault(); lightboxSrc = img.src; return; }
    const btn = (e.target as Element).closest('.irc-chan-ref') as HTMLElement | null;
    if (!btn) return;
    const channel = btn.dataset.channel;
    if (!channel) return;
    for (const [id, entry] of buffers.buffers) {
      const name = entry.buffer.shortName || entry.buffer.name;
      if (name.toLowerCase() === channel.toLowerCase()) { chat.setActive(id); return; }
    }
  }

  // Mode prefix chars that appear before the nick in line.prefix after stripping colors
  const MODE_CHARS = new Set(['.', '~', '&', '@', '%', '+', '!', '*']);

  // Prefix color map for known mode chars (fallback when nicklist isn't available)
  const MODE_COLORS: Record<string, string> = {
    '.': '#e5b80b', '~': '#e5b80b',
    '&': '#e05252',
    '@': '#4ade80',
    '%': '#fb923c',
    '+': '#60a5fa',
  };

  function getModePrefix(line: WeeChatLine): string {
    if (!line.nick) return '';
    const full = getNick(line);
    // full may be ".nick" or "@nick" or just "nick"
    if (full.endsWith(line.nick) && full.length > line.nick.length) {
      const pre = full.slice(0, full.length - line.nick.length);
      // Keep only recognised mode characters
      return [...pre].filter(c => MODE_CHARS.has(c)).join('');
    }
    return '';
  }

  function modePrefixStyle(p: string): string {
    const col = MODE_COLORS[p[0]] ?? '#9ca3af';
    return `color: ${col}`;
  }

  const FIVE_MIN = 5 * 60 * 1000;

  function dayLabel(date: Date): string {
    const now = new Date();
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: diff > 365 ? 'numeric' : undefined });
  }

  const groups = $derived.by((): MessageGroup[] => {
    const result: MessageGroup[] = [];
    let readMarkerUsed = false;
    let lastDayKey = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isJoinPartHidden(line)) continue;

      // Prefer line.nick (from nick_xxx IRC tag — already plain text) over
      // parsing the formatted prefix, which may have unstripped color codes.
      const nick = line.nick ?? getNick(line);
      const sys  = isSystemTag(line.tags);
      const act  = isActionLine(line);
      const ntc  = isNoticeTag(line.tags);
      const wsp  = !!line.isWhisper;
      const rmBefore = !readMarkerUsed &&
        settings.readMarker && readMarkerId !== null &&
        i > 0 && lines[i - 1].id === readMarkerId;
      if (rmBefore) readMarkerUsed = true;

      // Day separator
      const dk = `${line.date.getFullYear()}-${line.date.getMonth()}-${line.date.getDate()}`;
      const newDay = dk !== lastDayKey;
      if (newDay) lastDayKey = dk;

      // System, action, notice, whisper, highlight all get their own group
      const forceBreak = sys || act || ntc || wsp || line.highlight;

      const prev = result.at(-1);
      const canAppend =
        !forceBreak &&
        !newDay &&
        prev &&
        !prev.isSystem && !prev.isAction && !prev.isNotice && !prev.isWhisper && !prev.highlight &&
        prev.nick === nick &&
        !rmBefore &&
        (line.date.getTime() - prev.lines.at(-1)!.date.getTime()) < FIVE_MIN;

      if (canAppend) {
        prev!.lines.push(line);
      } else {
        result.push({
          id: line.id,
          nick,
          modePrefix: getModePrefix(line),
          isSystem: sys,
          isAction: act,
          isNotice: ntc,
          isWhisper: wsp,
          highlight: line.highlight,
          lines: [line],
          readMarkerBefore: rmBefore,
          dayLabel: newDay ? dayLabel(line.date) : null,
        });
      }
    }
    return result;
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<svelte:window
  onmousedown={closeReactPicker}
  onkeydown={(e) => {
    if (e.ctrlKey && e.key === 'f' && !bufferPointer) {
      e.preventDefault();
      if (showSearch) { searchNext(1); } else { openSearch(); }
    }
  }}
/>

<div class="flex flex-col flex-1 min-h-0 min-w-0 relative bg-gray-950">

  <!-- Custom background image -->
  {#if settings.bgImage}
    <div
      class="absolute inset-0 z-0 pointer-events-none overflow-hidden"
      aria-hidden="true"
    >
      <div style="
        position: absolute; inset: -{settings.bgBlur * 2}px;
        background-image: url('{settings.bgImage}');
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        opacity: {settings.bgOpacity / 100};
        filter: {settings.bgBlur > 0 ? `blur(${settings.bgBlur}px)` : 'none'};
      "></div>
      {#if settings.bgTint}
        <div style="
          position: absolute; inset: 0;
          background: {settings.bgTint};
          opacity: {settings.bgTintOpacity / 100};
        "></div>
      {/if}
    </div>
  {/if}

  <!-- DarkBear watermark — absolute centered behind messages -->
  {#if settings.watermarkOpacity > 0}
    <div
      class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none z-0"
      style="opacity: {settings.watermarkOpacity / 100};"
      aria-hidden="true"
    >
      <BearLogo size={96} variant="mono" color="var(--color-gray-500, #484b5c)" class="mb-3" />
      <div style="font-size: 20px; font-weight: 700; letter-spacing: 0.1em; color: var(--color-gray-500, #484b5c); font-family: var(--app-font);">DarkBear</div>
    </div>
  {/if}

  <!-- Search bar -->
  {#if showSearch && !bufferPointer}
    <div class="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-gray-900/95 border-b border-white/8 z-20 relative">
      <svg class="w-3.5 h-3.5 text-gray-500 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="6.5" cy="6.5" r="4.5"/><path d="m10 10 3.5 3.5"/></svg>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        bind:this={searchInputEl}
        bind:value={searchQuery}
        onkeydown={onSearchKeydown}
        type="text"
        placeholder="Search messages…"
        autocomplete="off"
        spellcheck="false"
        autofocus
        class="flex-1 bg-transparent outline-none text-sm text-gray-200 placeholder-gray-600 min-w-0"
      />
      {#if searchMatches.length > 0}
        <span class="text-[11px] text-gray-500 tabular-nums flex-shrink-0">
          {searchCursor + 1}/{searchMatches.length}
        </span>
      {:else if searchQuery.trim()}
        <span class="text-[11px] text-gray-600 flex-shrink-0">no matches</span>
      {/if}
      <button onclick={() => searchNext(-1)} disabled={searchMatches.length === 0}
        class="text-gray-500 hover:text-gray-300 disabled:opacity-30 flex-shrink-0 p-0.5" title="Previous (Shift+Enter)">
        <svg class="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 10l4-4 4 4"/></svg>
      </button>
      <button onclick={() => searchNext(1)} disabled={searchMatches.length === 0}
        class="text-gray-500 hover:text-gray-300 disabled:opacity-30 flex-shrink-0 p-0.5" title="Next (Enter)">
        <svg class="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6l4 4 4-4"/></svg>
      </button>
      <button onclick={closeSearch} class="text-gray-500 hover:text-gray-300 flex-shrink-0 p-0.5" title="Close (Esc)">
        <svg class="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l10 10M13 3L3 13"/></svg>
      </button>
    </div>
  {/if}

  <!-- Message list -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    role="log"
    aria-label="Messages"
    aria-live="polite"
    bind:this={viewport}
    onscroll={onScroll}
    onclick={onMessageAreaClick}
    class="flex-1 overflow-y-auto msg-area py-2 lg:py-3 select-text relative z-10"
    style="font-size: {settings.fontSize}px; -webkit-user-select: text; user-select: text;"
  >
    {#if !buf}
      <!-- Empty state -->
      <div class="flex flex-col items-center justify-center h-full gap-4 text-gray-600 select-none px-8 text-center">
        <svg class="w-14 h-14 opacity-15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <div>
          <div class="text-xl font-semibold text-gray-600 mb-1">DarkBear</div>
          <div class="text-sm text-gray-700">Connect to WeeChat relay to begin.</div>
        </div>
      </div>
    {:else}
      <!-- Load more -->
      <div class="flex justify-center py-3 px-4">
        {#if loading}
          <span class="flex items-center gap-2 text-xs text-gray-600">
            <span class="w-3 h-3 rounded-full border border-gray-600 border-t-transparent animate-spin inline-block"></span>
            Loading…
          </span>
        {:else}
          <button
            onclick={loadMore}
            class="text-xs text-gray-600 hover:text-gray-400 transition-colors px-3 py-1 rounded-lg hover:bg-gray-800/50"
          >
            Load earlier messages
          </button>
        {/if}
      </div>

      {#each groups as grp, gi (grp.id)}
        {@const isSearchMatch = showSearch && searchMatches.includes(gi)}
        {@const isSearchCurrent = isSearchMatch && searchMatches[searchCursor] === gi}
        <!-- Day separator -->
        {#if grp.dayLabel}
          <div class="flex items-center gap-3 px-3 py-3 select-none pointer-events-none">
            <div class="flex-1 h-px bg-white/6"></div>
            <span class="text-[10px] text-gray-600 font-semibold px-1">{grp.dayLabel}</span>
            <div class="flex-1 h-px bg-white/6"></div>
          </div>
        {/if}

        <!-- Read marker -->
        {#if grp.readMarkerBefore}
          <div class="flex items-center gap-3 px-3 py-2 my-1 select-none pointer-events-none">
            <div class="flex-1 h-px bg-blue-500/20"></div>
            <span class="text-[10px] text-blue-400/40 font-semibold uppercase tracking-widest">new</span>
            <div class="flex-1 h-px bg-blue-500/20"></div>
          </div>
        {/if}

        {#if grp.isSystem}
          <!-- ── System line ── timestamp + centered italic text -->
          {@const sysMsg = (() => {
            let m = grp.lines[0].message.replace(/^\S+\.\S+[ -]+/, '');
            // "Mode #channel [+modes] by nick" → "+modes by nick" (strip "by server")
            m = m.replace(/^Mode \S+ \[([^\]]+)\] by (\S+)$/, (_, modes, setter) =>
              setter.includes('.') ? modes : `${modes} by ${setter}`);
            return m.trim();
          })()}
          {#if sysMsg}
          <div data-grp-idx={gi} class="flex items-baseline gap-2 px-3 py-px {isSearchCurrent ? 'bg-yellow-400/10 outline outline-1 outline-yellow-400/20 rounded' : isSearchMatch ? 'bg-yellow-400/5' : ''}">
            <span class="w-[44px] sm:w-[52px] flex-shrink-0 text-right text-[11px] text-gray-500 font-mono tabular-nums select-none">{ts(grp.lines[0])}</span>
            <span class="irc-msg-text flex-1 min-w-0 text-gray-400 italic">
              {@html fmtMsg(sysMsg)}
            </span>
          </div>
          {/if}

        {:else if grp.isAction}
          <!-- ── /me action ── * nick action -->
          <div data-grp-idx={gi} class="flex items-baseline gap-2 px-3 py-px {grp.highlight ? 'bg-yellow-500/5 border-l-2 border-yellow-400/50' : ''} {isSearchCurrent ? 'bg-yellow-400/10 outline outline-1 outline-yellow-400/20 rounded' : isSearchMatch ? 'bg-yellow-400/5' : ''}">
            <span class="w-[44px] sm:w-[52px] flex-shrink-0 text-right text-[11px] text-gray-500 font-mono tabular-nums select-none">{ts(grp.lines[0])}</span>
            <span class="irc-msg-text flex-1 min-w-0 text-gray-300 italic">
              <span class="not-italic text-gray-400 mr-1">*</span>
              <span class="not-italic font-semibold" style={nickStyle(grp.nick)}>{grp.nick}</span>
              {' '}{@html fmtMsg(actionText(grp.lines[0]))}
            </span>
          </div>

        {:else if grp.isNotice}
          <!-- ── Notice ── -nick- message (server notices strip redundant prefix) -->
          {@const isServerNotice = grp.nick.includes('.') || grp.nick.endsWith('-')}
          {@const rawNoticeMsg = grp.lines[0].message.replace(/^Notice\([^)]*\)\s*->\s*\S+\s*:\s*/, '')}
          <div data-grp-idx={gi} class="flex items-baseline gap-2 px-3 py-px {isSearchCurrent ? 'bg-yellow-400/10 outline outline-1 outline-yellow-400/20 rounded' : isSearchMatch ? 'bg-yellow-400/5' : ''}">
            <span class="w-[44px] sm:w-[52px] flex-shrink-0 text-right text-[11px] text-gray-500 font-mono tabular-nums select-none">{ts(grp.lines[0])}</span>
            {#if isServerNotice}
              <span class="text-[11px] text-gray-600 flex-shrink-0 select-none font-mono">notice</span>
            {:else}
              <span class="text-gray-400 flex-shrink-0 select-none" style="font-size: 0.857em">-<span style={nickStyle(grp.nick)}>{grp.nick}</span>-</span>
            {/if}
            <span class="irc-msg-text flex-1 min-w-0 text-gray-400 italic">{@html fmtMsg(isServerNotice ? rawNoticeMsg : grp.lines[0].message)}</span>
          </div>

        {:else if !grp.isAction && grp.nick.includes('.') && grp.nick.length > 1}
          <!-- ── Server info line ── numeric replies with server name as nick -->
          <div data-grp-idx={gi} class="flex items-baseline gap-2 px-3 py-px {isSearchCurrent ? 'bg-yellow-400/10 outline outline-1 outline-yellow-400/20 rounded' : isSearchMatch ? 'bg-yellow-400/5' : ''}">
            <span class="w-[44px] sm:w-[52px] flex-shrink-0 text-right text-[11px] text-gray-500 font-mono tabular-nums select-none">{ts(grp.lines[0])}</span>
            <span class="irc-msg-text flex-1 min-w-0 text-gray-400 italic">{@html fmtMsg(grp.lines[0].message)}</span>
          </div>

        {:else if grp.isWhisper}
          <!-- ── Whisper (IRCx) ── DM-style -->
          <div data-grp-idx={gi} class="flex items-baseline gap-2 px-3 py-px rounded-lg mx-2 my-0.5 {isSearchCurrent ? 'outline outline-1 outline-yellow-400/30' : ''}" style="background: rgba(139,92,246,0.07); border-left: 2px solid rgba(139,92,246,0.4);">
            <span class="w-[44px] sm:w-[52px] flex-shrink-0 text-right text-[11px] text-gray-500 font-mono tabular-nums select-none">{ts(grp.lines[0])}</span>
            <span class="text-purple-400 flex-shrink-0 select-none font-medium" style="font-size: 0.857em">&gt;<span style={nickStyle(grp.nick)}>{grp.nick}</span>&lt;</span>
            <span class="irc-msg-text flex-1 min-w-0 text-purple-200">{@html fmtMsg(grp.lines[0].message)}</span>
          </div>

        {:else}
          <!-- ── Chat message group ── nick header + fixed-indent messages -->
          <!-- All message text starts at the same left edge regardless of nick length -->
          <div data-grp-idx={gi} class="group/grp relative {grp.highlight ? 'bg-yellow-500/5 border-l-2 border-yellow-400/50' : ''} {isSearchCurrent ? 'bg-yellow-400/10 outline outline-1 outline-yellow-400/20 rounded' : isSearchMatch ? 'bg-yellow-400/5' : ''}">

            <!-- Group header: timestamp + nick (no message text here) -->
            <div class="flex items-baseline gap-2 px-3 pb-0 pt-px">
              <span class="w-[44px] sm:w-[52px] flex-shrink-0 text-right text-[11px] text-gray-500 font-mono tabular-nums select-none">{ts(grp.lines[0])}</span>
              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions a11y_interactive_supports_focus -->
              <span
                role="button"
                tabindex="-1"
                class="font-semibold text-[13px] cursor-pointer select-none active:opacity-60 transition-opacity leading-snug"
                style={nickStyle(grp.nick)}
                onclick={() => { profileNick = grp.nick; }}
              >{grp.nick}</span>
            </div>

            <!-- Message lines — all start at the same fixed indent -->
            {#each grp.lines as line, li (line.id)}
              {@const lineReactions = line.msgid ? (reactions.get(line.msgid) ?? []) : []}
              {@const replyCtx = line.replyTo ? getReplyContext(line.replyTo) : null}

              <div class="group/line hover:bg-white/[0.025] transition-colors">

                <!-- Reply context quote -->
                {#if replyCtx}
                  <div class="flex items-center pl-[64px] sm:pl-[72px] pr-3 mb-0.5 mt-0.5">
                    <svg class="w-2 h-2 text-gray-600 flex-shrink-0 mr-1.5" viewBox="0 0 8 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                      <path d="M1 6V3a2 2 0 012-2h4"/>
                    </svg>
                    <span class="text-[11px] text-gray-500 truncate italic border-l-2 border-gray-700 pl-2">
                      <span class="font-medium not-italic" style={nickStyle(replyCtx.nick ?? '')}>{replyCtx.nick}</span>
                      {' '}{@html fmtMsg(replyCtx.message).replace(/<[^>]+>/g, '').slice(0, 80)}
                    </span>
                  </div>
                {/if}

                <!-- Message row: fixed indent matching timestamp column -->
                <div class="flex items-baseline gap-2 px-3 py-px relative">
                  <span class="w-[44px] sm:w-[52px] flex-shrink-0 invisible sm:group-hover/line:visible text-right text-[11px] text-gray-500 font-mono tabular-nums select-none">{ts(line)}</span>
                  <span class="irc-msg-text flex-1 min-w-0 text-gray-200">{@html fmtMsg(line.message)}</span>
                  <!-- Mobile action button -->
                  <button
                    class="sm:hidden flex-shrink-0 self-center w-6 h-6 flex items-center justify-center text-gray-700 active:text-gray-400 select-none"
                    ontouchend={(e) => { e.preventDefault(); openActionSheet(line.msgid ?? null, grp.nick, line.message); }}
                    aria-label="Message actions"
                  >
                    <svg class="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.25"/><circle cx="8" cy="8" r="1.25"/><circle cx="8" cy="13" r="1.25"/></svg>
                  </button>
                  <!-- Hover actions (desktop) -->
                  <div class="hidden sm:flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover/line:opacity-100 transition-opacity">
                    <!-- Reply -->
                    {#if line.msgid && !bufferPointer}
                      {@const plainText = line.message.replace(/[\x02\x03\x0f\x16\x1a\x1b\x1c\x1d\x1f](\d{1,2}(,\d{1,2})?)?/g, '').replace(/\x19[^\s]*/g, '')}
                      <button
                        class="flex items-center justify-center w-6 h-6 rounded-md text-gray-600 hover:text-blue-400 hover:bg-blue-500/10"
                        title="Reply"
                        onclick={() => window.dispatchEvent(new CustomEvent('set-reply', { detail: { msgid: line.msgid, nick: grp.nick, text: plainText } }))}
                      >
                        <svg class="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M6 3L2 7l4 4M2 7h8a4 4 0 0 1 0 8H7"/>
                        </svg>
                      </button>
                    {/if}
                    <!-- Copy message -->
                    <button
                      class="flex items-center justify-center w-6 h-6 rounded-md text-gray-600 hover:text-gray-300 hover:bg-white/10"
                      title="Copy message"
                      onclick={() => navigator.clipboard?.writeText(line.message.replace(/[\x02\x03\x0f\x16\x1a\x1b\x1c\x1d\x1f](\d{1,2}(,\d{1,2})?)?/g, '').replace(/\x19[^\s]*/g, ''))}
                    >
                      <svg class="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="5" y="5" width="9" height="9" rx="1.5"/>
                        <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2H3.5A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5"/>
                      </svg>
                    </button>
                    <!-- React -->
                    {#if line.msgid}
                      <button
                        class="flex items-center justify-center w-6 h-6 rounded-md text-gray-600 hover:text-gray-300 hover:bg-white/10"
                        title="React"
                        onmousedown={(e) => e.stopPropagation()}
                        onclick={(e) => openReactPicker(e, line.msgid!)}
                      >
                        <span class="text-[13px] leading-none">☺</span>
                      </button>
                    {/if}
                  </div>
                </div>

                <!-- Media embeds (YouTube, video, audio) -->
                {#if settings.inlineImages}
                  {@const embeds = extractEmbeds(line.message)}
                  {#each embeds as embed}
                    <MessageEmbed {embed} />
                  {/each}
                {/if}

                <!-- Reactions -->
                {#if lineReactions.length > 0}
                  <div class="flex flex-wrap gap-1 pl-[64px] sm:pl-[72px] pr-3 pb-0.5">
                    {#each lineReactions as r (r.emoji)}
                      <button
                        class="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] bg-gray-800 hover:bg-gray-700 border border-gray-700 transition-colors select-none"
                        title={reactionTitle(r.nicks)}
                        onclick={() => chat.sendInput(`/quote @+react=${r.emoji};+reply=${line.msgid ?? ''} TAGMSG ${buf?.shortName ?? buf?.name ?? ''} :`)}
                      >
                        <span>{r.emoji}</span>
                        <span class="text-gray-400">{r.nicks.length}</span>
                      </button>
                    {/each}
                  </div>
                {/if}

              </div>
            {/each}
          </div>
        {/if}
      {/each}
    {/if}
  </div>

  <!-- Typing indicator -->
  {#if typingUsers.length > 0}
    {@const activeTypers = typingUsers.filter(u => u.state === 'active')}
    {@const pausedTypers = typingUsers.filter(u => u.state === 'paused')}
    <div class="flex items-center gap-2 px-4 py-1 text-[11px] text-gray-500 select-none flex-shrink-0 border-t border-white/5 min-h-[26px]">
      {#if activeTypers.length > 0}
        <!-- Animated bouncing dots for active typers -->
        <span class="flex gap-[3px] items-center flex-shrink-0">
          {#each [0,1,2] as i}
            <span class="w-1.5 h-1.5 rounded-full bg-blue-400/60 animate-bounce" style="animation-delay: {i * 0.15}s"></span>
          {/each}
        </span>
      {:else if pausedTypers.length > 0}
        <!-- Static dots for paused -->
        <span class="flex gap-[3px] items-center flex-shrink-0">
          {#each [0,1,2] as i}
            <span class="w-1.5 h-1.5 rounded-full bg-gray-600"></span>
          {/each}
        </span>
      {/if}
      <span class="truncate">
        {#if typingUsers.length === 1}
          <span class="font-semibold" style="color: {nickColor(typingUsers[0].nick)}">{typingUsers[0].nick}</span>
          {typingUsers[0].state === 'paused' ? ' paused typing' : ' is typing…'}
        {:else if typingUsers.length === 2}
          <span class="font-semibold" style="color: {nickColor(typingUsers[0].nick)}">{typingUsers[0].nick}</span>
          {' and '}
          <span class="font-semibold" style="color: {nickColor(typingUsers[1].nick)}">{typingUsers[1].nick}</span>
          {' are typing…'}
        {:else if typingUsers.length === 3}
          <span class="font-semibold" style="color: {nickColor(typingUsers[0].nick)}">{typingUsers[0].nick}</span>
          {', '}
          <span class="font-semibold" style="color: {nickColor(typingUsers[1].nick)}">{typingUsers[1].nick}</span>
          {' and '}
          <span class="font-semibold" style="color: {nickColor(typingUsers[2].nick)}">{typingUsers[2].nick}</span>
          {' are typing…'}
        {:else}
          {typingUsers.length} people are typing…
        {/if}
      </span>
    </div>
  {/if}

  <!-- Floating reaction picker -->
  {#if reactPicker}
    <div
      data-react-picker
      class="fixed z-50 flex items-center gap-0.5 p-1.5 rounded-full shadow-2xl shadow-black/60"
      style="left: {reactPicker.x}px; top: {reactPicker.y}px; background: var(--color-gray-900, #111318); border: 1px solid rgba(255,255,255,0.1);"
    >
      {#each QUICK_REACTIONS as emoji}
        <button
          class="w-8 h-8 flex items-center justify-center rounded-full text-lg transition-all hover:scale-125 hover:bg-white/10 active:scale-95"
          onclick={() => sendReaction(emoji)}
          title={emoji}
        >{emoji}</button>
      {/each}
    </div>
  {/if}

  <!-- User profile panel -->
  {#if profileNick && activePtr}
    <UserProfile
      nick={profileNick}
      bufferPointer={activePtr}
      onclose={() => (profileNick = null)}
    />
  {/if}

  <!-- Jump to bottom -->
  {#if !atBottom}
    <div class="absolute bottom-2 right-4 z-10">
      <button
        onclick={jumpToBottom}
        class="flex items-center gap-1.5 rounded-full shadow-xl text-xs font-medium px-3 py-1.5 transition-all
          {newCount > 0
            ? 'bg-blue-600 hover:bg-blue-500 text-white'
            : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700'}"
      >
        <svg class="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 2v12M3 10l5 5 5-5"/>
        </svg>
        {#if newCount > 0}{newCount} new{/if}
      </button>
    </div>
  {/if}
</div>

<!-- Image lightbox -->
{#if lightboxSrc}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    role="presentation"
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm"
    onclick={() => (lightboxSrc = null)}
  >
    <!-- svelte-ignore a11y_missing_attribute -->
    <img
      src={lightboxSrc}
      alt=""
      class="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    />
    <button
      class="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
      onclick={() => (lightboxSrc = null)}
      aria-label="Close"
    >
      <svg class="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M3 3l10 10M13 3L3 13"/>
      </svg>
    </button>
    <a
      href={lightboxSrc}
      target="_blank"
      rel="noopener noreferrer"
      class="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/40 hover:text-white/70 transition-colors"
      onclick={(e) => e.stopPropagation()}
    >Open original ↗</a>
  </div>
{/if}


<!-- Mobile long-press action sheet -->
{#if actionSheet}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="fixed inset-0 z-50 flex items-end sm:hidden" onclick={closeActionSheet}>
    <div class="absolute inset-0 bg-black/60"></div>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="relative w-full rounded-t-2xl overflow-hidden"
      style="background: var(--color-gray-900, #111318); border-top: 1px solid rgba(255,255,255,0.08);"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="px-4 pt-4 pb-3 border-b" style="border-color: rgba(255,255,255,0.06);">
        <p class="text-xs font-semibold" style="color: var(--color-gray-400, #686c7e);">{actionSheet.nick}</p>
        <p class="text-sm mt-0.5 line-clamp-2" style="color: var(--color-gray-200, #c4c8d8);">{actionSheet.text.slice(0, 120)}</p>
      </div>
      <div class="flex flex-col">
        {#if actionSheet.msgid && !bufferPointer}
          <button
            class="flex items-center gap-3 px-4 py-3.5 text-sm text-left active:bg-white/5"
            style="color: var(--color-gray-200, #c4c8d8);"
            onclick={sheetReply}
          >
            <svg class="w-4 h-4 flex-shrink-0" style="color: var(--color-gray-400, #686c7e);" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 3L2 7l4 4M2 7h8a4 4 0 0 1 0 8H7"/>
            </svg>
            Reply
          </button>
        {/if}
        {#if actionSheet.msgid}
          <button
            class="flex items-center gap-3 px-4 py-3.5 text-sm text-left active:bg-white/5"
            style="color: var(--color-gray-200, #c4c8d8); border-top: 1px solid rgba(255,255,255,0.04);"
            onclick={sheetReact}
          >
            <span class="w-4 h-4 flex-shrink-0 text-center leading-none text-base">☺</span>
            React
          </button>
        {/if}
        <button
          class="flex items-center gap-3 px-4 py-3.5 text-sm text-left active:bg-white/5"
          style="color: var(--color-gray-200, #c4c8d8); border-top: 1px solid rgba(255,255,255,0.04);"
          onclick={sheetCopy}
        >
          <svg class="w-4 h-4 flex-shrink-0" style="color: var(--color-gray-400, #686c7e);" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="5" y="5" width="9" height="9" rx="1.5"/>
            <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2H3.5A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5"/>
          </svg>
          Copy
        </button>
        <button
          class="flex items-center justify-center px-4 py-3.5 text-sm font-medium active:bg-white/5"
          style="color: var(--color-gray-400, #686c7e); border-top: 1px solid rgba(255,255,255,0.08);"
          onclick={closeActionSheet}
        >Cancel</button>
      </div>
    </div>
  </div>
{/if}
