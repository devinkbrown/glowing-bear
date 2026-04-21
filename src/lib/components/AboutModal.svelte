<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import BearLogo from '$lib/components/BearLogo.svelte';
  interface Props { onclose: () => void; }
  const { onclose }: Props = $props();

  function keydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }
</script>

<svelte:window onkeydown={keydown} />

<!-- Backdrop -->
<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
  role="presentation"
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
  transition:fade={{ duration: 150 }}
  onclick={onclose}
>
  <!-- Modal -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    role="document"
    class="relative w-80 max-w-[90vw] rounded-2xl bg-gray-900 border border-white/[0.07] shadow-2xl shadow-black/70 overflow-hidden"
    transition:fly={{ y: 16, duration: 200, easing: cubicOut }}
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
  >
    <!-- Top accent bar -->
    <div class="h-0.5 w-full bg-gradient-to-r from-blue-600/0 via-blue-500/60 to-blue-600/0"></div>

    <div class="px-7 py-7 flex flex-col items-center gap-5">
      <!-- Logo + name -->
      <div class="flex flex-col items-center gap-3">
        <BearLogo size={64} variant="full" />
        <div class="text-center">
          <h1 class="text-xl font-bold text-gray-100 tracking-tight">DarkBear</h1>
          <p class="text-xs text-gray-500 mt-0.5 tracking-widest uppercase">WeeChat Relay Client</p>
        </div>
      </div>

      <!-- Divider -->
      <div class="w-full border-t border-white/[0.06]"></div>

      <!-- Feature pills -->
      <div class="flex flex-wrap justify-center gap-1.5">
        {#each ['IRC / IRCv3', 'Multi-buffer', 'Split pane', 'Nick completion', 'Message search', 'Mobile'] as feat}
          <span class="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-white/[0.05] text-gray-400 border border-white/[0.07]">{feat}</span>
        {/each}
      </div>

      <!-- Divider -->
      <div class="w-full border-t border-white/[0.06]"></div>

      <!-- Info rows -->
      <div class="w-full flex flex-col gap-2 text-sm">
        <div class="flex justify-between">
          <span class="text-gray-500">Backend</span>
          <span class="text-gray-300 font-mono text-xs">WeeChat relay</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500">Protocol</span>
          <span class="text-gray-300 font-mono text-xs">WebSocket / IRC</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500">Stack</span>
          <span class="text-gray-300 font-mono text-xs">SvelteKit 5 + Tailwind v4</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500">Shortcuts</span>
          <span class="text-gray-300 font-mono text-xs">Press <kbd class="px-1 py-0.5 rounded bg-white/[0.07] border border-white/[0.10] text-gray-300 text-[10px]">?</kbd> for help</span>
        </div>
      </div>

      <!-- Divider -->
      <div class="w-full border-t border-white/[0.06]"></div>

      <button
        onclick={onclose}
        class="w-full py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] text-gray-300 text-sm transition-colors border border-white/[0.06]"
      >Close</button>
    </div>
  </div>
</div>
