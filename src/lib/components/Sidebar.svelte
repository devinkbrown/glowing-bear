<script lang="ts">
  import { chat } from '$lib/stores/chat.svelte.js';
  import { buffers } from '$lib/stores/buffers.svelte.js';
  import { settings } from '$lib/stores/settings.svelte.js';
  import { ConnectionState } from '$lib/weechat/types.js';
  import type { BufferEntry } from '$lib/stores/buffers.svelte.js';

  interface Props {
    open?: boolean;
    onselect?: () => void;
  }

  const { onselect }: Props = $props();

  type ContextMenu = { x: number; y: number; entry: BufferEntry } | null;

  let contextMenu = $state<ContextMenu>(null);
  let joinInput = $state('');
  let showJoinBar = $state<string | null>(null); // serverName or null
  let joinInputEl = $state<HTMLInputElement | null>(null);
  let collapsed = $state<Set<string>>(new Set());
  let filterQuery = $state('');
  let filterInputEl = $state<HTMLInputElement | null>(null);

  const connectionDot = $derived((() => {
    switch (chat.connectionState) {
      case ConnectionState.CONNECTED: return 'bg-emerald-400';
      case ConnectionState.CONNECTING:
      case ConnectionState.AUTHENTICATING: return 'bg-amber-400 animate-pulse';
      case ConnectionState.RECONNECTING: return 'bg-orange-400 animate-pulse';
      default: return 'bg-red-500';
    }
  })());

  const connectionLabel = $derived((() => {
    switch (chat.connectionState) {
      case ConnectionState.CONNECTED: return settings.relay.host;
      case ConnectionState.CONNECTING: return 'Connecting…';
      case ConnectionState.AUTHENTICATING: return 'Authenticating…';
      case ConnectionState.RECONNECTING: return 'Reconnecting…';
      default: return 'Disconnected';
    }
  })());

  function selectBuffer(pointer: string) {
    chat.setActive(pointer);
    const entry = buffers.buffers.get(pointer);
    if (entry && entry.lines.length === 0 && !entry.loading) {
      chat.requestHistory();
    }
    if (entry?.buffer.localVars['type'] === 'channel') {
      chat.requestNicklist(pointer);
    }
    contextMenu = null;
    onselect?.();
  }

  const MENU_W = 176, MENU_H = 176; // estimated context menu size

  function clampMenu(x: number, y: number): { x: number; y: number } {
    const W = typeof window !== 'undefined' ? window.innerWidth  : 400;
    const H = typeof window !== 'undefined' ? window.innerHeight : 800;
    return {
      x: Math.max(4, Math.min(x, W - MENU_W - 4)),
      y: Math.max(4, Math.min(y, H - MENU_H - 4)),
    };
  }

  function onContextMenu(e: MouseEvent, entry: BufferEntry) {
    e.preventDefault();
    const { x, y } = clampMenu(e.clientX, e.clientY);
    contextMenu = { x, y, entry };
  }

  function closeContext() { contextMenu = null; }

  function ctxClose(entry: BufferEntry) {
    chat.sendTo(entry.buffer.id, '/buffer close');
    buffers.removeBuffer(entry.buffer.id);
    closeContext();
  }

  function ctxClear(entry: BufferEntry) {
    const e2 = buffers.buffers.get(entry.buffer.id);
    if (e2) e2.lines = [];
    buffers.buffers = new Map(buffers.buffers);
    closeContext();
  }

  function submitJoin(serverName: string) {
    const ch = joinInput.trim();
    if (!ch) { showJoinBar = null; return; }
    const channel = ch.startsWith('#') || ch.startsWith('&') ? ch : `#${ch}`;
    chat.sendInput(`/join ${channel}`);
    joinInput = '';
    showJoinBar = null;
  }

  function onJoinKey(e: KeyboardEvent, serverName: string) {
    if (e.key === 'Enter') submitJoin(serverName);
    if (e.key === 'Escape') { showJoinBar = null; joinInput = ''; }
  }

  function toggleCollapse(key: string) {
    const next = new Set(collapsed);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    collapsed = next;
  }

  function openJoinBar(serverName: string) {
    showJoinBar = serverName;
    joinInput = '';
  }

  const nextUnreadPtr = $derived(buffers.nextHighlighted(true));

  // ── Sidebar drag-to-resize ───────────────────────────────────────────────────
  let dragging = $state(false);

  function onResizeStart(e: MouseEvent | TouchEvent) {
    e.preventDefault();
    dragging = true;
    const startX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const startW = settings.sidebarWidth;

    function onMove(ev: MouseEvent | TouchEvent) {
      const x = 'touches' in ev ? ev.touches[0].clientX : ev.clientX;
      const next = Math.max(160, Math.min(400, startW + x - startX));
      settings.sidebarWidth = next;
    }
    function onUp() {
      dragging = false;
      settings.scheduleSave();
      window.removeEventListener('mousemove', onMove as EventListener);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove as EventListener);
      window.removeEventListener('touchend', onUp);
    }
    window.addEventListener('mousemove', onMove as EventListener);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove as EventListener, { passive: false });
    window.addEventListener('touchend', onUp);
  }

  interface ServerGroup {
    serverName: string;
    serverEntry: BufferEntry | null;
    channels: BufferEntry[];
    queries: BufferEntry[];
    totalHighlights: number;
    totalUnread: number;
  }

  const grouped = $derived((() => {
    const sorted = buffers.sorted;
    const core: BufferEntry[] = [];
    const serverMap = new Map<string, ServerGroup>();
    const activeId = buffers.active;
    const fq = filterQuery.trim().toLowerCase();

    for (const entry of sorted) {
      const type = entry.buffer.localVars['type'] ?? '';
      const srvName = entry.buffer.localVars['server'] ?? '';
      // onlyUnread: hide buffers with no unread unless they're the active buffer
      if (settings.onlyUnread && entry.unread === 0 && entry.highlighted === 0 && entry.buffer.id !== activeId) {
        continue;
      }
      // buffer name filter
      if (fq) {
        const name = (entry.buffer.shortName || entry.buffer.name).toLowerCase();
        if (!name.includes(fq) && entry.buffer.id !== activeId) continue;
      }

      if (!srvName && type !== 'channel' && type !== 'private') {
        core.push(entry);
        continue;
      }

      const key = srvName || entry.buffer.name;
      if (!serverMap.has(key)) {
        serverMap.set(key, {
          serverName: key, serverEntry: null,
          channels: [], queries: [],
          totalHighlights: 0, totalUnread: 0,
        });
      }
      const grp = serverMap.get(key)!;

      if (type === 'channel') {
        grp.channels.push(entry);
      } else if (type === 'private') {
        grp.queries.push(entry);
      } else {
        grp.serverEntry = entry;
      }
      grp.totalHighlights += entry.highlighted;
      grp.totalUnread += entry.unread;
    }

    return { core, servers: Array.from(serverMap.values()) };
  })());

  function isActive(id: string) { return buffers.active === id; }

  // Svelte action: fire a 'lp' custom event after 500ms touch hold, cancel on move/end
  function longpress(node: HTMLElement) {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let sx = 0, sy = 0;
    function start(e: TouchEvent) {
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      timer = setTimeout(() => {
        const W = typeof window !== 'undefined' ? window.innerWidth  : 400;
        const H = typeof window !== 'undefined' ? window.innerHeight : 800;
        const cx = Math.max(4, Math.min(sx, W - MENU_W - 4));
        const cy = Math.max(4, Math.min(sy, H - MENU_H - 4));
        node.dispatchEvent(new CustomEvent('lp', { detail: { x: cx, y: cy }, bubbles: false }));
        timer = null;
      }, 500);
    }
    // touchend always cancels — lifting finger is never a long-press
    function onEnd() {
      if (timer) { clearTimeout(timer); timer = null; }
    }
    // touchmove cancels only when finger drifts (scrolling)
    function onMove(e: TouchEvent) {
      if (!timer) return;
      const dx = Math.abs(e.touches[0].clientX - sx);
      const dy = Math.abs(e.touches[0].clientY - sy);
      if (dx > 10 || dy > 10) { clearTimeout(timer); timer = null; }
    }
    node.addEventListener('touchstart', start, { passive: true });
    node.addEventListener('touchend', onEnd);
    node.addEventListener('touchcancel', onEnd);
    node.addEventListener('touchmove', onMove, { passive: true });
    return { destroy() {
      node.removeEventListener('touchstart', start);
      node.removeEventListener('touchend', onEnd);
      node.removeEventListener('touchcancel', onEnd);
      node.removeEventListener('touchmove', onMove);
    }};
  }

