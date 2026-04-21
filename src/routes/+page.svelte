<script lang="ts">
  import { chat } from '$lib/stores/chat.svelte.js';
  import { buffers } from '$lib/stores/buffers.svelte.js';
  import { settings } from '$lib/stores/settings.svelte.js';
  import { ConnectionState } from '$lib/weechat/types.js';
  import { formatText } from '$lib/irc/formatter.js';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import MessageView from '$lib/components/MessageView.svelte';
  import InputBar from '$lib/components/InputBar.svelte';
  import UserList from '$lib/components/UserList.svelte';
  import ConnectModal from '$lib/components/ConnectModal.svelte';
  import GateScreen from '$lib/components/GateScreen.svelte';
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import SettingsModal from '$lib/components/SettingsModal.svelte';
  import BufferSwitcher from '$lib/components/BufferSwitcher.svelte';
  import OperPanel from '$lib/components/OperPanel.svelte';
  import AboutModal from '$lib/components/AboutModal.svelte';
  import HelpModal from '$lib/components/HelpModal.svelte';
  import CallNotification from '$lib/components/VideoChat/CallNotification.svelte';
  import VideoRoom from '$lib/components/VideoChat/VideoRoom.svelte';
  import { video } from '$lib/stores/video.svelte.js';

  let hasAccess   = $state(false);  // gate: invite code passed
  let showConnect = $state(false);  // user explicitly opened connect modal (e.g. during reconnect)
  // Split panes: array of extra buffer pointers beyond the primary pane
  let splitPointers   = $state<string[]>([]);
  let splitHorizontal = $state(true); // true = stacked top/bottom, false = side by side
  // Derived directly from connection state — no intermediate effect, no blank-screen gap.
  const clientVisible = $derived(
    chat.connectionState === ConnectionState.CONNECTED ||
    chat.connectionState === ConnectionState.RECONNECTING
  );
  // Show connect modal when not visibly connected, or when user explicitly requested it.
  const showConnectModal = $derived(
    hasAccess && (!clientVisible || (showConnect && chat.connectionState !== ConnectionState.CONNECTED))
  );
  let showSettings = $state(false);
  let showBufferSwitcher = $state(false);
  let showSplitPicker    = $state(false);
  let showOperPanel = $state(false);
  let showAbout = $state(false);
  let showHelp = $state(false);
  let isAway = $state(false);
  let sidebarOpen = $state(false);
  let userlistOpen = $state(false);
  let editingTopic = $state(false);
  let topicDraft = $state('');
  let topicInputEl = $state<HTMLInputElement | null>(null);

  function startTopicEdit() {
    if (!activeEntry?.buffer.title) return;
    topicDraft = activeEntry.buffer.title;
    editingTopic = true;
    // Focus after Svelte renders the input
    setTimeout(() => topicInputEl?.focus(), 0);
  }
  function commitTopicEdit() {
    if (editingTopic && bufferShortName) {
      chat.sendInput(`/topic ${bufferShortName} :${topicDraft}`);
    }
    editingTopic = false;
  }
  function cancelTopicEdit() { editingTopic = false; }
  function onTopicKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); commitTopicEdit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelTopicEdit(); }
  }

  const showOper  = $derived(chat.isOperBuffer(buffers.active ?? ''));
  const showAdmin = $derived(chat.isAdminBuffer(buffers.active ?? ''));

  // Badge on sidebar toggle — count highlights across all buffers
  const totalHighlights = $derived(
    [...buffers.buffers.values()].reduce((s, e) => s + e.highlighted, 0)
  );

  // Swipe-to-open/close sidebar
  let touchStartX = $state(0);
  let touchStartY = $state(0);

  function onTouchStart(e: TouchEvent) {
    // Don't track swipes that start on interactive elements
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'BUTTON' || tag === 'SELECT') {
      touchStartX = -1;
      return;
    }
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }

  function onTouchEnd(e: TouchEvent) {
    if (touchStartX < 0) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
    if (dy > 40) return;
    const W = typeof window !== 'undefined' ? window.innerWidth : 400;
    if (!sidebarOpen && !userlistOpen && dx > 60 && touchStartX < 32) {
      sidebarOpen = true;
    } else if (sidebarOpen && dx < -60) {
      sidebarOpen = false;
    } else if (!sidebarOpen && !userlistOpen && isChannel && dx < -60 && touchStartX > W - 40) {
      // Swipe left from right edge → open user list
      userlistOpen = true;
    } else if (userlistOpen && dx > 60) {
      // Swipe right → close user list
      userlistOpen = false;
    }
  }

  $effect(() => {
    if (typeof window !== 'undefined') {
      const desktop = window.innerWidth >= 1024;
      sidebarOpen  = desktop;
      userlistOpen = desktop; // closed by default on mobile so it doesn't block the chat
    }
  });

  // iOS/Android keyboard handling: keep --app-h and --app-top in sync with
  // the visual viewport so the layout stays anchored when the soft keyboard opens.
  $effect(() => {
    if (typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;
    let maxH = vv.height;
    function sync() {
      maxH = Math.max(maxH, vv!.height);
      const h   = vv!.height;
      const top = vv!.offsetTop;
      document.documentElement.style.setProperty('--app-h',   `${h}px`);
      document.documentElement.style.setProperty('--app-top', `${top}px`);
      // Keyboard is open when viewport height is significantly smaller than max.
      // Zero out safe-area-inset-bottom so the input bar has no dead space.
      const kbOpen = h < maxH - 100;
      if (kbOpen) {
        document.documentElement.style.setProperty('--safe-bottom', '0px');
      } else {
        document.documentElement.style.removeProperty('--safe-bottom');
      }
    }
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
    };
  });

  // Reset showConnect flag once the connection is established so it doesn't
  // linger open the modal after a successful reconnect.
  $effect(() => {
    if (chat.connectionState === ConnectionState.CONNECTED) showConnect = false;
  });

  // Favicon badge: draw unread highlights count onto the favicon
  $effect(() => {
    if (typeof document === 'undefined') return;
    const count = buffers.totalHighlights;
    const link = (document.querySelector("link[rel~='icon']") ?? (() => {
      const el = document.createElement('link');
      el.rel = 'icon';
      document.head.appendChild(el);
      return el;
    })()) as HTMLLinkElement;

    if (count === 0) {
      link.href = '/darkbear/favicon.png';
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 32; canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, 32, 32);
      const label = count > 99 ? '99+' : String(count);
      const badgeR = label.length > 2 ? 11 : 9;
      const bx = 32 - badgeR, by = badgeR;
      ctx.beginPath();
      ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
      ctx.fillStyle = '#ef4444';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${label.length > 2 ? 8 : 10}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, bx, by + 0.5);
      link.href = canvas.toDataURL();
    };
    img.src = '/darkbear/favicon.png';
  });

  // readOnFocus: mark active buffer as read when the tab regains visibility
  $effect(() => {
    if (typeof window === 'undefined') return;
    function onVisible() {
      if (settings.readOnFocus && document.visibilityState === 'visible' && buffers.active) {
        chat.setActive(buffers.active);
      }
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  });

  function handleKeydown(e: KeyboardEvent) {
    // Alt+1–9: jump to Nth buffer in sorted list
    if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key >= '1' && e.key <= '9') {
      e.preventDefault();
      const idx = parseInt(e.key) - 1;
      const sorted = buffers.sorted;
      if (idx < sorted.length) chat.setActive(sorted[idx].buffer.id);
      return;
    }
    if (e.ctrlKey && e.key === 'k') {
      e.preventDefault();
      showBufferSwitcher = !showBufferSwitcher;
      return;
    }
    if (e.ctrlKey && e.key === ',') {
      e.preventDefault();
      showSettings = true;
      return;
    }
    if (e.ctrlKey && e.key === 'o') {
      e.preventDefault();
      showOperPanel = !showOperPanel;
      return;
    }
    if (e.ctrlKey && e.key === '\\') {
      e.preventDefault();
      sidebarOpen = !sidebarOpen;
      return;
    }
    if (e.ctrlKey && e.shiftKey && e.key === 'S') {
      e.preventDefault();
      if (buffers.active) openSplit(buffers.active);
      return;
    }
    // Ctrl+W: close current buffer (part channel / close query)
    if (e.ctrlKey && e.key === 'w' && !e.shiftKey) {
      const target = document.activeElement as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) return;
      e.preventDefault();
      if (buffers.active) {
        const entry = buffers.buffers.get(buffers.active);
        const type = entry?.buffer.localVars['type'];
        if (type === 'channel') {
          chat.sendInput(buffers.active, '/part');
        } else if (type === 'private') {
          chat.sendInput(buffers.active, '/close');
        }
      }
      return;
    }
    // Alt+↑/↓: jump to next/prev buffer with highlights
    if (e.altKey && !e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const next = buffers.nextHighlighted(e.key === 'ArrowDown');
      if (next) chat.setActive(next as string);
      return;
    }
    // Alt+PgUp/PgDown: sequential prev/next buffer
    if (e.altKey && !e.ctrlKey && (e.key === 'PageUp' || e.key === 'PageDown')) {
      e.preventDefault();
      const sorted = buffers.sorted;
      if (!sorted.length) return;
      const cur = sorted.findIndex(e2 => e2.buffer.id === buffers.active);
      const step = e.key === 'PageDown' ? 1 : -1;
      const next = sorted[(cur + step + sorted.length) % sorted.length];
      if (next) chat.setActive(next.buffer.id);
      return;
    }
    // ?: help modal (only when not typing in an input)
    if (e.key === '?' && !e.ctrlKey && !e.altKey) {
      const target = document.activeElement as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) return;
      showHelp = !showHelp;
      return;
    }
    // /: focus input bar
    if (e.key === '/' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      const target = document.activeElement as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) return;
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('focus-input', { detail: '/' }));
      return;
    }
    if (e.key === 'Escape') {
      if (showHelp) { showHelp = false; return; }
      if (sidebarOpen && window.innerWidth < 1024) { sidebarOpen = false; return; }
      if (showBufferSwitcher) { showBufferSwitcher = false; return; }
      if (showSettings) { showSettings = false; return; }
      if (showConnectModal) { showConnect = false; return; }
    }
  }

  function toggleAway() {
    isAway = !isAway;
    if (buffers.active) {
      chat.sendInput(buffers.active, isAway ? '/away Away' : '/away');
    }
  }

  function markAllRead() {
    for (const [ptr, entry] of buffers.buffers) {
      if (entry.unread > 0 || entry.highlighted > 0) {
        buffers.clearUnread(ptr);
      }
    }
  }

  function closeSidebarOnMobile() {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      sidebarOpen = false;
    }
  }

  const activeEntry = $derived(
    buffers.active ? buffers.buffers.get(buffers.active) : null
  );

  // Always fetch nicklist when switching to a channel buffer,
  // regardless of whether UserList is currently open.
  $effect(() => {
    if (buffers.active && activeEntry?.buffer.localVars['type'] === 'channel') {
      chat.requestNicklist(buffers.active);
    }
  });
  const isChannel = $derived(
    activeEntry?.buffer.localVars['type'] === 'channel'
  );
  const activeNickCount = $derived(
    activeEntry
      ? [...activeEntry.nicks.values()].filter(n => !n.group).length
      : 0
  );
  const bufferShortName = $derived((() => {
    if (!activeEntry) return null;
    const b = activeEntry.buffer;
    if (b.shortName) return b.shortName;
    // WeeChat full_name is "plugin.server.#channel" — strip the prefix
    const dot = b.name.lastIndexOf('.');
    return dot >= 0 ? b.name.slice(dot + 1) : b.name;
  })());
  const channelModes = $derived(
    isChannel && activeEntry && activeEntry.modes.size > 0
      ? '+' + [...activeEntry.modes].sort().join('')
      : null
  );
  const pageTitle = $derived((() => {
    if (!bufferShortName) return 'DarkBear';
    const prefix = totalHighlights > 0 ? `(${totalHighlights}) ` : '';
    const server = activeEntry?.buffer.localVars['server'];
    const type = activeEntry?.buffer.localVars['type'];
    const qualified = server && type !== 'server' ? `${server}/${bufferShortName}` : bufferShortName;
    return prefix + qualified + ' | DarkBear';
  })());
  // ── Split panes ─────────────────────────────────────────────────────────────
  const MAX_SPLITS = typeof window !== 'undefined' && window.innerWidth < 768 ? 1 : 4;

  function openSplit(pointer: string) {
    if (splitPointers.includes(pointer)) return;
    const mobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const max = mobile ? 1 : 4;
    splitPointers = [...splitPointers.slice(-(max - 1)), pointer];
  }

  function closeSplit(pointer: string) {
    splitPointers = splitPointers.filter(p => p !== pointer);
  }

  // Listen for open-in-split events from sidebar
  $effect(() => {
    function onSplit(e: Event) {
      const ptr = (e as CustomEvent<string>).detail;
      if (ptr) openSplit(ptr);
    }
    window.addEventListener('open-split', onSplit);
    return () => window.removeEventListener('open-split', onSplit);
  });

  // Notification click: jump to highlighted buffer
  $effect(() => {
    function onJump(e: Event) {
      const ptr = (e as CustomEvent<string>).detail;
      if (ptr) chat.setActive(ptr);
    }
    window.addEventListener('jump-to-buffer', onJump);
    return () => window.removeEventListener('jump-to-buffer', onJump);
  });


  // ── Quick invite ────────────────────────────────────────────────────────────
  let inviteSending  = $state(false);
  let inviteDone     = $state(false);

  function generateInviteCode(): string {
    const adjs  = ['amber','arctic','azure','blaze','brave','calm','crisp','dark','dawn','deep',
                   'dusk','echo','ember','fern','frost','ghost','glad','gloom','glow','hazy',
                   'jade','keen','lunar','mist','moss','night','nova','pine','pure','quiet',
                   'rain','rose','sage','salt','silk','snow','soft','star','storm','swift',
                   'tide','vast','void','warm','wild','wind','wise','wolf','zeal'];
    const nouns = ['arc','ash','bay','beam','bear','bell','bloom','bolt','brook','cave',
                   'clay','cloud','coal','cove','creek','crest','crow','dale','dew','dove',
                   'dune','fall','fen','field','flare','flame','flock','flow','foam','gale',
                   'gate','glen','grove','hawk','haze','hill','horn','isle','lake','leaf',
                   'light','marsh','mead','moon','path','peak','pine','pool','reef','ridge',
                   'rift','rook','rune','sail','seed','shade','shell','shore','slope','smoke',
                   'soil','spark','spire','spring','stag','stone','stream','tide','trail',
                   'vale','veil','vine','wake','wave','well','wood','wren'];
    const adj  = adjs[Math.floor(Math.random() * adjs.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num  = String(Math.floor(Math.random() * 9000) + 1000);
    return `${adj}-${noun}-${num}`;
  }

  async function sendQuickInvite() {
    inviteSending = true;
    try {
      if (!settings.inviteToken) return;
      const code = generateInviteCode();
      const res = await fetch('/darkbear/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.inviteToken}` },
        body: JSON.stringify({ action: 'add', code }),
      });
      if (!res.ok) return;
      const url = `${window.location.origin}/darkbear/?invite=${code}`;
      await navigator.clipboard.writeText(url);
      chat.sendInput(url);
      inviteDone = true;
      setTimeout(() => { inviteDone = false; }, 2500);
    } finally {
      inviteSending = false;
    }
  }

  const hasVideoMode = $derived(
    buffers.active ? buffers.hasMode(buffers.active, 'V') : false
  );
  const inVideoRoom = $derived(
    isChannel && !!activeEntry && video.callChannel === (activeEntry.buffer.shortName || activeEntry.buffer.name)
  );
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Custom user CSS injection -->
<svelte:head>
  <title>{pageTitle}</title>
  {#if settings.customCSS}
    <style>{settings.customCSS}</style>
  {/if}
</svelte:head>

<div class="flex overflow-hidden bg-gray-950 text-gray-100 select-none transition-opacity duration-500"
  style="position: fixed; top: var(--app-top, 0); left: 0; right: 0; height: 100dvh; height: var(--app-h, 100dvh); opacity: {clientVisible ? 1 : 0}; pointer-events: {clientVisible ? 'auto' : 'none'}; transition: top 0.05s linear, opacity 500ms;">

  <!-- Mobile backdrop -->
  {#if sidebarOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
      role="presentation"
      class="fixed inset-0 bg-black/60 z-30 lg:hidden backdrop-blur-sm"
      onclick={closeSidebarOnMobile}
    ></div>
  {/if}

  <!-- Sidebar: overlay on mobile, inline on desktop -->
  <div class="
    {sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
    fixed top-0 left-0 h-full z-40 transition-transform duration-200 ease-out
    lg:relative lg:translate-x-0 lg:z-auto lg:flex-shrink-0
    {sidebarOpen ? 'lg:block' : 'lg:block'}
  ">
    <Sidebar onselect={closeSidebarOnMobile} />
  </div>

  <!-- Main area -->
  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
  <div class="flex flex-col flex-1 min-w-0 min-h-0" ontouchstart={onTouchStart} ontouchend={onTouchEnd}>

    <!-- Top bar -->
    <header class="flex items-center gap-1 lg:gap-2 px-2 lg:px-4 border-b border-gray-800/80 bg-gray-900/95 shrink-0"
      style="min-height: 48px; padding-top: env(safe-area-inset-top, 0);">
      <!-- Hamburger / sidebar toggle — hidden on desktop where sidebar is always pinned -->
      <div class="relative shrink-0 lg:hidden">
        <button
          onclick={() => (sidebarOpen = !sidebarOpen)}
          class="flex items-center justify-center w-9 h-9 -ml-1 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-white/8 active:bg-white/12 transition-colors"
          title="Toggle sidebar (Ctrl+\)"
          aria-label="Toggle sidebar"
        >
          <!-- Bear-burger: bear head silhouette with hamburger lines inside -->
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <defs>
              <clipPath id="bear-head-clip">
                <circle cx="12" cy="15.5" r="8"/>
              </clipPath>
            </defs>
            <!-- Ears -->
            <circle cx="7"  cy="6.5" r="3"   stroke-width="1.75"/>
            <circle cx="17" cy="6.5" r="3"   stroke-width="1.75"/>
            <!-- Head -->
            <circle cx="12" cy="15.5" r="8"  stroke-width="1.75"/>
            <!-- Hamburger lines, clipped to head -->
            <g clip-path="url(#bear-head-clip)" stroke-width="1.75">
              <line x1="2" y1="12.5" x2="22" y2="12.5"/>
              <line x1="2" y1="15.5" x2="22" y2="15.5"/>
              <line x1="2" y1="18.5" x2="22" y2="18.5"/>
            </g>
          </svg>
        </button>
        {#if !sidebarOpen && totalHighlights > 0}
          <span class="pointer-events-none absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white rounded-full text-[9px] font-bold flex items-center justify-center px-1 leading-none shadow-sm">
            {totalHighlights > 9 ? '9+' : totalHighlights}
          </span>
        {/if}
      </div>

      <!-- Buffer title -->
      <div class="flex flex-col flex-1 min-w-0 overflow-hidden justify-center py-1">
        {#if activeEntry}
          <div class="flex items-baseline gap-2 min-w-0 overflow-hidden">
            <span class="font-semibold text-[13px] lg:text-sm text-gray-100 truncate leading-snug min-w-0">
              {bufferShortName}
            </span>
            {#if activeNickCount > 0}
              <span class="text-[11px] text-gray-500 flex-shrink-0 tabular-nums hidden xs:inline">{activeNickCount} users</span>
            {/if}
            {#if channelModes}
              <span class="text-[11px] text-gray-700 flex-shrink-0 font-mono hidden lg:inline" title="Channel modes">{channelModes}</span>
            {/if}
          </div>
          {#if activeEntry.buffer.title}
            {#if editingTopic && isChannel}
              <!-- svelte-ignore a11y_autofocus -->
              <input
                bind:this={topicInputEl}
                bind:value={topicDraft}
                onkeydown={onTopicKeydown}
                onblur={commitTopicEdit}
                class="w-full text-[11px] leading-snug mt-px bg-transparent border-b border-blue-500/70 text-gray-200 outline-none"
                style="font-size: 11px; line-height: 1.3;"
              />
            {:else}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="text-[11px] text-gray-500 leading-snug mt-px msg-area {isChannel ? 'cursor-text hover:text-gray-400' : ''}"
                style="font-size: 11px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"
                onclick={isChannel ? startTopicEdit : undefined}
                title={activeEntry.buffer.title}
              >
                {@html formatText(activeEntry.buffer.title, false)}
              </div>
            {/if}
          {/if}
        {:else}
          <span class="text-sm font-semibold text-gray-600">DarkBear</span>
        {/if}
      </div>

      <!-- Right controls -->
      <div class="flex items-center gap-0.5 shrink-0">
        {#if chat.lag > 0}
          <span class="text-[11px] text-gray-600 tabular-nums px-2 hidden lg:inline">{chat.lag}ms</span>
        {/if}

        <!-- Split pane button — opens picker when no splits, closes all splits when active -->
        <button
          onclick={() => splitPointers.length > 0 ? (splitPointers = []) : (showSplitPicker = true)}
          title={splitPointers.length > 0 ? 'Close split pane' : 'Open split pane'}
          aria-label={splitPointers.length > 0 ? 'Close split pane' : 'Open split pane'}
          class="flex items-center justify-center w-9 h-9 rounded-lg transition-colors
            {splitPointers.length > 0
              ? 'text-blue-400 bg-blue-500/10 hover:bg-red-400/80 hover:bg-red-500/10'
              : 'text-gray-500 hover:text-gray-200 hover:bg-white/8 active:bg-white/12'}"
        >
          <!-- Mobile: horizontal split (stacked panes) -->
          <svg class="w-4 h-4 sm:hidden" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="1" y="2" width="14" height="12" rx="1.5"/>
            <line x1="1" y1="8" x2="15" y2="8"/>
          </svg>
          <!-- Desktop: vertical split (side by side) -->
          <svg class="w-4 h-4 hidden sm:block" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="1" y="2" width="14" height="12" rx="1.5"/>
            <line x1="8" y1="2" x2="8" y2="14"/>
          </svg>
        </button>

        <!-- Split layout toggle — only visible when a split is open, hidden on mobile -->
        {#if splitPointers.length > 0}
          <button
            onclick={() => (splitHorizontal = !splitHorizontal)}
            title={splitHorizontal ? 'Switch to vertical split' : 'Switch to horizontal split'}
            aria-label="Toggle split direction"
            class="hidden sm:flex items-center justify-center w-9 h-9 rounded-lg text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 transition-colors"
          >
            {#if splitHorizontal}
              <!-- Horizontal (stacked) icon -->
              <svg class="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="1" y="2" width="14" height="12" rx="1.5"/>
                <line x1="1" y1="8" x2="15" y2="8"/>
              </svg>
            {:else}
              <!-- Vertical (side by side) icon -->
              <svg class="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="1" y="2" width="14" height="12" rx="1.5"/>
                <line x1="8" y1="2" x2="8" y2="14"/>
              </svg>
            {/if}
          </button>
        {/if}

        <!-- User list toggle -->
        {#if isChannel && activeEntry}
          <button
            onclick={() => (userlistOpen = !userlistOpen)}
            class="flex items-center justify-center w-9 h-9 rounded-lg transition-colors
              {userlistOpen ? 'text-blue-400 hover:text-blue-300 hover:bg-blue-500/10' : 'text-gray-500 hover:text-gray-200 hover:bg-white/8'}"
            title="Toggle user list"
            aria-label="Toggle user list"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="9" cy="7" r="3"/>
              <path d="M3 20c0-4 2.7-6 6-6s6 2 6 6"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              <path d="M21 20c0-3-1.7-5-5-5"/>
            </svg>
          </button>
        {/if}

        <!-- Video room button (only when +V mode active) -->
        {#if isChannel && hasVideoMode}
          <button
            onclick={() => {
              if (inVideoRoom) {
                video.leaveRoom(activeEntry!.buffer.shortName || activeEntry!.buffer.name);
              } else {
                video.joinRoom(activeEntry!.buffer.shortName || activeEntry!.buffer.name);
              }
            }}
            class="flex items-center justify-center w-9 h-9 rounded-lg transition-colors
              {inVideoRoom
                ? 'text-green-400 bg-green-500/10 hover:bg-green-500/20'
                : 'text-gray-500 hover:text-green-400 hover:bg-green-500/10 active:bg-green-500/15'}"
            title={inVideoRoom ? 'Leave video room' : 'Join video room'}
            aria-label={inVideoRoom ? 'Leave video room' : 'Join video room'}
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="23 7 16 12 23 17 23 7"/>
              <rect x="1" y="5" width="15" height="14" rx="2"/>
              {#if !inVideoRoom}
                <line x1="1" y1="1" x2="23" y2="23" stroke-width="2.5"/>
              {/if}
            </svg>
          </button>
        {/if}

        <!-- Buffer switcher (Ctrl+K) -->
        <button
          onclick={() => (showBufferSwitcher = true)}
          class="flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 hover:text-indigo-400 hover:bg-indigo-500/10 active:bg-indigo-500/15 transition-colors"
          title="Quick switch (Ctrl+K)"
          aria-label="Quick switch"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
        </button>

        <!-- Oper Console — crown icon, red when admin -->
        <button
          onclick={() => (showOperPanel = !showOperPanel)}
          class="flex items-center justify-center w-9 h-9 rounded-lg transition-all
            {showAdmin
              ? showOperPanel ? 'text-red-400 bg-red-500/15 ring-1 ring-red-500/60 shadow-[0_0_10px_rgba(248,113,113,0.4)]' : 'text-red-400 ring-1 ring-red-500/50 shadow-[0_0_8px_rgba(248,113,113,0.35)] hover:bg-red-500/10'
              : showOper
                ? showOperPanel ? 'text-amber-400 bg-amber-500/10 ring-1 ring-amber-500/50' : 'text-amber-400 ring-1 ring-amber-500/40 hover:bg-amber-500/10'
                : showOperPanel ? 'text-gray-400 bg-white/8' : 'text-gray-600 hover:text-gray-400 hover:bg-white/8'}"
          title="{showAdmin ? 'Oper Console (Admin)' : showOper ? 'Oper Console' : 'Oper Console'}"
          aria-label="Oper Console"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 19h20M2 19l3-9 5 4 2-7 2 7 5-4 3 9"/>
            <circle cx="12" cy="6" r="1" fill="currentColor" stroke="none"/>
            <circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none"/>
            <circle cx="19.5" cy="12" r="1" fill="currentColor" stroke="none"/>
          </svg>
        </button>

        <!-- Quick invite — hidden on channel buffers -->
        {#if !isChannel}
        <button
          onclick={sendQuickInvite}
          disabled={inviteSending}
          title="Send invite link"
          aria-label="Send invite link"
          class="flex items-center justify-center w-9 h-9 rounded-lg transition-colors
            {inviteDone
              ? 'text-green-400 bg-green-500/10'
              : 'text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 active:bg-blue-500/15 disabled:opacity-40'}"
        >
          {#if inviteDone}
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 6 9 17l-5-5"/>
            </svg>
          {:else}
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <line x1="19" y1="8" x2="19" y2="14"/>
              <line x1="22" y1="11" x2="16" y2="11"/>
            </svg>
          {/if}
        </button>
        {/if}

        <!-- Away toggle — hide on small screens -->
        <button
          onclick={toggleAway}
          class="flex items-center justify-center w-9 h-9 rounded-lg transition-colors
            {isAway
              ? 'text-amber-400 bg-amber-500/10 hover:bg-amber-500/20'
              : 'text-gray-500 hover:text-gray-300 hover:bg-white/8 active:bg-white/12'}"
          title={isAway ? 'Set back (away)' : 'Set away'}
          aria-label={isAway ? 'Set back' : 'Set away'}
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            {#if isAway}
              <!-- Moon icon (away) -->
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            {:else}
              <!-- Circle (online) -->
              <circle cx="12" cy="12" r="9"/>
              <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>
            {/if}
          </svg>
        </button>

        <!-- Mark all read — only visible when there are highlights -->
        {#if totalHighlights > 0}
          <button
            onclick={markAllRead}
            class="flex items-center justify-center w-9 h-9 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 active:bg-red-500/15 transition-colors"
            title="Mark all as read"
            aria-label="Mark all as read"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <path d="M22 4 12 14.01l-3-3"/>
            </svg>
          </button>
        {/if}

        <!-- About — hidden on small screens -->
        <button
          onclick={() => (showAbout = true)}
          class="hidden sm:flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 hover:text-sky-400 hover:bg-sky-500/10 active:bg-sky-500/15 transition-colors"
          title="About DarkBear (? for keyboard shortcuts)"
          aria-label="About"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
        </button>

        <!-- Settings -->
        <button
          onclick={() => (showSettings = true)}
          class="flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 hover:text-violet-400 hover:bg-violet-500/10 active:bg-violet-500/15 transition-colors"
          title="Settings (Ctrl+,)"
          aria-label="Settings"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>

        <!-- Connect / Disconnect -->
        {#if chat.connectionState === ConnectionState.CONNECTED}
          <button
            onclick={() => { chat.disconnect(); }}
            class="text-xs px-2.5 py-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 active:bg-red-500/20 transition-colors ml-1"
            title="Disconnect"
            aria-label="Disconnect"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        {:else if chat.connectionState === ConnectionState.DISCONNECTED || chat.connectionState === ConnectionState.RECONNECTING || chat.connectionState === ConnectionState.ERROR}
          <button
            onclick={() => { showConnect = true; }}
            class="text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white transition-colors font-medium ml-1"
          >
            Connect
          </button>
        {/if}
      </div>
    </header>

    <!-- Content area: primary pane + split panes side by side -->
    <div class="flex flex-1 min-h-0 relative overflow-hidden {splitHorizontal ? 'flex-col' : 'flex-row'}">

      <!-- Primary pane -->
      <div class="flex flex-col flex-1 min-w-0 min-h-0">
        <div class="flex flex-1 min-h-0 relative">
          <MessageView />

          {#if isChannel && activeEntry && userlistOpen}
            <!-- Mobile: animated slide-in overlay from right -->
            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
            <div
              transition:fade={{ duration: 180 }}
              class="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
              onclick={() => (userlistOpen = false)}
            ></div>
            <div
              transition:fly={{ x: 280, duration: 220, easing: cubicOut }}
              class="fixed top-0 right-0 h-full z-40 lg:hidden shadow-2xl shadow-black/60"
              style="padding-top: calc(48px + env(safe-area-inset-top, 0));"
            >
              <UserList />
            </div>
            <!-- Desktop: inline -->
            <div class="hidden lg:flex flex-col shrink-0">
              <UserList />
            </div>
          {/if}
        </div>
        <InputBar />
      </div>

      <!-- Split panes -->
      {#each splitPointers as ptr (ptr)}
        {@const splitEntry = buffers.buffers.get(ptr)}
        <div
          class="flex flex-col min-w-0 min-h-0 {splitHorizontal ? 'border-t' : 'border-l'} border-gray-800/80"
          style="flex: 1; {splitHorizontal ? 'max-height: 50%' : 'max-width: 50%'};"
          transition:fly={{ y: splitHorizontal ? 300 : 0, x: splitHorizontal ? 0 : 300, duration: 200, easing: cubicOut }}
        >
          <!-- Split pane header -->
          <div class="flex items-center gap-2 px-3 py-1.5 bg-gray-900/80 border-b border-gray-800/60 shrink-0 min-h-[36px]">
            <span class="flex-1 text-sm font-medium text-gray-300 truncate">
              {splitEntry?.buffer.shortName || splitEntry?.buffer.name || '…'}
            </span>
            <!-- Switch buffer in this pane -->
            <button
              onclick={() => {
                const idx = splitPointers.indexOf(ptr);
                // Cycle through sorted buffers
                const sorted = buffers.sorted;
                const cur = sorted.findIndex(e => e.buffer.id === ptr);
                const next = sorted[(cur + 1) % sorted.length];
                if (next) splitPointers = splitPointers.map(p => p === ptr ? next.buffer.id : p);
              }}
              class="text-gray-600 hover:text-gray-300 transition-colors p-1 rounded"
              title="Next buffer"
            >
              <svg class="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 8h10M9 4l4 4-4 4"/></svg>
            </button>
            <button
              onclick={() => closeSplit(ptr)}
              class="text-gray-600 hover:text-gray-300 transition-colors p-1 rounded"
              title="Close split"
            >
              <svg class="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>
            </button>
          </div>
          <div class="flex-1 min-h-0">
            <MessageView bufferPointer={ptr} />
          </div>
          <InputBar bufferPointer={ptr} />
        </div>
      {/each}

    </div>
  </div>
</div>

{#if !hasAccess}
  <GateScreen onaccess={() => (hasAccess = true)} />
{:else if showConnectModal}
  <div transition:fade={{ duration: 400 }}>
    <ConnectModal onclose={() => (showConnect = false)} />
  </div>
{/if}

{#if showSettings}
  <SettingsModal onclose={() => (showSettings = false)} />
{/if}

{#if showBufferSwitcher}
  <BufferSwitcher onclose={() => (showBufferSwitcher = false)} />
{/if}

{#if showSplitPicker}
  <BufferSwitcher
    onclose={() => (showSplitPicker = false)}
    onpick={(ptr) => { openSplit(ptr); showSplitPicker = false; }}
  />
{/if}

{#if showOperPanel}
  <OperPanel onclose={() => (showOperPanel = false)} />
{/if}

{#if showAbout}
  <AboutModal onclose={() => (showAbout = false)} />
{/if}

{#if showHelp}
  <HelpModal onclose={() => (showHelp = false)} />
{/if}

{#if video.callState === 'ringing_in'}
  <CallNotification />
{/if}

{#if video.callState === 'in_call' || video.callState === 'ringing_out'}
  <VideoRoom />
{/if}

{#if video.error}
  <div class="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-red-900/90 border border-red-700 text-red-200 text-xs px-4 py-2 rounded-lg shadow-xl">
    {video.error}
  </div>
{/if}
