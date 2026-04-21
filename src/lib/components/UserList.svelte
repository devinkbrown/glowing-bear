<script lang="ts">
  import { buffers } from '$lib/stores/buffers.svelte.js';
  import { chat } from '$lib/stores/chat.svelte.js';
  import { nickColor } from '$lib/utils/nickcolor.js';
  import { settings } from '$lib/stores/settings.svelte.js';
  import type { WeeChatNick } from '$lib/weechat/types.js';
  import { video } from '$lib/stores/video.svelte.js';

  const entry = $derived(buffers.active ? buffers.buffers.get(buffers.active) : null);

  // Fetch nicklist whenever we switch to a new buffer
  let lastFetched = $state<string | null>(null);
  $effect(() => {
    const ptr = buffers.active;
    if (ptr && ptr !== lastFetched) {
      lastFetched = ptr;
      chat.requestNicklist(ptr);
    }
  });

  let filter = $state('');
  let collapsedGroups = $state<Set<string>>(new Set());
  let popover = $state<{ nick: WeeChatNick; x: number; y: number } | null>(null);

  const nickGroups = $derived(entry?.nickGroups ?? new Map<string, WeeChatNick[]>());

  function toggleGroup(groupName: string) {
    const next = new Set(collapsedGroups);
    if (next.has(groupName)) {
      next.delete(groupName);
    } else {
      next.add(groupName);
    }
    collapsedGroups = next;
  }

  function filterNicks(nicks: WeeChatNick[]): WeeChatNick[] {
    if (!filter) return nicks;
    const lc = filter.toLowerCase();
    return nicks.filter(n => n.name.toLowerCase().includes(lc));
  }

  function openPopover(e: MouseEvent, nick: WeeChatNick) {
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 240);
    const y = Math.min(e.clientY, window.innerHeight - 200);
    popover = { nick, x, y };
  }

  function closePopover() {
    popover = null;
  }

  function nickStyle(name: string): string {
    if (!settings.colorNicks) return '';
    return `color: ${nickColor(name)}`;
  }

  // Map WeeChat color name or numeric string to a CSS color string
  const WEECHAT_NAMED: Record<string, string> = {
    black: '#000', red: '#cc2222', green: '#22aa44', brown: '#aa7700',
    yellow: '#ccaa00', blue: '#3355cc', magenta: '#aa44aa', cyan: '#228899',
    white: '#ddd', lightgray: '#bbb', darkgray: '#777',
    lightred: '#ff5555', lightgreen: '#44ee66', lightyellow: '#ffff44',
    lightblue: '#5577ff', lightmagenta: '#ff66ff', lightcyan: '#44ddff',
    default: '',
  };
  // xterm-256 cube (same logic as formatter.ts buildExtended)
  function xtermColor(n: number): string {
    if (n < 0 || n > 255) return '';
    if (n < 16) {
      const base16 = ['#000','#800','#080','#880','#008','#808','#088','#ccc',
                      '#888','#f55','#5f5','#ff5','#55f','#f5f','#5ff','#fff'];
      return base16[n] ?? '';
    }
    if (n < 232) {
      const i = n - 16, bv = i % 6, gv = Math.floor(i / 6) % 6, rv = Math.floor(i / 36);
      const c = (v: number) => v === 0 ? 0 : 55 + v * 40;
      return `rgb(${c(rv)},${c(gv)},${c(bv)})`;
    }
    const v = 8 + (n - 232) * 10;
    return `rgb(${v},${v},${v})`;
  }
  function weechatColor(spec: string): string {
    if (!spec) return '';
    const named = WEECHAT_NAMED[spec.toLowerCase()];
    if (named !== undefined) return named;
    const n = parseInt(spec, 10);
    if (!isNaN(n)) return xtermColor(n);
    return '';
  }

  function prefixStyle(nick: WeeChatNick): string {
    const css = weechatColor(nick.prefixColor);
    return css ? `color: ${css}` : '';
  }

  // Count total non-group nicks
  const totalNicks = $derived(() => {
    let n = 0;
    for (const [, nicks] of nickGroups) n += nicks.length;
    return n;
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions a11y_no_noninteractive_element_interactions -->
<aside
  aria-label="User list"
  class="flex flex-col h-full bg-gray-900 border-l border-gray-800"
  style="width: 220px; flex-shrink: 0;"
  onclick={closePopover}
  onkeydown={(e) => e.key === 'Escape' && closePopover()}
>
  <!-- Header -->
  <div class="px-3 py-2.5 border-b border-gray-800 flex-shrink-0">
    <div class="flex items-center justify-between mb-2">
      <span class="text-xs font-semibold text-gray-400 uppercase tracking-widest">Users</span>
      <span class="text-xs text-gray-600">{totalNicks()}</span>
    </div>
    <input
      class="w-full bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 px-2 py-1 outline-none focus:border-blue-500 placeholder-gray-600"
      bind:value={filter}
      placeholder="Filter users…"
      autocomplete="off"
      spellcheck="false"
    />
  </div>

  <!-- Nick groups -->
  <div class="flex-1 overflow-y-auto py-1">
    {#if !entry}
      <div class="px-3 py-4 text-xs text-gray-600 text-center">No channel selected</div>
    {:else if nickGroups.size === 0}
      <div class="px-3 py-4 text-xs text-gray-600 text-center">No users</div>
    {:else}
      {#each nickGroups as [groupName, nicks] (groupName)}
        {@const visible = filterNicks(nicks)}
        {#if visible.length > 0}
          <!-- Group header -->
          <button
            class="w-full text-left px-3 py-1 flex items-center justify-between group transition-colors hover:bg-gray-800/40"
            onclick={() => toggleGroup(groupName)}
          >
            <span class="text-[10px] font-bold uppercase tracking-widest text-gray-500 group-hover:text-gray-400 transition-colors">
              {groupName}
            </span>
            <span class="flex items-center gap-1">
              <span class="text-[10px] text-gray-600">{visible.length}</span>
              <svg
                class="w-2.5 h-2.5 text-gray-600 transition-transform {collapsedGroups.has(groupName) ? '-rotate-90' : ''}"
                viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
              >
                <path d="M4 6l4 4 4-4"/>
              </svg>
            </span>
          </button>

          {#if !collapsedGroups.has(groupName)}
            {#each visible as nick (nick.name)}
              <button
                class="w-full text-left px-3 py-0.5 flex items-center gap-1.5 text-xs transition-colors hover:bg-gray-800/60 group"
                onclick={(e) => openPopover(e, nick)}
              >
                {#if settings.showPrefixes && nick.prefix.trim()}
                  <span class="flex-shrink-0 font-mono text-[11px] font-bold w-3" style={prefixStyle(nick)}>{nick.prefix.trim()}</span>
                {:else}
                  <span class="w-3 flex-shrink-0"></span>
                {/if}
                <span
                  class="truncate flex-1 group-hover:brightness-125 transition-all {nick.visible === false ? 'opacity-40' : ''}"
                  style={nickStyle(nick.name)}
                >
                  {nick.name}
                </span>
              </button>
            {/each}
          {/if}
        {/if}
      {/each}
    {/if}
  </div>
</aside>

<!-- Nick popover -->
{#if popover}
  <div
    role="tooltip"
    class="fixed z-50 bg-gray-800 border border-gray-700 rounded shadow-xl py-2 px-3 text-xs text-gray-300 min-w-[180px]"
    style="left: {popover.x}px; top: {popover.y}px;"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
  >
    <div class="font-semibold text-sm mb-1" style={nickStyle(popover.nick.name)}>{popover.nick.name}</div>
    {#if popover.nick.prefix.trim()}
      <div class="text-gray-500">Mode: {popover.nick.prefix.trim()}</div>
    {/if}
    <div class="mt-2 flex gap-2 flex-wrap">
      <button
        class="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs transition-colors"
        onclick={() => { window.dispatchEvent(new CustomEvent('insert-text', { detail: popover!.nick.name + ': ' })); closePopover(); }}
      >Mention</button>
      <button
        class="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs transition-colors"
        onclick={() => { chat.openQuery(popover!.nick.name); closePopover(); }}
      >Message</button>
      {#if settings.enableVideoCalls}
      <button
        class="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs transition-colors"
        onclick={() => { video.startCall(popover!.nick.name); closePopover(); }}
        title="Start video call"
      >📹 Call</button>
      {/if}
      <button
        class="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs transition-colors"
        onclick={() => { chat.sendInput(`/whois ${popover!.nick.name}`); closePopover(); }}
      >Whois</button>
    </div>
  </div>
{/if}
