<script lang="ts">
  import { chat } from '$lib/stores/chat.svelte.js';
  import { buffers } from '$lib/stores/buffers.svelte.js';
  import { completion } from '$lib/stores/completion.svelte.js';
  import { ConnectionState } from '$lib/weechat/types.js';
  import GifPicker from './GifPicker.svelte';

  interface Props {
    bufferPointer?: string | null;
  }
  const { bufferPointer = null }: Props = $props();

  let input = $state('');
  // Per-buffer draft persistence
  const draftMap = new Map<string, string>();
  // Per-buffer history: Map<bufferPointer, string[]>
  const historyMap = new Map<string, string[]>();
  let historyIndex = $state(-1);
  let historyStash = $state('');
  let replyTarget = $state<{ msgid: string; nick: string; text: string } | null>(null);

  function getHistory(): string[] {
    const key = activeBuf ?? '';
    if (!historyMap.has(key)) historyMap.set(key, []);
    return historyMap.get(key)!;
  }
  let textarea: HTMLTextAreaElement;
  let showCompletions = $state(false);
  let pasteLines   = $state<string[]>([]);
  let showGif      = $state(false);
  let uploading    = $state(false);
  let uploadError  = $state('');
  let fileInput: HTMLInputElement;

  // Listen for nick-mention inserts from MessageView / UserList
  $effect(() => {
    function onInsert(e: Event) {
      const text = (e as CustomEvent<string>).detail;
      if (!text) return;
      const start = textarea?.selectionStart ?? input.length;
      const end   = textarea?.selectionEnd   ?? input.length;
      input = input.slice(0, start) + text + input.slice(end);
      requestAnimationFrame(() => {
        if (!textarea) return;
        const pos = start + text.length;
        textarea.selectionStart = textarea.selectionEnd = pos;
        textarea.focus();
      });
    }
    window.addEventListener('insert-text', onInsert);
    return () => window.removeEventListener('insert-text', onInsert);
  });

  // Reply target
  $effect(() => {
    if (bufferPointer) return;
    function onReply(e: Event) {
      replyTarget = (e as CustomEvent<{ msgid: string; nick: string; text: string }>).detail;
      tick().then(() => textarea?.focus());
    }
    window.addEventListener('set-reply', onReply);
    return () => window.removeEventListener('set-reply', onReply);
  });

  // Clear reply on buffer switch
  $effect(() => { void activeBuf; replyTarget = null; });

  // Focus input on 'focus-input' event (only the primary bar, not split panes)
  $effect(() => {
    if (bufferPointer) return; // only primary bar responds
    function onFocus(e: Event) {
      const text = (e as CustomEvent<string>).detail ?? '';
      textarea?.focus();
      if (text) {
        input += text;
        requestAnimationFrame(() => {
          if (textarea) textarea.selectionStart = textarea.selectionEnd = input.length;
        });
      }
    }
    window.addEventListener('focus-input', onFocus);
    return () => window.removeEventListener('focus-input', onFocus);
  });

  const isConnected = $derived(chat.connectionState === ConnectionState.CONNECTED);
  const activeBuf   = $derived(bufferPointer ?? buffers.active);
  const canSend     = $derived(isConnected && !!activeBuf);

  // Resize textarea to fit content (fallback for browsers without field-sizing:content)
  function resize() {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
  }
  $effect(() => { input; resize(); });

  // ── IRCv3 outbound typing indicators ──────────────────────────────────────

  let outTypingState: 'active' | 'paused' | 'done' = 'done';
  let typingPauseTimer: ReturnType<typeof setTimeout> | null = null;

  function getTypingTarget(): { pointer: string; target: string } | null {
    if (!activeBuf) return null;
    const entry = buffers.buffers.get(activeBuf);
    if (!entry) return null;
    const type = entry.buffer.localVars['type'];
    if (type !== 'channel' && type !== 'private') return null;
    const target = entry.buffer.shortName || entry.buffer.name;
    return { pointer: activeBuf, target };
  }

  function sendTyping(state: 'active' | 'paused' | 'done') {
    if (outTypingState === state) return; // no-op
    const t = getTypingTarget();
    if (!t) return;
    outTypingState = state;
    chat.sendTo(t.pointer, `/quote @+typing=${state} TAGMSG ${t.target}`);
  }

  // React to input changes — send active, schedule pause
  $effect(() => {
    const text = input; // track reactively
    if (!text.trim()) {
      if (outTypingState !== 'done') sendTyping('done');
      if (typingPauseTimer) { clearTimeout(typingPauseTimer); typingPauseTimer = null; }
      return;
    }
    sendTyping('active');
    if (typingPauseTimer) clearTimeout(typingPauseTimer);
    typingPauseTimer = setTimeout(() => {
      sendTyping('paused');
      typingPauseTimer = null;
    }, 5000);
  });

  // Save draft + reset on buffer switch
  let prevBuf: string | null = null;
  $effect(() => {
    const cur = activeBuf;
    if (prevBuf !== null && prevBuf !== cur) {
      // Save current text as draft for the buffer we're leaving
      if (input.trim()) draftMap.set(prevBuf, input);
      else draftMap.delete(prevBuf);
      // Restore draft for the new buffer
      input = (cur && draftMap.get(cur)) ?? '';
    }
    prevBuf = cur ?? null;
    outTypingState = 'done';
    historyIndex = -1;
    historyStash = '';
    if (typingPauseTimer) { clearTimeout(typingPauseTimer); typingPauseTimer = null; }
  });

  // ── Keyboard handling ──────────────────────────────────────────────────────

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && replyTarget) { replyTarget = null; return; }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        if (completion.active) { const r = completion.cycle(false); if (r) input = r; }
      } else {
        doComplete();
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      if (completion.active) { e.preventDefault(); const r = completion.cycle(false); if (r) input = r; return; }
      e.preventDefault(); browseHistory(-1); return;
    }
    if (e.key === 'ArrowDown') {
      if (completion.active) { e.preventDefault(); const r = completion.cycle(true); if (r) input = r; return; }
      e.preventDefault(); browseHistory(1); return;
    }
    // Readline keybindings
    if (e.ctrlKey) {
      const pos = textarea?.selectionStart ?? input.length;
      const end = textarea?.selectionEnd ?? input.length;
      if (e.key === 'a') {
        e.preventDefault();
        requestAnimationFrame(() => { textarea.selectionStart = textarea.selectionEnd = 0; });
        return;
      }
      if (e.key === 'e') {
        e.preventDefault();
        requestAnimationFrame(() => { textarea.selectionStart = textarea.selectionEnd = input.length; });
        return;
      }
      if (e.key === 'k') {
        e.preventDefault();
        input = input.slice(0, pos);
        return;
      }
      if (e.key === 'u') {
        e.preventDefault();
        input = input.slice(end);
        requestAnimationFrame(() => { textarea.selectionStart = textarea.selectionEnd = 0; });
        return;
      }
      if (e.key === 'w') {
        e.preventDefault();
        // Delete word before cursor
        const before = input.slice(0, pos);
        const trimmed = before.replace(/\s*\S+\s*$/, '');
        input = trimmed + input.slice(pos);
        requestAnimationFrame(() => { textarea.selectionStart = textarea.selectionEnd = trimmed.length; });
        return;
      }
    }
    // IRC formatting shortcuts (Ctrl+B bold, Ctrl+I italic, Ctrl+` code/mono)
    if (e.ctrlKey && (e.key === 'b' || e.key === 'i' || e.key === '`')) {
      e.preventDefault();
      const code = e.key === 'b' ? '\x02' : e.key === 'i' ? '\x1d' : '\x11';
      const sel = textarea;
      if (sel) {
        const s = sel.selectionStart, en = sel.selectionEnd;
        if (s !== en) {
          // wrap selection
          input = input.slice(0, s) + code + input.slice(s, en) + code + input.slice(en);
          requestAnimationFrame(() => { sel.selectionStart = s + 1; sel.selectionEnd = en + 1; });
        } else {
          // insert at cursor, place cursor between the pair
          input = input.slice(0, s) + code + code + input.slice(s);
          requestAnimationFrame(() => { sel.selectionStart = sel.selectionEnd = s + 1; });
        }
      }
      return;
    }
    if (e.key !== 'Tab') { completion.reset(); showCompletions = false; }
  }

  function doComplete() {
    if (completion.active) {
      const r = completion.cycle(true);
      if (r) input = r;
      return;
    }
    const pos = textarea?.selectionStart ?? input.length;
    const r = completion.complete(input, pos, activeBuf);
    if (r) {
      input = r;
      showCompletions = completion.candidates.length > 1;
      requestAnimationFrame(() => {
        if (textarea) textarea.selectionStart = textarea.selectionEnd = input.length;
      });
    }
  }

  function browseHistory(dir: -1 | 1) {
    const history = getHistory();
    if (!history.length) return;
    if (historyIndex === -1 && dir === -1) {
      historyStash = input; historyIndex = 0; input = history[0];
    } else if (dir === -1) {
      const n = historyIndex + 1;
      if (n < history.length) { historyIndex = n; input = history[n]; }
    } else {
      const n = historyIndex - 1;
      if (n < 0) { historyIndex = -1; input = historyStash; historyStash = ''; }
      else        { historyIndex = n; input = history[n]; }
    }
  }

  function submit() {
    const text = input.trim();
    if (!text || !canSend) return;
    const history = getHistory();
    if (history[0] !== text) { history.unshift(text); if (history.length > 100) history.pop(); }
    historyIndex = -1;
    historyStash = '';
    completion.reset();
    showCompletions = false;
    sendTyping('done');
    if (replyTarget && !text.startsWith('/')) {
      // Send with +reply tag via /quote
      const entry = activeBuf ? buffers.buffers.get(activeBuf) : null;
      const target = entry?.buffer.shortName || entry?.buffer.name;
      if (target) {
        chat.sendInput(`/quote @+reply=${replyTarget.msgid} PRIVMSG ${target} :${text}`, activeBuf ?? undefined);
      } else {
        chat.sendInput(text, activeBuf ?? undefined);
      }
      replyTarget = null;
    } else {
      chat.sendInput(text, activeBuf ?? undefined);
    }
    input = '';
    if (activeBuf) draftMap.delete(activeBuf);
    window.dispatchEvent(new CustomEvent('scroll-bottom'));
  }

  async function uploadFile(file: File) {
    uploading = true;
    uploadError = '';
    try {
      const res = await fetch('/upload', {
        method: 'POST',
        headers: { 'Content-Type': file.type, 'X-Filename': file.name },
        body: file,
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      const { url } = await res.json();
      input = (input.trim() ? input.trim() + ' ' : '') + url;
      requestAnimationFrame(() => textarea?.focus());
    } catch (err) {
      uploadError = (err as Error).message;
      setTimeout(() => { uploadError = ''; }, 4000);
    } finally {
      uploading = false;
    }
  }

  function onPaste(e: ClipboardEvent) {
    // Image / file paste
    const items = Array.from(e.clipboardData?.items ?? []);
    const fileItem = items.find(i => i.kind === 'file' && i.type.startsWith('image/'));
    if (fileItem) {
      e.preventDefault();
      const file = fileItem.getAsFile();
      if (file) uploadFile(file);
      return;
    }
    // Multi-line text paste
    const text = e.clipboardData?.getData('text') ?? '';
    const lines = text.split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.trim());
    if (lines.length > 1) {
      e.preventDefault();
      pasteLines = lines;
    }
  }

  function sendPasteLines() {
    if (!canSend) return;
    for (const line of pasteLines) {
      if (line.trim()) chat.sendInput(line.trim());
    }
    pasteLines = [];
    input = '';
    window.dispatchEvent(new CustomEvent('scroll-bottom'));
  }

  function cancelPaste() { pasteLines = []; }

  function selectCompletion(candidate: string) {
    const pos      = textarea?.selectionStart ?? input.length;
    const before   = input.slice(0, pos);
    const match    = before.match(/(\S+)$/);
    if (!match) return;
    const wordStart = before.length - match[1].length;
    const isFirst   = wordStart === 0;
    const after     = input.slice(pos);
    const isNick    = !candidate.startsWith('/') && !candidate.startsWith('#') && !candidate.startsWith('&');
    input = (isNick && isFirst)
      ? input.slice(0, wordStart) + candidate + ': ' + after
      : input.slice(0, wordStart) + candidate + ' '  + after;
    completion.reset();
    showCompletions = false;
    textarea?.focus();
  }

  function insertGif(url: string) {
    input = (input.trim() ? input.trim() + ' ' : '') + url;
    showGif = false;
    requestAnimationFrame(() => { textarea?.focus(); });
  }

  function onFileChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) uploadFile(file);
    fileInput.value = '';
  }

  let dragOver = $state(false);

  function onDragOver(e: DragEvent) {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    dragOver = true;
  }
  function onDragLeave() { dragOver = false; }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const file = e.dataTransfer?.files[0];
    if (file) uploadFile(file);
  }
