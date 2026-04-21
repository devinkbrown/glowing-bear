<script lang="ts">
  import { settings, type ThemeName, type CustomThemeColors, DEFAULT_CUSTOM_COLORS } from '$lib/stores/settings.svelte.js';
  import { syncNoVideoProp } from '$lib/stores/video.svelte.js';
  import { chat } from '$lib/stores/chat.svelte.js';
  import { buffers } from '$lib/stores/buffers.svelte.js';
  import { requestPermission } from '$lib/utils/notifications.js';

  let newIgnoreNick = $state('');
  let newHighlightWord = $state('');

  interface Props {
    open?: boolean;
    onclose?: () => void;
  }

  const { onclose }: Props = $props();

  type Tab = 'connection' | 'appearance' | 'messages' | 'notifications' | 'invites' | 'about';
  let activeTab = $state<Tab>('connection');

  const notifPermission = $derived(
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'unsupported'
  );

  function close() {
    settings.save();
    onclose?.();
  }

  function onBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }

  async function requestNotif() {
    await requestPermission();
  }

  // Preset theme colors for "Load from preset" in Custom theme editor
  const PRESET_COLORS: Record<string, CustomThemeColors> = {
    darkbear:     { gray950:'#0c0d12', gray900:'#111318', gray800:'#15171d', gray700:'#1c1e25', gray600:'#25272e', gray500:'#484b5c', gray400:'#686c7e', gray300:'#9298aa', gray200:'#c4c8d8', gray100:'#e8ebf5', gray50:'#f4f6ff', accent:'#3b82f6' },
    obsidian:     { gray950:'#000000', gray900:'#0a0a0a', gray800:'#141414', gray700:'#1c1c1c', gray600:'#2a2a2a', gray500:'#404040', gray400:'#606060', gray300:'#888888', gray200:'#b0b0b0', gray100:'#d8d8d8', gray50:'#f0f0f0', accent:'#6366f1' },
    nord:         { gray950:'#242933', gray900:'#2e3440', gray800:'#3b4252', gray700:'#434c5e', gray600:'#4c566a', gray500:'#6b7a90', gray400:'#8896aa', gray300:'#b0bcd0', gray200:'#d8dee9', gray100:'#e5e9f0', gray50:'#eceff4', accent:'#88c0d0' },
    gruvbox:      { gray950:'#141617', gray900:'#1d2021', gray800:'#282828', gray700:'#3c3836', gray600:'#504945', gray500:'#7c6f64', gray400:'#a89984', gray300:'#bdae93', gray200:'#d5c4a1', gray100:'#ebdbb2', gray50:'#fbf1c7', accent:'#d79921' },
    'rose-pine':  { gray950:'#191724', gray900:'#1f1d2e', gray800:'#26233a', gray700:'#312e44', gray600:'#403d52', gray500:'#55526a', gray400:'#6e6a86', gray300:'#787390', gray200:'#9893a5', gray100:'#c5c3d8', gray50:'#e0def4', accent:'#eb6f92' },
    abyss:        { gray950:'#010606', gray900:'#020a0a', gray800:'#041414', gray700:'#082424', gray600:'#0d3838', gray500:'#165858', gray400:'#258080', gray300:'#42aaaa', gray200:'#70cccc', gray100:'#a8e8e8', gray50:'#d0f4f4', accent:'#2dd4bf' },
    ember:        { gray950:'#080200', gray900:'#0e0502', gray800:'#180a04', gray700:'#261008', gray600:'#3a1a0e', gray500:'#5c2c18', gray400:'#884428', gray300:'#b06840', gray200:'#d8966a', gray100:'#f5c8a0', gray50:'#fde8d0', accent:'#f97316' },
    aurora:       { gray950:'#040208', gray900:'#08050f', gray800:'#100a20', gray700:'#1a1032', gray600:'#261a48', gray500:'#382a64', gray400:'#524088', gray300:'#7460a8', gray200:'#9c88d0', gray100:'#c8b8f0', gray50:'#e4daf8', accent:'#a78bfa' },
    catppuccin:   { gray950:'#1e1e2e', gray900:'#313244', gray800:'#45475a', gray700:'#585b70', gray600:'#6c7086', gray500:'#7f849c', gray400:'#9399b2', gray300:'#a6adc8', gray200:'#bac2de', gray100:'#cdd6f4', gray50:'#e4e8ff', accent:'#cba6f7' },
    'tokyo-night':{ gray950:'#1a1b26', gray900:'#1f2335', gray800:'#292e42', gray700:'#414868', gray600:'#565f89', gray500:'#636d9c', gray400:'#787ca3', gray300:'#9aa5ce', gray200:'#a9b1d6', gray100:'#c0caf5', gray50:'#e8ecff', accent:'#7aa2f7' },
    dracula:      { gray950:'#1e1f29', gray900:'#282a36', gray800:'#383a4a', gray700:'#44475a', gray600:'#565869', gray500:'#6272a4', gray400:'#9aa5d0', gray300:'#c5c6d8', gray200:'#e0e0d8', gray100:'#f8f8f2', gray50:'#f8f8ff', accent:'#bd93f9' },
    solarized:    { gray950:'#002b36', gray900:'#073642', gray800:'#0d3640', gray700:'#224249', gray600:'#3d5a63', gray500:'#586e75', gray400:'#657b83', gray300:'#839496', gray200:'#93a1a1', gray100:'#eee8d5', gray50:'#fdf6e3', accent:'#268bd2' },
    light:        { gray950:'#ffffff', gray900:'#f9fafb', gray800:'#f3f4f6', gray700:'#e5e7eb', gray600:'#d1d5db', gray500:'#9ca3af', gray400:'#6b7280', gray300:'#4b5563', gray200:'#374151', gray100:'#1f2937', gray50:'#111827', accent:'#3b82f6' },
  };

  function loadPresetIntoCustom(presetId: string) {
    const p = PRESET_COLORS[presetId];
    if (p) { settings.customColors = { ...p }; settings.scheduleSave(); }
  }

  // Color slot labels for the custom theme editor
  const COLOR_SLOTS: { key: keyof CustomThemeColors; label: string; desc: string }[] = [
    { key: 'gray950', label: 'Canvas',      desc: 'Message area background' },
    { key: 'gray900', label: 'Background',  desc: 'Header & sidebar background' },
    { key: 'gray800', label: 'Panel',       desc: 'Input fields & panels' },
    { key: 'gray700', label: 'Hover',       desc: 'Hover & elevated surfaces' },
    { key: 'gray600', label: 'Border',      desc: 'Dividers & strong borders' },
    { key: 'gray500', label: 'Faint',       desc: 'Subtle borders, timestamps' },
    { key: 'gray400', label: 'Muted',       desc: 'Icons & muted labels' },
    { key: 'gray300', label: 'Secondary',   desc: 'Secondary text' },
    { key: 'gray200', label: 'Body',        desc: 'Chat message text' },
    { key: 'gray100', label: 'Primary',     desc: 'Nick names & primary text' },
    { key: 'gray50',  label: 'Bright',      desc: 'Highlights & near-white' },
    { key: 'accent',  label: 'Accent',      desc: 'Links, buttons, active states' },
  ];

  const FONT_PRESETS = [
    { id: 'system', label: 'System' },
    { id: 'mono',   label: 'Monospace' },
    { id: 'serif',  label: 'Serif' },
  ];

  // ── Invites ─────────────────────────────────────────────────────────────────

  const INVITE_API = '/darkbear/invites';
  let inviteCodes  = $state<string[]>([]);
  let inviteLoad   = $state(false);
  let inviteErr    = $state('');
  let newCode      = $state('');
  let inviteCopied = $state('');

  $effect(() => {
    if (activeTab === 'invites') loadInvites();
  });

  async function loadInvites() {
    inviteLoad = true; inviteErr = '';
    try {
      const r = await fetch(INVITE_API, { cache: 'no-store' });
      const d = await r.json();
      inviteCodes = d.codes ?? [];
    } catch { inviteErr = 'Could not load codes.'; }
    finally { inviteLoad = false; }
  }

  async function inviteAction(action: 'add' | 'remove', code: string) {
    if (!settings.inviteToken) { inviteErr = 'Enter admin token first.'; return; }
    inviteErr = '';
    try {
      const r = await fetch(INVITE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.inviteToken}` },
        body: JSON.stringify({ action, code }),
      });
      if (r.status === 401) { inviteErr = 'Wrong token.'; return; }
      const d = await r.json();
      if (d.error) { inviteErr = d.error; return; }
      inviteCodes = d.codes ?? [];
      if (action === 'add') newCode = '';
    } catch { inviteErr = 'Request failed.'; }
  }

  function generateCode() {
    const words = ['nova','echo','tide','axle','glow','dusk','haze','crest','fern','volt','reed','plex'];
    const pick = () => words[Math.floor(Math.random() * words.length)];
    newCode = `${pick()}-${pick()}-${Math.floor(1000 + Math.random() * 9000)}`;
  }

  async function copyAndAdd(code: string) {
    await navigator.clipboard.writeText(code);
    inviteCopied = code;
    setTimeout(() => { if (inviteCopied === code) inviteCopied = ''; }, 2000);
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'connection', label: 'Connection' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'messages', label: 'Messages' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'invites', label: 'Invites' },
    { id: 'about', label: 'About' }
  ];
</script>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
    onclick={onBackdrop}
    onkeydown={onKeydown}
    role="dialog"
    aria-modal="true"
    aria-label="Settings"
    tabindex="-1"
  >
    <div
      class="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg flex flex-col"
      style="max-height: 90vh;"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-gray-800 flex-shrink-0">
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          <span class="text-sm font-semibold text-gray-100">Settings</span>
        </div>
        <button
          onclick={close}
          class="text-gray-500 hover:text-gray-300 transition-colors p-1 rounded-lg hover:bg-gray-800"
          aria-label="Close"
        >
          <svg class="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M3 3l10 10M13 3L3 13"/>
          </svg>
        </button>
      </div>

      <!-- Tabs -->
      <div class="flex border-b border-gray-800 px-2 flex-shrink-0 overflow-x-auto">
        {#each tabs as tab (tab.id)}
          <button
            class="px-4 py-2.5 text-xs font-medium whitespace-nowrap transition-colors border-b-2
              {activeTab === tab.id
                ? 'text-blue-400 border-blue-500'
                : 'text-gray-500 border-transparent hover:text-gray-300'}"
            onclick={() => (activeTab = tab.id)}
          >
            {tab.label}
          </button>
        {/each}
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto px-5 py-4">

        {#if activeTab === 'connection'}
          <div class="flex flex-col gap-4">
            <label class="flex flex-col gap-1.5">
              <span class="text-xs font-medium text-gray-400">Host</span>
              <input
                class="bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 px-3 py-2 outline-none focus:border-blue-500 transition-colors"
                type="text"
                bind:value={settings.relay.host}
                onchange={() => settings.scheduleSave()}
                placeholder="eshmaki.me"
                autocomplete="off"
                spellcheck="false"
              />
            </label>
            <div class="flex gap-3">
              <label class="flex flex-col gap-1.5 flex-1">
                <span class="text-xs font-medium text-gray-400">Port</span>
                <input
                  class="bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 px-3 py-2 outline-none focus:border-blue-500 transition-colors"
                  type="number" min="1" max="65535"
                  bind:value={settings.relay.port}
                  onchange={() => settings.scheduleSave()}
                />
              </label>
              <div class="flex flex-col gap-1.5 items-center">
                <span class="text-xs font-medium text-gray-400">TLS</span>
                <button
                  role="switch"
                  aria-label="TLS"
                  aria-checked={settings.relay.tls}
                  onclick={() => { settings.relay = { ...settings.relay, tls: !settings.relay.tls }; settings.scheduleSave(); }}
                  class="relative inline-flex items-center w-11 h-6 rounded-full transition-colors mt-1.5 overflow-hidden flex-shrink-0
                    {settings.relay.tls ? 'bg-blue-600' : 'bg-gray-700'}"
                >
                  <span class="pointer-events-none absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200
                    {settings.relay.tls ? 'translate-x-5' : 'translate-x-0'}"></span>
                </button>
              </div>
              <div class="flex flex-col gap-1.5 items-center">
                <span class="text-xs font-medium text-gray-400 whitespace-nowrap">Compress</span>
                <button
                  role="switch"
                  aria-label="Compress"
                  aria-checked={settings.relay.compression}
                  onclick={() => { settings.relay = { ...settings.relay, compression: !settings.relay.compression }; settings.scheduleSave(); }}
                  class="relative inline-flex items-center w-11 h-6 rounded-full transition-colors mt-1.5 overflow-hidden flex-shrink-0
                    {settings.relay.compression ? 'bg-blue-600' : 'bg-gray-700'}"
                >
                  <span class="pointer-events-none absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200
                    {settings.relay.compression ? 'translate-x-5' : 'translate-x-0'}"></span>
                </button>
              </div>
            </div>
            <label class="flex flex-col gap-1.5">
              <span class="text-xs font-medium text-gray-400">Relay Password</span>
              <input
                class="bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 px-3 py-2 outline-none focus:border-blue-500 transition-colors"
                type="password"
                bind:value={settings.relay.password}
                onchange={() => settings.scheduleSave()}
                placeholder="••••••••"
                autocomplete="current-password"
              />
            </label>
            <div class="flex items-center justify-between py-2">
              <div>
                <div class="text-sm text-gray-300">Auto-reconnect</div>
                <div class="text-xs text-gray-500">Reconnect automatically on disconnect</div>
              </div>
              <button
                role="switch"
                aria-label="Auto-reconnect"
                aria-checked={settings.autoReconnect}
                onclick={() => { settings.autoReconnect = !settings.autoReconnect; settings.scheduleSave(); }}
                class="relative inline-flex items-center w-11 h-6 rounded-full transition-colors overflow-hidden flex-shrink-0
                  {settings.autoReconnect ? 'bg-blue-600' : 'bg-gray-700'}"
              >
                <span class="pointer-events-none absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200
                  {settings.autoReconnect ? 'translate-x-5' : 'translate-x-0'}"></span>
              </button>
            </div>

            <!-- ── Profiles ─────────────────────────────────────────── -->
            {#if settings.profiles.length > 0}
              <div class="flex flex-col gap-2">
                <span class="text-xs font-medium text-gray-400 uppercase tracking-wider">Saved Profiles</span>
                {#each settings.profiles as p}
                  <div class="flex items-center gap-2 bg-gray-800/60 rounded-lg px-3 py-2">
                    <span class="flex-1 text-sm text-gray-200 truncate">{p.name}</span>
                    <span class="text-xs text-gray-500 truncate">{p.relay.host}:{p.relay.port}</span>
                    <button
                      onclick={() => { settings.loadProfile(p.name); }}
                      class="text-xs px-2 py-1 rounded bg-blue-600/20 text-blue-300 hover:bg-blue-600/35 transition-colors"
                    >Load</button>
                    <button
                      onclick={() => settings.deleteProfile(p.name)}
                      class="text-xs px-2 py-1 rounded bg-red-600/15 text-red-400 hover:bg-red-600/30 transition-colors"
                    >✕</button>
                  </div>
                {/each}
              </div>
            {/if}

            <!-- ── Export / Import ──────────────────────────────────── -->
            <div class="flex flex-col gap-2">
              <span class="text-xs font-medium text-gray-400 uppercase tracking-wider">Backup</span>
              <div class="flex gap-2">
                <button
                  onclick={() => {
                    const json = settings.exportJSON();
                    const a = document.createElement('a');
                    a.href = 'data:application/json,' + encodeURIComponent(json);
                    a.download = 'darkbear-settings.json';
                    a.click();
                  }}
                  class="flex-1 py-2 text-sm rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:border-gray-500 transition-colors"
                >Export JSON</button>
                <label class="flex-1 py-2 text-sm rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:border-gray-500 transition-colors text-center cursor-pointer">
                  Import JSON
                  <input type="file" accept=".json,application/json" class="sr-only" onchange={(e) => {
                    const file = (e.currentTarget as HTMLInputElement).files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      try { settings.importJSON(reader.result as string); }
                      catch { alert('Invalid settings file'); }
                    };
                    reader.readAsText(file);
                  }}/>
                </label>
              </div>
            </div>
          </div>

        {:else if activeTab === 'appearance'}
          <div class="flex flex-col gap-5">

            <!-- ── Theme presets ─────────────────────────────────── -->
            <div class="flex flex-col gap-2">
              <span class="text-xs font-medium text-gray-400 uppercase tracking-wider">Theme</span>
              <div class="grid grid-cols-5 gap-1.5">
                {#each ([
                  { id: 'darkbear',    label: 'DarkBear',    colors: ['#0c0d12','#15171d','#3b82f6'] },
                  { id: 'obsidian',    label: 'Obsidian',    colors: ['#000000','#141414','#6366f1'] },
                  { id: 'nord',        label: 'Nord',         colors: ['#242933','#3b4252','#88c0d0'] },
                  { id: 'gruvbox',     label: 'Gruvbox',     colors: ['#141617','#282828','#d79921'] },
                  { id: 'rose-pine',   label: 'Rosé Pine',   colors: ['#191724','#26233a','#eb6f92'] },
                  { id: 'abyss',       label: 'Abyss',        colors: ['#010606','#041414','#2dd4bf'] },
                  { id: 'ember',       label: 'Ember',        colors: ['#080200','#180a04','#f97316'] },
                  { id: 'aurora',      label: 'Aurora',       colors: ['#040208','#100a20','#a78bfa'] },
                  { id: 'catppuccin',  label: 'Catppuccin',  colors: ['#1e1e2e','#45475a','#cba6f7'] },
                  { id: 'tokyo-night', label: 'Tokyo Night', colors: ['#1a1b26','#292e42','#7aa2f7'] },
                  { id: 'dracula',     label: 'Dracula',     colors: ['#1e1f29','#383a4a','#bd93f9'] },
                  { id: 'solarized',   label: 'Solarized',   colors: ['#002b36','#0d3640','#268bd2'] },
                  { id: 'light',       label: 'Light',        colors: ['#ffffff','#f3f4f6','#3b82f6'] },
                  { id: 'custom',      label: 'Custom',       colors: [settings.customColors.gray950, settings.customColors.gray800, settings.customColors.accent] },
                ] as const) as t (t.id)}
                  <button
                    onclick={() => { settings.theme = t.id as ThemeName; settings.scheduleSave(); }}
                    class="flex flex-col items-center gap-1 py-2 px-1 rounded-lg border transition-all
                      {settings.theme === t.id
                        ? 'border-blue-500 bg-blue-500/5'
                        : 'border-gray-700 hover:border-gray-600'}"
                  >
                    <div class="flex gap-px rounded overflow-hidden w-10 h-4 flex-shrink-0">
                      {#each t.colors as color}
                        <div class="flex-1" style="background:{color}"></div>
                      {/each}
                    </div>
                    <span class="text-[10px] leading-tight text-center {settings.theme === t.id ? 'text-blue-300' : 'text-gray-500'}">{t.label}</span>
                  </button>
                {/each}
              </div>
            </div>

            <!-- ── Custom theme color editor ─────────────────────── -->
            {#if settings.theme === 'custom'}
              <div class="flex flex-col gap-3 bg-gray-800/30 rounded-xl p-3 border border-gray-700/50">
                <div class="flex items-center justify-between">
                  <span class="text-xs font-medium text-gray-300">Custom Colors</span>
                  <!-- Load from preset -->
                  <select
                    class="text-[10px] bg-gray-800 border border-gray-700 text-gray-400 rounded px-1.5 py-1 outline-none focus:border-blue-500"
                    onchange={(e) => { loadPresetIntoCustom((e.target as HTMLSelectElement).value); (e.target as HTMLSelectElement).value = ''; }}
                  >
                    <option value="" disabled selected>Load preset…</option>
                    {#each Object.keys(PRESET_COLORS) as pid (pid)}
                      <option value={pid}>{pid}</option>
                    {/each}
                  </select>
                </div>
                <div class="grid grid-cols-2 gap-x-4 gap-y-2">
                  {#each COLOR_SLOTS as slot (slot.key)}
                    <label class="flex items-center gap-2 cursor-pointer group">
                      <div class="relative flex-shrink-0">
                        <input
                          type="color"
                          value={settings.customColors[slot.key]}
                          oninput={(e) => {
                            settings.customColors = { ...settings.customColors, [slot.key]: (e.target as HTMLInputElement).value };
                            settings.scheduleSave();
                          }}
                          class="w-7 h-7 rounded-md border border-gray-600 cursor-pointer bg-transparent p-0.5 appearance-none"
                          style="background: {settings.customColors[slot.key]};"
                          title={slot.desc}
                        />
                      </div>
                      <div class="min-w-0">
                        <div class="text-xs text-gray-300 group-hover:text-gray-100 transition-colors">{slot.label}</div>
                        <div class="text-[10px] text-gray-600 truncate">{slot.desc}</div>
                      </div>
                    </label>
                  {/each}
                </div>
                <button
                  onclick={() => { settings.customColors = { ...DEFAULT_CUSTOM_COLORS }; settings.scheduleSave(); }}
                  class="text-[11px] text-gray-600 hover:text-gray-400 transition-colors self-start"
                >Reset colors to default</button>
              </div>
            {/if}

            <!-- ── Font ───────────────────────────────────────────── -->
            <div class="flex flex-col gap-2">
              <span class="text-xs font-medium text-gray-400 uppercase tracking-wider">Font</span>
              <div class="flex gap-1.5 flex-wrap">
                {#each FONT_PRESETS as fp (fp.id)}
                  <button
                    onclick={() => { settings.fontFamily = fp.id; settings.scheduleSave(); }}
                    class="px-3 py-1.5 text-xs rounded-lg border transition-colors
                      {settings.fontFamily === fp.id
                        ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-300'}"
                  >{fp.label}</button>
                {/each}
              </div>
              <!-- Custom font name input -->
              <div class="flex items-center gap-2">
                <input
                  class="flex-1 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-200 px-3 py-2 outline-none focus:border-blue-500 transition-colors placeholder-gray-600"
                  type="text"
                  placeholder="Or type any font name: 'Inter', 'Fira Code', …"
                  value={['system','mono','serif'].includes(settings.fontFamily) ? '' : settings.fontFamily}
                  oninput={(e) => {
                    const v = (e.target as HTMLInputElement).value.trim();
                    if (v) { settings.fontFamily = v; settings.scheduleSave(); }
                  }}
                  onblur={(e) => {
                    const v = (e.target as HTMLInputElement).value.trim();
                    if (!v) { settings.fontFamily = 'system'; settings.scheduleSave(); }
                  }}
                  autocomplete="off"
                  spellcheck="false"
                />
              </div>
              <div class="text-[11px] text-gray-600">Preview: <span style="font-family: var(--app-font);">The quick brown fox</span></div>
            </div>

            <!-- ── Font Size ──────────────────────────────────────── -->
            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between">
                <span class="text-xs font-medium text-gray-400 uppercase tracking-wider">Font Size</span>
                <span class="text-xs text-gray-500">{settings.fontSize}px</span>
              </div>
              <input
                type="range" min="12" max="20" step="1"
                bind:value={settings.fontSize}
                oninput={() => settings.scheduleSave()}
                class="w-full accent-blue-500"
              />
              <div class="flex justify-between text-[10px] text-gray-600">
                <span>12</span><span>14</span><span>16</span><span>18</span><span>20</span>
              </div>
            </div>

            <!-- ── Layout ─────────────────────────────────────────── -->
            <div class="flex flex-col gap-3">
              <span class="text-xs font-medium text-gray-400 uppercase tracking-wider">Layout</span>

              <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between">
                  <span class="text-xs text-gray-300">Sidebar width</span>
                  <span class="text-xs text-gray-500">{settings.sidebarWidth}px</span>
                </div>
                <input
                  type="range" min="120" max="360" step="10"
                  bind:value={settings.sidebarWidth}
                  oninput={() => settings.scheduleSave()}
                  class="w-full accent-blue-500"
                />
                <div class="flex justify-between text-[10px] text-gray-600">
                  <span>120</span><span>240</span><span>360</span>
                </div>
              </div>

              <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between">
                  <span class="text-xs text-gray-300">Watermark opacity</span>
                  <span class="text-xs text-gray-500">{settings.watermarkOpacity}%</span>
                </div>
                <input
                  type="range" min="0" max="60" step="5"
                  bind:value={settings.watermarkOpacity}
                  oninput={() => settings.scheduleSave()}
                  class="w-full accent-blue-500"
                />
                <div class="flex justify-between text-[10px] text-gray-600">
                  <span>Off</span><span>30%</span><span>60%</span>
                </div>
              </div>
            </div>

            <!-- ── Background image ──────────────────────────────── -->
            <div class="flex flex-col gap-2">
              <span class="text-xs font-medium text-gray-400 uppercase tracking-wider">Background image</span>
              <div class="flex gap-2">
                <input
                  type="url"
                  placeholder="https://… image URL"
                  bind:value={settings.bgImage}
                  oninput={() => settings.scheduleSave()}
                  class="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500/50 min-w-0"
                />
                {#if settings.bgImage}
                  <button
                    onclick={() => { settings.bgImage = ''; settings.scheduleSave(); }}
                    class="px-2 text-gray-600 hover:text-gray-300 transition-colors flex-shrink-0"
                    title="Clear"
                  >✕</button>
                {/if}
              </div>
              {#if settings.bgImage}
                <!-- Opacity -->
                <div class="flex flex-col gap-1.5 mt-1">
                  <div class="flex items-center justify-between">
                    <span class="text-xs text-gray-400">Opacity</span>
                    <span class="text-xs text-gray-500">{settings.bgOpacity}%</span>
                  </div>
                  <input type="range" min="5" max="100" step="5"
                    bind:value={settings.bgOpacity}
                    oninput={() => settings.scheduleSave()}
                    class="w-full accent-blue-500"/>
                </div>

                <!-- Blur -->
                <div class="flex flex-col gap-1.5">
                  <div class="flex items-center justify-between">
                    <span class="text-xs text-gray-400">Blur</span>
                    <span class="text-xs text-gray-500">{settings.bgBlur === 0 ? 'Off' : `${settings.bgBlur}px`}</span>
                  </div>
                  <input type="range" min="0" max="20" step="1"
                    bind:value={settings.bgBlur}
                    oninput={() => settings.scheduleSave()}
                    class="w-full accent-blue-500"/>
                </div>

                <!-- Tint -->
                <div class="flex flex-col gap-1.5">
                  <span class="text-xs text-gray-400">Tint</span>
                  <div class="flex gap-1.5 flex-wrap">
                    {#each [
                      { label: 'None',    val: '' },
                      { label: 'Dark',    val: '#000000' },
                      { label: 'Navy',    val: '#0a0f2e' },
                      { label: 'Purple',  val: '#1a0a2e' },
                      { label: 'Warm',    val: '#1a0a00' },
                      { label: 'Forest',  val: '#001a0a' },
                    ] as preset}
                      <button
                        onclick={() => { settings.bgTint = preset.val; settings.scheduleSave(); }}
                        class="px-2.5 py-1 text-[11px] rounded-lg border transition-colors
                          {settings.bgTint === preset.val
                            ? 'border-blue-500/50 bg-blue-600/20 text-blue-300'
                            : 'border-gray-700 bg-gray-800 text-gray-400 hover:text-gray-200'}"
                      >{preset.label}</button>
                    {/each}
                    <label class="flex items-center gap-1 cursor-pointer" title="Custom tint colour">
                      <input type="color"
                        value={settings.bgTint || '#000000'}
                        oninput={(e) => { settings.bgTint = (e.target as HTMLInputElement).value; settings.scheduleSave(); }}
                        class="w-6 h-6 rounded border border-gray-700 bg-transparent cursor-pointer"
                      />
                      <span class="text-[11px] text-gray-500">Custom</span>
                    </label>
                  </div>
                  {#if settings.bgTint}
                    <div class="flex items-center justify-between">
                      <span class="text-xs text-gray-400">Tint strength</span>
                      <span class="text-xs text-gray-500">{settings.bgTintOpacity}%</span>
                    </div>
                    <input type="range" min="5" max="90" step="5"
                      bind:value={settings.bgTintOpacity}
                      oninput={() => settings.scheduleSave()}
                      class="w-full accent-blue-500"/>
                  {/if}
                </div>
              {/if}
            </div>

            <!-- ── Timestamps ─────────────────────────────────────── -->
            <div class="flex flex-col gap-2">
              <span class="text-xs font-medium text-gray-400 uppercase tracking-wider">Timestamps</span>
              <div class="flex gap-2">
                {#each (['24h', '12h', 'relative', 'off'] as const) as fmt (fmt)}
                  <button
                    onclick={() => { settings.timestampFormat = fmt; settings.scheduleSave(); }}
                    class="flex-1 py-2 text-xs rounded-lg border transition-colors
                      {settings.timestampFormat === fmt
                        ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-300'}"
                  >{fmt === 'off' ? 'Off' : fmt === 'relative' ? 'Relative' : fmt}</button>
                {/each}
              </div>
            </div>

            <!-- ── Toggles ─────────────────────────────────────────── -->
            {#each [
              { key: 'compactMode', label: 'Compact mode',  desc: 'Reduce spacing between messages' },
              { key: 'readMarker',  label: 'Read marker',   desc: 'Show a line marking unread messages' },
            ] as item (item.key)}
              <div class="flex items-center justify-between py-1 border-t border-gray-800/60">
                <div>
                  <div class="text-sm text-gray-300">{item.label}</div>
                  <div class="text-xs text-gray-500">{item.desc}</div>
                </div>
                <button
                  role="switch"
                  aria-label={item.label}
                  aria-checked={(settings as unknown as Record<string, unknown>)[item.key] as boolean}
                  onclick={() => {
                    (settings as unknown as Record<string, unknown>)[item.key] = !((settings as unknown as Record<string, unknown>)[item.key]);
                    settings.scheduleSave();
                  }}
                  class="relative inline-flex items-center w-11 h-6 rounded-full transition-colors overflow-hidden flex-shrink-0
                    {(settings as unknown as Record<string, unknown>)[item.key] ? 'bg-blue-600' : 'bg-gray-700'}"
                >
                  <span class="pointer-events-none absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200
                    {(settings as unknown as Record<string, unknown>)[item.key] ? 'translate-x-5' : 'translate-x-0'}"></span>
                </button>
              </div>
            {/each}
          </div>

        {:else if activeTab === 'messages'}
          <div class="flex flex-col gap-1">
            {#each [
              { key: 'inlineImages', label: 'Inline images & embeds', desc: 'Display images and YouTube/video/audio inline' },
              { key: 'joinPartMsgs', label: 'Join/part messages', desc: 'Show join, part and quit events' },
              { key: 'colorNicks', label: 'Colored nicks', desc: 'Assign a unique color to each nickname' },
              { key: 'showPrefixes', label: 'Nick prefixes',      desc: 'Show @ + % mode prefixes in user list' },
              { key: 'readOnFocus',  label: 'Mark read on focus', desc: 'Clear unread count when you return to the tab' },
              { key: 'onlyUnread',   label: 'Only show unread', desc: 'Hide buffers with no new messages from sidebar' },
            ] as item (item.key)}
              <div class="flex items-center justify-between py-2.5 border-b border-gray-800/60 last:border-0">
                <div>
                  <div class="text-sm text-gray-300">{item.label}</div>
                  <div class="text-xs text-gray-500">{item.desc}</div>
                </div>
                <button
                  role="switch"
                  aria-label={item.label}
                  aria-checked={(settings as unknown as Record<string, unknown>)[item.key] as boolean}
                  onclick={() => {
                    (settings as unknown as Record<string, unknown>)[item.key] = !((settings as unknown as Record<string, unknown>)[item.key]);
                    settings.scheduleSave();
                  }}
                  class="relative inline-flex items-center w-11 h-6 rounded-full transition-colors overflow-hidden flex-shrink-0
                    {(settings as unknown as Record<string, unknown>)[item.key] ? 'bg-blue-600' : 'bg-gray-700'}"
                >
                  <span class="pointer-events-none absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200
                    {(settings as unknown as Record<string, unknown>)[item.key] ? 'translate-x-5' : 'translate-x-0'}"></span>
                </button>
              </div>
            {/each}

            <!-- Video Calls -->
            <div class="mt-3 pt-3 border-t border-gray-800">
              <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Video Calls</div>
              <div class="flex items-center justify-between py-2.5">
                <div>
                  <div class="text-sm text-gray-300">Enable video calls</div>
                  <div class="text-xs text-gray-500">Accept incoming calls and show call buttons. Sets your <code class="text-gray-400">no-video</code> PROP on the server.</div>
                </div>
                <button
                  role="switch"
                  aria-label="Enable video calls"
                  aria-checked={settings.enableVideoCalls}
                  onclick={() => {
                    settings.enableVideoCalls = !settings.enableVideoCalls;
                    settings.scheduleSave();
                    syncNoVideoProp(settings.enableVideoCalls);
                  }}
                  class="relative inline-flex items-center w-11 h-6 rounded-full transition-colors overflow-hidden flex-shrink-0
                    {settings.enableVideoCalls ? 'bg-blue-600' : 'bg-gray-700'}"
                >
                  <span class="pointer-events-none absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200
                    {settings.enableVideoCalls ? 'translate-x-5' : 'translate-x-0'}"></span>
                </button>
              </div>
            </div>

            <!-- Custom CSS -->
            <div class="mt-3 pt-3 border-t border-gray-800">
              <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Custom CSS</div>
              <textarea
                rows="6"
                placeholder=".msg-area {'{'} font-family: monospace; {'}'}"
                value={settings.customCSS}
                oninput={(e) => { settings.customCSS = (e.target as HTMLTextAreaElement).value; settings.scheduleSave(); }}
                class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 font-mono resize-y focus:outline-none focus:border-blue-500/50 placeholder-gray-600"
              ></textarea>
            </div>

            <!-- Custom highlight words -->
            <div class="mt-3 pt-3 border-t border-gray-800">
              <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Highlight Words</div>
              <p class="text-xs text-gray-600 mb-2">Extra words or phrases that trigger highlights, in addition to your nick.</p>
              {#if settings.highlightWords.length > 0}
                <div class="flex flex-wrap gap-1.5 mb-2">
                  {#each settings.highlightWords as word, wi}
                    <span class="flex items-center gap-1 px-2 py-1 bg-yellow-500/10 border border-yellow-500/20 rounded-full text-xs text-yellow-300">
                      {word}
                      <button
                        onclick={() => { settings.highlightWords = settings.highlightWords.filter((_, i) => i !== wi); settings.scheduleSave(); }}
                        class="text-yellow-600 hover:text-red-400 transition-colors" aria-label="Remove">✕</button>
                    </span>
                  {/each}
                </div>
              {/if}
              <div class="flex gap-2">
                <input
                  class="flex-1 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 px-3 py-1.5 outline-none focus:border-blue-500 transition-colors"
                  type="text" placeholder="word or phrase" bind:value={newHighlightWord}
                  onkeydown={(e) => {
                    if (e.key === 'Enter' && newHighlightWord.trim()) {
                      const w = newHighlightWord.trim();
                      if (!settings.highlightWords.includes(w)) {
                        settings.highlightWords = [...settings.highlightWords, w];
                        settings.scheduleSave();
                      }
                      newHighlightWord = '';
                    }
                  }}
                />
                <button
                  onclick={() => {
                    const w = newHighlightWord.trim();
                    if (w && !settings.highlightWords.includes(w)) {
                      settings.highlightWords = [...settings.highlightWords, w];
                      settings.scheduleSave();
                    }
                    newHighlightWord = '';
                  }}
                  class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-sm text-gray-300 rounded-lg transition-colors"
                >Add</button>
              </div>
            </div>

            <!-- Ignore list -->
            <div class="mt-3 pt-3 border-t border-gray-800">
              <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Ignore List</div>
              {#if buffers.ignoredNicks.size === 0}
                <p class="text-xs text-gray-600 mb-2">No nicks ignored. Messages from ignored nicks are hidden.</p>
              {:else}
                <div class="flex flex-wrap gap-1.5 mb-2">
                  {#each [...buffers.ignoredNicks] as nick}
                    <span class="flex items-center gap-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded-full text-xs text-gray-300">
                      {nick}
                      <button onclick={() => buffers.removeIgnore(nick)} class="text-gray-500 hover:text-red-400 transition-colors" aria-label="Remove">✕</button>
                    </span>
                  {/each}
                </div>
              {/if}
              <div class="flex gap-2">
                <input
                  class="flex-1 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 px-3 py-1.5 outline-none focus:border-blue-500 transition-colors"
                  type="text" placeholder="nick to ignore" bind:value={newIgnoreNick}
                  onkeydown={(e) => { if (e.key === 'Enter' && newIgnoreNick.trim()) { buffers.addIgnore(newIgnoreNick.trim()); newIgnoreNick = ''; } }}
                />
                <button
                  onclick={() => { if (newIgnoreNick.trim()) { buffers.addIgnore(newIgnoreNick.trim()); newIgnoreNick = ''; } }}
                  class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-sm text-gray-300 rounded-lg transition-colors"
                >Add</button>
              </div>
            </div>
          </div>

        {:else if activeTab === 'notifications'}
          <div class="flex flex-col gap-4">
            {#if notifPermission === 'unsupported'}
              <div class="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2.5 text-xs text-yellow-400">
                Browser notifications are not supported in this environment.
              </div>
            {:else if notifPermission === 'denied'}
              <div class="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2.5 text-xs text-red-400">
                Notification permission was denied. Please allow notifications in your browser settings.
              </div>
            {:else if notifPermission !== 'granted'}
              <button
                onclick={requestNotif}
                class="bg-blue-600/20 border border-blue-500/50 text-blue-300 text-sm rounded-lg px-4 py-2.5 hover:bg-blue-600/30 transition-colors"
              >
                Grant notification permission
              </button>
            {/if}

            {#each [
              { key: 'notifications', label: 'Enable notifications', desc: 'Show browser notifications for highlights' },
              { key: 'notificationSound', label: 'Notification sound', desc: 'Play a sound on highlight' }
            ] as item (item.key)}
              <div class="flex items-center justify-between py-2 border-b border-gray-800/60 last:border-0">
                <div>
                  <div class="text-sm text-gray-300">{item.label}</div>
                  <div class="text-xs text-gray-500">{item.desc}</div>
                </div>
                <button
                  role="switch"
                  aria-label={item.label}
                  aria-checked={(settings as unknown as Record<string, unknown>)[item.key] as boolean}
                  onclick={() => {
                    (settings as unknown as Record<string, unknown>)[item.key] = !((settings as unknown as Record<string, unknown>)[item.key]);
                    settings.scheduleSave();
                  }}
                  class="relative inline-flex items-center w-11 h-6 rounded-full transition-colors overflow-hidden flex-shrink-0
                    {(settings as unknown as Record<string, unknown>)[item.key] ? 'bg-blue-600' : 'bg-gray-700'}"
                >
                  <span class="pointer-events-none absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200
                    {(settings as unknown as Record<string, unknown>)[item.key] ? 'translate-x-5' : 'translate-x-0'}"></span>
                </button>
              </div>
            {/each}
          </div>

        {:else if activeTab === 'invites'}
          <div class="flex flex-col gap-5 py-1">

            <!-- Admin token -->
            <div class="flex flex-col gap-2">
              <span class="text-xs font-medium text-gray-400 uppercase tracking-wider">Admin Token</span>
              <input
                bind:value={settings.inviteToken}
                oninput={() => settings.scheduleSave()}
                type="password"
                placeholder="Invite server bearer token"
                autocomplete="off"
                class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 font-mono outline-none focus:border-blue-500/50"
              />
              <p class="text-[11px] text-gray-600">Required to add or remove codes. Stored locally in settings.</p>
            </div>

            <!-- Code list -->
            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between">
                <span class="text-xs font-medium text-gray-400 uppercase tracking-wider">Active Codes</span>
                <button onclick={loadInvites} class="text-[11px] text-gray-600 hover:text-gray-400 transition-colors">Refresh</button>
              </div>

              {#if inviteLoad}
                <div class="text-xs text-gray-600 py-2 text-center">Loading…</div>
              {:else if inviteCodes.length === 0}
                <div class="text-xs text-gray-600 py-2 text-center">No codes yet.</div>
              {:else}
                <div class="flex flex-col gap-1">
                  {#each inviteCodes as code (code)}
                    <div class="flex items-center gap-2 px-3 py-2 bg-gray-800/50 rounded-lg">
                      <code class="flex-1 text-sm text-gray-300 font-mono tracking-wide">{code}</code>
                      <button
                        onclick={() => copyAndAdd(code)}
                        class="text-[11px] px-2 py-1 rounded-md transition-colors
                          {inviteCopied === code ? 'bg-green-600/20 text-green-400' : 'text-gray-600 hover:text-gray-300 hover:bg-white/5'}"
                        title="Copy to clipboard"
                      >
                        {inviteCopied === code ? 'Copied' : 'Copy'}
                      </button>
                      <button
                        onclick={() => inviteAction('remove', code)}
                        class="text-[11px] px-2 py-1 text-gray-700 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                        title="Revoke"
                      >✕</button>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>

            <!-- Add new code -->
            <div class="flex flex-col gap-2">
              <span class="text-xs font-medium text-gray-400 uppercase tracking-wider">New Code</span>
              <div class="flex gap-2">
                <input
                  bind:value={newCode}
                  type="text"
                  placeholder="e.g. nova-tide-3821"
                  class="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 font-mono outline-none focus:border-blue-500/50"
                  onkeydown={(e) => { if (e.key === 'Enter' && newCode.trim()) inviteAction('add', newCode.trim()); }}
                />
                <button
                  onclick={generateCode}
                  class="px-3 py-2 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
                  title="Generate random code"
                >Roll</button>
                <button
                  onclick={() => { if (newCode.trim()) inviteAction('add', newCode.trim()); }}
                  disabled={!newCode.trim()}
                  class="px-3 py-2 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >Add</button>
              </div>
            </div>

            {#if inviteErr}
              <p class="text-xs text-red-400">{inviteErr}</p>
            {/if}

          </div>

        {:else if activeTab === 'about'}
          <div class="flex flex-col items-center gap-4 py-6 text-center">
            <div class="w-16 h-16 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
              <svg class="w-8 h-8 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <div>
              <div class="text-xl font-semibold text-gray-100">DarkBear</div>
              <div class="text-sm text-gray-500 mt-0.5">v0.1.0</div>
            </div>
            <p class="text-sm text-gray-400 max-w-xs leading-relaxed">
              A modern WeeChat relay web client built with SvelteKit 5, TypeScript, and Tailwind CSS.
            </p>
            <div class="w-full border-t border-gray-800 pt-4 flex flex-col gap-2 text-xs text-gray-500">
              <div class="flex justify-between">
                <span>SvelteKit</span><span class="text-gray-400">5.x</span>
              </div>
              <div class="flex justify-between">
                <span>Protocol</span><span class="text-gray-400">WeeChat Relay v2</span>
              </div>
              <div class="flex justify-between">
                <span>License</span><span class="text-gray-400">GPL-3.0</span>
              </div>
            </div>
            <button
              onclick={() => { settings.reset(); }}
              class="text-xs text-red-400/70 hover:text-red-400 transition-colors mt-2"
            >
              Reset all settings to defaults
            </button>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="flex justify-end px-5 py-3 border-t border-gray-800 flex-shrink-0">
        <button
          onclick={close}
          class="px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  </div>