</script>

<!-- svelte-ignore a11y_no_static_element_interactions a11y_no_noninteractive_element_interactions -->
<aside
  aria-label="Sidebar"
  class="flex flex-col h-full bg-gray-950 border-r border-white/5 select-none overflow-hidden relative"
  style="width: min({settings.sidebarWidth}px, 80vw); flex-shrink: 0;"
  onclick={closeContext}
  onkeydown={(e) => e.key === 'Escape' && closeContext()}
>
  <!-- Connection header -->
  <div class="flex items-center gap-2.5 px-3 py-3.5 border-b border-white/5 shrink-0">
    <span class="w-2 h-2 rounded-full flex-shrink-0 block {connectionDot}"></span>
    <span class="text-xs font-semibold text-gray-300 truncate flex-1 leading-none">{connectionLabel}</span>
    {#if chat.lag > 0}
      <span class="text-[10px] text-gray-600 tabular-nums flex-shrink-0">{chat.lag}ms</span>
    {/if}
    <!-- Close button — mobile only -->
    <button
      class="lg:hidden flex items-center justify-center w-7 h-7 -mr-0.5 rounded-lg text-gray-600 hover:text-gray-300 active:text-gray-100 transition-colors flex-shrink-0"
      onclick={onselect}
      aria-label="Close channels"
    >
      <svg class="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M10 3L5 8l5 5"/>
      </svg>
    </button>
  </div>

  <!-- Buffer filter -->
  <div class="px-2 pb-1.5 shrink-0">
    <div class="relative">
      <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-600 pointer-events-none" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="6.5" cy="6.5" r="4.5"/><path d="m10 10 3 3"/></svg>
      <input
        bind:this={filterInputEl}
        bind:value={filterQuery}
        type="text"
        placeholder="Filter…"
        autocomplete="off"
        spellcheck="false"
        onkeydown={(e) => { if (e.key === 'Escape') { filterQuery = ''; (e.currentTarget as HTMLInputElement).blur(); } }}
        class="w-full bg-white/5 border border-white/6 rounded-lg text-xs text-gray-300 placeholder-gray-700 pl-7 pr-2 py-1.5 outline-none focus:border-blue-500/40 focus:bg-white/8 transition-colors"
      />
      {#if filterQuery}
        <button onclick={() => (filterQuery = '')} aria-label="Clear filter" class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400">
          <svg class="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l10 10M13 3L3 13"/></svg>
        </button>
      {/if}
    </div>
  </div>

  <!-- Buffer list -->
  <div class="flex-1 overflow-y-auto py-1 px-2">

    <!-- Core / WeeChat buffers (weechat, scripts, etc) -->
    {#each grouped.core as entry (entry.buffer.id)}
      {@const active = isActive(entry.buffer.id)}
      <button
        class="w-full text-left rounded-lg px-2.5 py-2.5 text-xs flex items-center gap-2 transition-colors
          {active
            ? 'bg-blue-500/20 text-blue-200'
            : 'text-gray-500 hover:text-gray-300 hover:bg-white/5 active:bg-white/8'}"
        onclick={() => selectBuffer(entry.buffer.id)}
        oncontextmenu={(e) => onContextMenu(e, entry)}
        use:longpress
        onlp={(e: CustomEvent<{x:number,y:number}>) => contextMenu = { x: e.detail.x, y: e.detail.y, entry }}
        title={entry.buffer.fullName}
      >
        <span class="flex-shrink-0 text-[13px] leading-none font-semibold opacity-40">·</span>
        <span class="truncate flex-1">{entry.buffer.shortName || entry.buffer.name}</span>
        {#if entry.highlighted > 0}
          <span class="flex-shrink-0 min-w-[18px] h-[18px] bg-red-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center px-1 leading-none">
            {entry.highlighted > 99 ? '99+' : entry.highlighted}
          </span>
        {:else if entry.unread > 0}
          <span class="flex-shrink-0 min-w-[18px] h-[18px] bg-blue-500/30 text-blue-300 rounded-full text-[10px] font-bold flex items-center justify-center px-1 leading-none">
            {entry.unread > 99 ? '99+' : entry.unread}
          </span>
        {/if}
      </button>
    {/each}

    <!-- Server groups -->
    {#each grouped.servers as grp (grp.serverName)}
      {@const isCollapsed = collapsed.has(grp.serverName)}
      {@const serverActive = grp.serverEntry ? isActive(grp.serverEntry.buffer.id) : false}
      {@const totalHighlights = grp.totalHighlights}
      {@const totalUnread = grp.totalUnread}

      <div class="mt-2">
        <!-- Server header -->
        <div class="flex items-center gap-0.5 mb-0.5">
          <!-- Collapse chevron -->
          <button
            class="flex-shrink-0 w-6 h-8 flex items-center justify-center rounded text-gray-600 hover:text-gray-400 active:text-gray-300 transition-colors"
            onclick={() => toggleCollapse(grp.serverName)}
            aria-label={isCollapsed ? 'Expand' : 'Collapse'}
          >
            <svg
              class="w-3 h-3 transition-transform duration-150 {isCollapsed ? '-rotate-90' : ''}"
              viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            >
              <path d="M4 6l4 4 4-4"/>
            </svg>
          </button>

          <!-- Server name / console button -->
          {#if grp.serverEntry}
            <!-- Server name IS the console — tap to open it -->
            <button
              class="flex items-center gap-2 flex-1 min-w-0 px-1.5 py-1.5 rounded-lg transition-colors
                {serverActive
                  ? 'bg-blue-500/20 text-blue-300'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5 active:bg-white/8'}"
              onclick={() => selectBuffer(grp.serverEntry!.buffer.id)}
              oncontextmenu={(e) => onContextMenu(e, grp.serverEntry!)}
              use:longpress
              onlp={(e: CustomEvent<{x:number,y:number}>) => { const en = grp.serverEntry!; contextMenu = { x: e.detail.x, y: e.detail.y, entry: en }; }}
              title={`${grp.serverName} — server console`}
            >
              <span class="text-[11px] font-bold uppercase tracking-wide truncate flex-1">
                {grp.serverName}
              </span>
              {#if grp.serverEntry.highlighted > 0}
                <span class="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-red-400"></span>
              {:else if grp.serverEntry.unread > 0}
                <span class="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-blue-400"></span>
              {/if}
            </button>
          {:else}
            <!-- No server buffer — just a label -->
            <div class="flex items-center flex-1 min-w-0 px-1.5 py-1.5">
              <span class="text-[11px] font-bold uppercase tracking-wide truncate text-gray-500">
                {grp.serverName}
              </span>
            </div>
          {/if}

          <!-- Collapsed unread badge -->
          {#if isCollapsed && totalHighlights > 0}
            <span class="flex-shrink-0 min-w-[18px] h-[18px] bg-red-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center px-1 leading-none mr-1">
              {totalHighlights > 99 ? '99+' : totalHighlights}
            </span>
          {:else if isCollapsed && totalUnread > 0}
            <span class="flex-shrink-0 min-w-[18px] h-[18px] bg-blue-500/30 text-blue-300 rounded-full text-[10px] font-bold flex items-center justify-center px-1 leading-none mr-1">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          {/if}

          <!-- Join button — always visible when expanded -->
          {#if !isCollapsed}
            <button
              class="flex-shrink-0 w-7 h-8 flex items-center justify-center rounded text-gray-600 hover:text-gray-300 hover:bg-white/5 active:bg-white/8 transition-colors"
              onclick={(e) => { e.stopPropagation(); openJoinBar(grp.serverName); }}
              title="Join channel"
            >
              <svg class="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <path d="M8 2v12M2 8h12"/>
              </svg>
            </button>
          {/if}
        </div>

        {#if !isCollapsed}
          <!-- Join input -->
          {#if showJoinBar === grp.serverName}
            <div class="px-2 pb-2">
              <!-- svelte-ignore a11y_autofocus -->
              <input
                autofocus
                bind:this={joinInputEl}
                class="w-full bg-gray-800/80 border border-gray-700 rounded-lg text-xs text-gray-200 px-3 py-2
                  outline-none focus:border-blue-500/70 placeholder-gray-600 transition-colors"
                bind:value={joinInput}
                onkeydown={(e) => onJoinKey(e, grp.serverName)}
                placeholder="#channel — Enter to join"
                autocomplete="off"
                spellcheck="false"
              />
            </div>
          {/if}

          <!-- Channels -->
          {#each grp.channels as entry (entry.buffer.id)}
            {@const active = isActive(entry.buffer.id)}
            {@const chanName = entry.buffer.shortName || entry.buffer.localVars['channel'] || entry.buffer.name}
            {@const sigil = chanName.match(/^([#&!+]+)/)?.[1] ?? '#'}
            {@const chanLabel = chanName.slice(sigil.length) || chanName}
            {@const pinned = buffers.isPinned(entry.buffer.id)}
            {@const muted = buffers.isMuted(entry.buffer.id)}
            <button
              class="w-full text-left rounded-lg pl-[26px] pr-2.5 py-2.5 flex items-center gap-1.5 transition-colors
                {active
                  ? 'bg-blue-500/20 text-blue-200'
                  : entry.highlighted > 0
                    ? 'text-white hover:bg-white/5 active:bg-white/8'
                    : entry.unread > 0
                      ? 'text-gray-200 hover:bg-white/5 active:bg-white/8'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-white/5 active:bg-white/8'}"
              onclick={() => selectBuffer(entry.buffer.id)}
              oncontextmenu={(e) => onContextMenu(e, entry)}
              use:longpress
              onlp={(e: CustomEvent<{x:number,y:number}>) => contextMenu = { x: e.detail.x, y: e.detail.y, entry }}
              title={entry.buffer.fullName}
            >
              <span class="flex-shrink-0 text-[13px] leading-none font-semibold {active ? 'text-blue-400/80' : 'text-gray-700'}">{sigil}</span>
              <span class="truncate flex-1 text-[13px] leading-tight">{chanLabel}</span>
              {#if pinned}
                <svg class="flex-shrink-0 w-2.5 h-2.5 text-blue-500/60" viewBox="0 0 16 16" fill="currentColor"><path d="M9.5 1.5a1 1 0 0 0-1.414 0L5.5 4.086A2 2 0 0 0 5 5.5V7H3.5a1 1 0 0 0-.707 1.707L5 10.914V14a1 1 0 0 0 1.707.707l1-1A1 1 0 0 0 8 13v-2.086l2.207-2.207A1 1 0 0 0 11 8H9.5V5.914a2 2 0 0 0-.586-1.414L9.5 1.5z"/></svg>
              {/if}
              {#if muted}
                <svg class="flex-shrink-0 w-2.5 h-2.5 text-gray-600" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 2a3 3 0 0 1 3 3v3a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zM3 3l10 10"/></svg>
              {/if}
              {#if entry.highlighted > 0}
                <span class="flex-shrink-0 min-w-[18px] h-[18px] bg-red-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center px-1 leading-none">
                  {entry.highlighted > 99 ? '99+' : entry.highlighted}
                </span>
              {:else if entry.unread > 0}
                <span class="flex-shrink-0 min-w-[18px] h-[18px] bg-gray-700/80 text-gray-300 rounded-full text-[10px] flex items-center justify-center px-1 leading-none">
                  {entry.unread > 99 ? '99+' : entry.unread}
                </span>
              {/if}
            </button>
          {/each}

          <!-- Direct messages -->
          {#if grp.queries.length > 0}
            <div class="pl-[26px] pt-3 pb-1">
              <span class="text-[10px] font-semibold uppercase tracking-widest text-gray-700">Messages</span>
            </div>
            {#each grp.queries as entry (entry.buffer.id)}
              {@const active = isActive(entry.buffer.id)}
              {@const qpinned = buffers.isPinned(entry.buffer.id)}
              <button
                class="w-full text-left rounded-lg pl-[26px] pr-2.5 py-2.5 flex items-center gap-1.5 transition-colors
                  {active
                    ? 'bg-blue-500/20 text-blue-200'
                    : entry.highlighted > 0
                      ? 'text-white hover:bg-white/5 active:bg-white/8'
                      : entry.unread > 0
                        ? 'text-gray-200 hover:bg-white/5 active:bg-white/8'
                        : 'text-gray-500 hover:text-gray-300 hover:bg-white/5 active:bg-white/8'}"
                onclick={() => selectBuffer(entry.buffer.id)}
                oncontextmenu={(e) => onContextMenu(e, entry)}
                use:longpress
                onlp={(e: CustomEvent<{x:number,y:number}>) => contextMenu = { x: e.detail.x, y: e.detail.y, entry }}
                title={entry.buffer.fullName}
              >
                <span class="flex-shrink-0 text-[13px] leading-none font-semibold {active ? 'text-blue-400/80' : 'text-gray-700'}">@</span>
                <span class="truncate flex-1 text-[13px]">{entry.buffer.shortName || entry.buffer.name}</span>
                {#if qpinned}
                  <svg class="flex-shrink-0 w-2.5 h-2.5 text-blue-500/60" viewBox="0 0 16 16" fill="currentColor"><path d="M9.5 1.5a1 1 0 0 0-1.414 0L5.5 4.086A2 2 0 0 0 5 5.5V7H3.5a1 1 0 0 0-.707 1.707L5 10.914V14a1 1 0 0 0 1.707.707l1-1A1 1 0 0 0 8 13v-2.086l2.207-2.207A1 1 0 0 0 11 8H9.5V5.914a2 2 0 0 0-.586-1.414L9.5 1.5z"/></svg>
                {/if}
                {#if entry.highlighted > 0}
                  <span class="flex-shrink-0 min-w-[18px] h-[18px] bg-red-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center px-1 leading-none">
                    {entry.highlighted > 99 ? '99+' : entry.highlighted}
                  </span>
                {:else if entry.unread > 0}
                  <span class="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-blue-400 mr-0.5"></span>
                {/if}
              </button>
            {/each}
          {/if}

          <!-- Empty state: join prompt -->
          {#if grp.channels.length === 0 && grp.queries.length === 0}
            <button
              class="w-full pl-[26px] pr-2.5 py-2 flex items-center gap-2 text-xs text-gray-600 hover:text-gray-400
                rounded-lg hover:bg-white/5 active:bg-white/8 transition-colors border border-dashed border-white/8 hover:border-white/15 mt-0.5"
              onclick={(e) => { e.stopPropagation(); openJoinBar(grp.serverName); }}
            >
              <svg class="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M8 2v12M2 8h12"/>
              </svg>
              Join a channel
            </button>
          {/if}
        {/if}
      </div>
    {/each}

    <!-- Bottom spacer for safe area -->
    <div class="h-2"></div>
  </div>

  <!-- Unread jump footer -->
  {#if nextUnreadPtr}
    <div class="shrink-0 px-2 py-1.5 border-t border-white/5">
      <button
        onclick={() => { chat.setActive(nextUnreadPtr!); onselect?.(); }}
        class="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg bg-red-500/8 hover:bg-red-500/15 border border-red-500/15 text-red-400 text-xs font-medium transition-colors"
      >
        <svg class="w-3 h-3 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 2v8M4 7l4 4 4-4"/>
          <line x1="2" y1="14" x2="14" y2="14"/>
        </svg>
        <span class="truncate flex-1 text-left">
          Jump to {buffers.buffers.get(nextUnreadPtr!)?.buffer.shortName ?? 'unread'}
        </span>
        <span class="flex-shrink-0 min-w-[18px] h-[18px] bg-red-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center px-1 leading-none">
          {buffers.totalHighlights > 9 ? '9+' : buffers.totalHighlights}
        </span>
      </button>
    </div>
  {/if}

  <!-- Drag resize handle — desktop only -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="absolute top-0 right-0 w-2 h-full cursor-col-resize hidden lg:block z-10 group/resize"
    onmousedown={onResizeStart}
    ontouchstart={onResizeStart}
  >
    <div class="absolute inset-y-0 right-0 w-px bg-white/5 group-hover/resize:bg-blue-500/40 transition-colors {dragging ? '!bg-blue-500/60' : ''}"></div>
  </div>
</aside>

<!-- Context menu -->
{#if contextMenu}
  <div
    role="menu"
    tabindex="-1"
    class="fixed z-50 bg-gray-900 border border-white/10 rounded-xl shadow-2xl shadow-black/60 py-1.5 overflow-hidden"
    style="left: {contextMenu.x}px; top: {contextMenu.y}px; min-width: 168px;"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
  >
    <button
      class="w-full text-left px-3.5 py-2.5 text-gray-300 hover:bg-white/8 hover:text-white transition-colors flex items-center gap-3 text-sm"
      onclick={() => {
        window.dispatchEvent(new CustomEvent('open-split', { detail: contextMenu!.entry.buffer.id }));
        contextMenu = null;
      }}
    >
      <svg class="w-3.5 h-3.5 text-gray-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="1" y="2" width="14" height="12" rx="1.5"/>
        <line x1="8" y1="2" x2="8" y2="14"/>
      </svg>
      Open in split
    </button>
    <button
      class="w-full text-left px-3.5 py-2.5 text-gray-300 hover:bg-white/8 hover:text-white transition-colors flex items-center gap-3 text-sm"
      onclick={() => { buffers.togglePin(contextMenu!.entry.buffer.id); contextMenu = null; }}
    >
      <svg class="w-3.5 h-3.5 text-gray-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 1L15 7M6 4l4 4M3 13l3-3M9.5 6.5l-4 4"/>
        <path d="M10 2l2 2-4.5 4.5-2-2z"/>
      </svg>
      {buffers.isPinned(contextMenu.entry.buffer.id) ? 'Unpin buffer' : 'Pin buffer'}
    </button>
    <button
      class="w-full text-left px-3.5 py-2.5 transition-colors flex items-center gap-3 text-sm
        {buffers.isMuted(contextMenu.entry.buffer.id) ? 'text-amber-400 hover:bg-amber-500/10' : 'text-gray-300 hover:bg-white/8 hover:text-white'}"
      onclick={() => { buffers.toggleMute(contextMenu!.entry.buffer.id); contextMenu = null; }}
    >
      <svg class="w-3.5 h-3.5 text-gray-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        {#if buffers.isMuted(contextMenu.entry.buffer.id)}
          <path d="M8 2a3 3 0 0 1 3 3v3a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
          <path d="M5 8a3 3 0 0 0 6 0"/>
          <line x1="3" y1="3" x2="13" y2="13"/>
        {:else}
          <path d="M8 2a3 3 0 0 1 3 3v3a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
          <path d="M5 8a3 3 0 0 0 6 0M8 11v3"/>
        {/if}
      </svg>
      {buffers.isMuted(contextMenu.entry.buffer.id) ? 'Unmute buffer' : 'Mute notifications'}
    </button>
    <button
      class="w-full text-left px-3.5 py-2.5 text-gray-300 hover:bg-white/8 hover:text-white transition-colors flex items-center gap-3 text-sm"
      onclick={() => ctxClear(contextMenu!.entry)}
    >
      <svg class="w-3.5 h-3.5 text-gray-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <path d="M3 4h10M6 4V2.5h4V4M5 4l.5 9.5h5L11 4"/>
      </svg>
      Clear messages
    </button>
    <div class="border-t border-white/8 mx-2 my-1"></div>
    <button
      class="w-full text-left px-3.5 py-2.5 text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors flex items-center gap-3 text-sm"
      onclick={() => ctxClose(contextMenu!.entry)}
    >
      <svg class="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <path d="M3 3l10 10M13 3L3 13"/>
      </svg>
      Close buffer
    </button>
  </div>
{/if}