</script>

<style>
  .chips-row { -ms-overflow-style: none; scrollbar-width: none; }
  .chips-row::-webkit-scrollbar { display: none; }
</style>

<!-- Root: full-width bar, shrinks to fit content, never shrinks flex parent -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="relative shrink-0 bg-gray-950 transition-colors {dragOver ? 'bg-blue-950/40 ring-2 ring-blue-500/30 ring-inset' : ''}"
  style="padding-bottom: var(--safe-bottom, env(safe-area-inset-bottom, 0)); border-top: 1px solid rgba(255,255,255,0.06); transition: padding-bottom 0.1s ease;"
  ondragover={onDragOver}
  ondragleave={onDragLeave}
  ondrop={onDrop}
>

  <!-- GIF picker (floats above input bar) -->
  {#if showGif}
    <GifPicker onselect={insertGif} onclose={() => (showGif = false)} />
  {/if}

  <!-- Image upload status -->
  {#if uploading || uploadError}
    <div class="mx-3 mb-1 flex items-center gap-2 px-3 py-2 rounded-xl
      {uploadError ? 'bg-red-900/30 border border-red-500/20' : 'bg-gray-800/70 border border-white/[0.06]'}">
      {#if uploading}
        <span class="inline-block w-3 h-3 rounded-full border-2 border-white/20 border-t-white animate-spin flex-shrink-0"></span>
        <span class="text-xs text-gray-400">Uploading…</span>
      {:else}
        <svg class="w-3 h-3 text-red-400 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 5v3.5M8 10v.5"/></svg>
        <span class="text-xs text-red-400">{uploadError}</span>
      {/if}
    </div>
  {/if}

  <!-- Reply banner -->
  {#if replyTarget}
    <div class="mx-3 mb-1 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-950/40 border border-blue-500/20 text-xs">
      <svg class="w-3 h-3 text-blue-400 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 10V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H5l-3 3V10z"/></svg>
      <span class="text-blue-300 font-medium flex-shrink-0">Replying to {replyTarget.nick}</span>
      <span class="text-blue-400/60 truncate flex-1">{replyTarget.text.length > 80 ? replyTarget.text.slice(0, 80) + '…' : replyTarget.text}</span>
      <button onclick={() => (replyTarget = null)} class="text-blue-500/50 hover:text-blue-300 flex-shrink-0 transition-colors" aria-label="Cancel reply">
        <svg class="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l10 10M13 3L3 13"/></svg>
      </button>
    </div>
  {/if}

  <!-- Multiline paste confirmation -->
  {#if pasteLines.length > 0}
    <div class="mx-2 mb-1 rounded-xl border border-white/10 bg-gray-900 shadow-xl overflow-hidden flex flex-col max-h-[50vh]">
      <div class="px-3 py-2 border-b border-white/[0.06] flex items-center justify-between">
        <span class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Send {pasteLines.length} lines?</span>
        <button onclick={cancelPaste} aria-label="Cancel paste" class="text-gray-600 hover:text-gray-300 transition-colors">
          <svg class="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M4 4l8 8M12 4l-8 8"/>
          </svg>
        </button>
      </div>
      <div class="overflow-y-auto flex-1 px-3 py-1.5 font-mono text-[11px] text-gray-400 space-y-0.5">
        {#each pasteLines.slice(0, 8) as line}
          <div class="truncate">{line}</div>
        {/each}
        {#if pasteLines.length > 8}
          <div class="text-gray-600">…and {pasteLines.length - 8} more</div>
        {/if}
      </div>
      <div class="px-3 py-2 border-t border-white/[0.06] flex gap-2">
        <button
          onclick={sendPasteLines}
          class="flex-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors"
        >Send all</button>
        <button
          onclick={cancelPaste}
          class="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors"
        >Cancel</button>
      </div>
    </div>
  {/if}

  <!-- Tab-completion: horizontal scroll chips on mobile, vertical dropdown on desktop -->
  {#if showCompletions && completion.active && completion.candidates.length > 1}
    <!-- Mobile chips row -->
    <div class="sm:hidden flex gap-1.5 overflow-x-auto px-3 py-2 border-t border-white/[0.05] chips-row">
      {#each completion.candidates as candidate, idx (candidate)}
        <button
          type="button"
          onclick={() => selectCompletion(candidate)}
          class="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors
            {idx === completion.index
              ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40'
              : 'bg-gray-800 text-gray-300 active:bg-gray-700 border border-white/[0.07]'}"
        >
          {#if candidate.startsWith('/')}
            <span class="text-blue-400/70">/</span><span>{candidate.slice(1)}</span>
          {:else if candidate.startsWith('#') || candidate.startsWith('&')}
            <span class="text-green-400/70">{candidate[0]}</span><span>{candidate.slice(1)}</span>
          {:else}
            {candidate}
          {/if}
        </button>
      {/each}
    </div>

    <!-- Desktop: vertical dropdown -->
    <div class="hidden sm:block absolute bottom-full left-0 right-0 mx-2 mb-1
                bg-gray-900 border border-white/10 rounded-xl
                shadow-2xl shadow-black/70 overflow-hidden z-20
                max-h-48 overflow-y-auto">
      {#each completion.candidates as candidate, idx (candidate)}
        <button
          type="button"
          class="w-full text-left flex items-center gap-2.5 px-3 py-2 text-sm transition-colors
            {idx === completion.index
              ? 'bg-blue-600/20 text-blue-200'
              : 'text-gray-300 hover:bg-white/5'}"
          onclick={() => selectCompletion(candidate)}
        >
          {#if candidate.startsWith('/')}
            <span class="text-[11px] font-mono text-blue-400/60 w-3 text-center">/</span>
            <span>{candidate.slice(1)}</span>
          {:else if candidate.startsWith('#')}
            <span class="text-[11px] text-green-400/60 w-3 text-center">#</span>
            <span>{candidate.slice(1)}</span>
          {:else}
            <span class="text-[11px] text-gray-600 w-3 text-center">·</span>
            <span>{candidate}</span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}

  <!-- Input row -->
  <div class="flex items-end gap-2 px-3 lg:px-4 py-2 lg:py-2.5">

    <!-- Hidden file input -->
    <input
      bind:this={fileInput}
      type="file"
      accept="image/*,video/*,audio/*,.pdf,.zip,.txt,.gz,.tar,.7z"
      class="hidden"
      onchange={onFileChange}
    />

    <!-- File/photo button -->
    <button
      type="button"
      onclick={() => fileInput.click()}
      disabled={!canSend || uploading}
      aria-label="Attach file"
      title="Attach file or photo"
      class="flex-shrink-0 flex items-center justify-center w-9 h-9 mb-0.5 rounded-xl transition-colors
        text-gray-600 hover:text-blue-400 hover:bg-blue-500/10 active:bg-blue-500/15 disabled:opacity-30 disabled:cursor-not-allowed"
    >
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
      </svg>
    </button>

    <!-- GIF button -->
    <button
      type="button"
      onclick={() => { showGif = !showGif; }}
      disabled={!canSend}
      aria-label="GIF"
      title="Send a GIF"
      class="flex-shrink-0 flex items-center justify-center w-9 h-9 mb-0.5 rounded-xl transition-colors
        {showGif
          ? 'bg-purple-600/20 text-purple-400'
          : 'text-gray-600 hover:text-gray-300 hover:bg-white/8 active:bg-white/12 disabled:opacity-30 disabled:cursor-not-allowed'}"
    >
      <span class="text-[11px] font-bold tracking-tight leading-none">GIF</span>
    </button>

    <!-- Textarea in a styled container -->
    <div class="flex flex-1 items-end
                bg-gray-800/50 rounded-2xl
                border border-white/[0.07]
                focus-within:border-blue-500/30 focus-within:bg-gray-800/70
                transition-colors min-w-0">
      <textarea
        bind:this={textarea}
        bind:value={input}
        onkeydown={onKeyDown}
        onpaste={onPaste}
        rows={1}
        disabled={!canSend}
        placeholder={isConnected ? (activeBuf ? 'Message…' : 'Select a buffer') : 'Not connected'}
        class="flex-1 min-w-0 bg-transparent resize-none outline-none
               text-gray-100 placeholder-gray-600
               disabled:opacity-40 disabled:cursor-not-allowed"
        style="
          font-size: 16px;
          line-height: 1.5;
          padding: 10px 14px;
          min-height: 44px;
          max-height: 160px;
          overflow-y: auto;
          field-sizing: content;
          -webkit-user-select: text;
          user-select: text;
        "
        autocomplete="off"
        autocapitalize="sentences"
        spellcheck="false"
      ></textarea>
    </div>

    <!-- Send button -->
    <button
      type="button"
      onclick={submit}
      disabled={!canSend || !input.trim()}
      aria-label="Send"
      class="flex-shrink-0 flex items-center justify-center
             w-10 h-10 mb-0.5 rounded-full transition-all
             {canSend && input.trim()
               ? 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white shadow-lg shadow-blue-900/40'
               : 'bg-gray-800 text-gray-600 cursor-not-allowed'}"
    >
      <svg class="w-4 h-4 translate-x-px" viewBox="0 0 16 16" fill="currentColor">
        <path d="M1.5 1.5a.5.5 0 0 1 .64-.49l12 4a.5.5 0 0 1 0 .98l-12 4a.5.5 0 0 1-.64-.49V9a.5.5 0 0 1 .38-.49L9.5 8 1.88 6.49A.5.5 0 0 1 1.5 6V1.5z"/>
      </svg>
    </button>
  </div>
</div>
