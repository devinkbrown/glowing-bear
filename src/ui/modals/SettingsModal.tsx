// SettingsModal — the full settings surface, ported from the old React app.
//
// Five tabs:
//   Appearance — theme grid with animated previews (ThemeAnimation inline),
//                custom color pickers, typography (family + size), layout
//                sliders, background image (opacity / blur / tint).
//   Messages   — timestamp format, display toggles, sidebar unread filter,
//                highlight words editor.
//   Alerts     — desktop notifications, sound, read-on-focus, auto-reconnect.
//   Connection — relay settings + saved profiles manager + orochi bridge
//                (enabled, wsUrl override, account, password, autoJoinMedia,
//                e2eeDms).
//   Advanced   — upload URL, Tenor key, custom CSS, keyboard shortcut list,
//                export / import / reset settings.
//
// Usage: <SettingsModal open={uiState.activeModal === 'settings'} onClose={closeModal} />
// `open` defaults to true for conditional-mount usage.

import { For, Show, createEffect, createMemo, createSignal } from 'solid-js';
import type { JSX } from 'solid-js';
import {
  deleteProfile,
  exportSettings,
  importSettings,
  loadProfile,
  resetSettings,
  saveProfile,
  setCustomColors,
  setSceneMotion,
  setTheme,
  settings,
  updateBridge,
  updateRelay,
  updateSettings,
} from '@/state';
import type { BridgeSettings, CustomColors, ThemeId } from '@/state';
import Modal from '@/ui/bits/Modal';

type Tab = 'appearance' | 'messages' | 'notifications' | 'connection' | 'advanced';

/** Bridge settings + the optional e2eeDms flag (additive; may not be in the
 *  base type yet — treat as optional boolean). */
type BridgeExt = BridgeSettings & { e2eeDms?: boolean };

const THEMES: { id: ThemeId; name: string; accent: string; bg: string; text: string }[] = [
  { id: 'darkbear', name: 'DarkBear', accent: '#818cf8', bg: '#000005', text: '#d0d5e8' },
  { id: 'midnight', name: 'Midnight', accent: '#8b9cf8', bg: '#000000', text: '#e0e0e0' },
  { id: 'obsidian', name: 'Obsidian', accent: '#a78bfa', bg: '#070707', text: '#d4d4d4' },
  { id: 'nord', name: 'Nord', accent: '#88c0d0', bg: '#1e232b', text: '#d8dee9' },
  { id: 'gruvbox', name: 'Gruvbox', accent: '#d79921', bg: '#111314', text: '#ebdbb2' },
  { id: 'rose-pine', name: 'Rosé Pine', accent: '#eb6f92', bg: '#15131e', text: '#e0def4' },
  { id: 'abyss', name: 'Abyss', accent: '#2dd4bf', bg: '#03080a', text: '#b0e0e0' },
  { id: 'ember', name: 'Ember', accent: '#f97316', bg: '#080402', text: '#e0c0a0' },
  { id: 'aurora', name: 'Aurora', accent: '#a78bfa', bg: '#07030c', text: '#d0c0ee' },
  { id: 'catppuccin', name: 'Catppuccin', accent: '#cba6f7', bg: '#0e0e17', text: '#cdd6f4' },
  { id: 'tokyo-night', name: 'Tokyo Night', accent: '#7aa2f7', bg: '#101119', text: '#c0caf5' },
  { id: 'dracula', name: 'Dracula', accent: '#bd93f9', bg: '#191a23', text: '#f0f0ec' },
  { id: 'solarized', name: 'Solarized', accent: '#268bd2', bg: '#002430', text: '#c8d4d0' },
  { id: 'starfield', name: 'Starfield', accent: '#818cf8', bg: '#030408', text: '#c8cce8' },
  { id: 'lightning', name: 'Lightning', accent: '#60a5fa', bg: '#030408', text: '#d0d8e8' },
  { id: 'phoenix', name: 'Phoenix', accent: '#f59e0b', bg: '#0a0503', text: '#f0d8b0' },
  { id: 'retro', name: 'Retro Arcade', accent: '#ff00ff', bg: '#040609', text: '#e0ffe0' },
  { id: 'light', name: 'Light', accent: '#4f46e5', bg: '#ffffff', text: '#1f2937' },
  { id: 'custom', name: 'Custom', accent: '#888', bg: '#0c0d12', text: '#d0d4e0' },
];

const TABS: { id: Tab; label: string; desc: string; icon: string }[] = [
  { id: 'appearance', label: 'Appearance', desc: 'Theme, type, layout', icon: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z' },
  { id: 'messages', label: 'Messages', desc: 'Density, media, mentions', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
  { id: 'notifications', label: 'Alerts', desc: 'Notifications and recovery', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
  { id: 'connection', label: 'Connection', desc: 'Relay, profiles, bridge', icon: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1' },
  { id: 'advanced', label: 'Advanced', desc: 'CSS, uploads, data', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
];

const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'Alt+↑/↓', action: 'Switch buffers' },
  { keys: 'Alt+A', action: 'Jump to activity' },
  { keys: 'Ctrl+K', action: 'Buffer switcher' },
  { keys: 'Ctrl+U', action: 'Toggle user list' },
  { keys: 'Ctrl+\\', action: 'Toggle split view' },
  { keys: 'Ctrl+Shift+O', action: 'Oper console' },
  { keys: 'Escape', action: 'Close panel/modal' },
  { keys: 'Ctrl+L', action: 'Clear buffer' },
  { keys: 'Tab', action: 'Nick completion' },
  { keys: 'Ctrl+B/I/U', action: 'Bold / Italic / Underline' },
];

const TIMESTAMP_OPTIONS: { id: '24h' | '12h' | 'relative' | 'off'; name: string }[] = [
  { id: '24h', name: '24-hour' },
  { id: '12h', name: '12-hour' },
  { id: 'relative', name: 'Relative' },
  { id: 'off', name: 'Hidden' },
];

const FONT_OPTIONS: { id: string; name: string }[] = [
  { id: 'system', name: 'System' },
  { id: 'mono', name: 'Mono' },
  { id: 'serif', name: 'Serif' },
];

interface Props {
  open?: boolean;
  onClose: () => void;
}

export default function SettingsModal(props: Props) {
  const [tab, setTab] = createSignal<Tab>('appearance');
  const [themeFilter, setThemeFilter] = createSignal('');
  const [profileName, setProfileName] = createSignal('');
  const [exportCopied, setExportCopied] = createSignal(false);
  let contentRef: HTMLDivElement | undefined;

  createEffect(() => {
    tab();
    if (typeof contentRef?.scrollTo === 'function') {
      contentRef.scrollTo({ top: 0, behavior: 'instant' });
    } else if (contentRef) {
      contentRef.scrollTop = 0;
    }
  });

  const filteredThemes = createMemo(() => {
    const filter = themeFilter().toLowerCase();
    return filter ? THEMES.filter((t) => t.name.toLowerCase().includes(filter)) : THEMES;
  });

  const bridge = (): BridgeExt => settings.bridge as BridgeExt;
  const patchBridge = (p: Partial<BridgeExt>): void => updateBridge(p);

  const handleExport = () => {
    void navigator.clipboard.writeText(exportSettings()).then(() => {
      setExportCopied(true);
      setTimeout(() => setExportCopied(false), 2000);
    });
  };

  const handleImport = () => {
    const input = prompt('Paste exported settings JSON:');
    if (!input) return;
    if (!importSettings(input)) alert('Invalid JSON');
  };

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      width="min(1120px, calc(100vw - 1rem))"
      maxHeight="min(88dvh, 820px)"
      class="settings-modal"
    >
      <div class="settings-shell flex flex-col lg:grid lg:grid-cols-[228px_minmax(0,1fr)]" style={{ height: 'min(760px, calc(100dvh - 2rem))' }}>
        {/* Side navigation */}
        <nav class="settings-rail hidden lg:flex flex-col border-r border-white/[0.06] p-3 gap-1">
          <div class="px-2.5 pb-3 pt-1">
            <p class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-600">DarkBear</p>
            <h2 class="mt-1 text-[20px] font-black tracking-tight text-gray-50">Preferences</h2>
            <p class="mt-1 text-[11px] leading-relaxed text-gray-600">Tune the relay console without leaving the buffer.</p>
          </div>
          <For each={TABS}>
            {(t) => (
              <button onClick={() => setTab(t.id)}
                class={`settings-nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all
                  ${tab() === t.id
                    ? 'bg-[var(--custom-accent,#818cf8)]/[0.11] text-gray-100 shadow-sm ring-1 ring-[var(--custom-accent,#818cf8)]/20'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.035]'}`}>
                <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]">
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d={t.icon} />
                  </svg>
                </span>
                <span class="min-w-0">
                  <span class="block text-[12px] font-bold leading-tight">{t.label}</span>
                  <span class="mt-0.5 block truncate text-[10px] leading-tight text-gray-600">{t.desc}</span>
                </span>
              </button>
            )}
          </For>
          <div class="flex-1" />
          <div class="settings-rail-status rounded-2xl border border-white/[0.06] bg-black/20 p-3">
            <p class="text-[9px] font-black uppercase tracking-[0.16em] text-gray-600">Current</p>
            <div class="mt-2 flex items-center gap-2">
              <span class="h-2.5 w-2.5 rounded-full bg-[var(--custom-accent,#818cf8)]" />
              <span class="min-w-0 truncate text-[12px] font-semibold text-gray-300">{settings.theme}</span>
            </div>
            <div class="mt-2 grid grid-cols-2 gap-1.5 text-center">
              <MiniStat label="font" value={`${settings.fontSize}px`} />
              <MiniStat label="bridge" value={bridge().enabled ? 'on' : 'off'} hot={bridge().enabled} />
            </div>
          </div>
        </nav>

        <div class="flex min-h-0 flex-1 flex-col">
          <div class="settings-mobile-head border-b border-white/[0.06] px-3 pb-0 pt-3 lg:hidden">
            <div class="mb-2 flex items-center justify-between gap-3 px-1">
              <div class="min-w-0">
                <p class="text-[9px] font-black uppercase tracking-[0.18em] text-gray-600">DarkBear</p>
                <h2 class="text-[18px] font-black tracking-tight text-gray-50">Preferences</h2>
              </div>
              <button
                onClick={() => props.onClose()}
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.035] text-gray-500 active:bg-white/[0.08]"
                aria-label="Close preferences"
              >
                <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </div>
            <div class="flex gap-1 overflow-x-auto pb-2">
              <For each={TABS}>
                {(t) => (
                  <button onClick={() => setTab(t.id)}
                    class={`shrink-0 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-[0.08em] transition-all
                      ${tab() === t.id ? 'bg-[var(--custom-accent,#818cf8)] text-white shadow-lg shadow-black/20' : 'bg-white/[0.035] text-gray-500 active:bg-white/[0.07]'}`}>
                    {t.label}
                  </button>
                )}
              </For>
            </div>
          </div>

          <div class="hidden items-center justify-between border-b border-white/[0.06] px-5 py-4 lg:flex">
            <div>
              <p class="text-[10px] font-black uppercase tracking-[0.16em] text-gray-600">{TABS.find((t) => t.id === tab())?.desc}</p>
              <h3 class="mt-1 text-[17px] font-black tracking-tight text-gray-50">{TABS.find((t) => t.id === tab())?.label}</h3>
            </div>
            <button
              onClick={() => props.onClose()}
              class="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.035] text-gray-500 hover:text-gray-200 hover:bg-white/[0.06]"
              aria-label="Close preferences"
            >
              <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>

          {/* Content area */}
          <div ref={(el) => (contentRef = el)} class="settings-content flex-1 overflow-y-auto p-3 sm:p-4 lg:p-5 space-y-4 sm:space-y-5">
            <PreferenceOverview bridgeEnabled={bridge().enabled} />

          {/* ─── APPEARANCE ─── */}
          <Show when={tab() === 'appearance'}>
            <Section label="Theme" desc="Choose a color scheme for the interface">
              <div class="relative mb-2">
                <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
                <input type="text" value={themeFilter()} onInput={(e) => setThemeFilter(e.currentTarget.value)}
                  placeholder="Filter themes..."
                  class="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg text-gray-300 text-[12px] pl-8 pr-3 py-1.5 outline-none focus:border-[var(--custom-accent,#818cf8)]/30 transition-colors placeholder:text-gray-700" />
              </div>
              <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">
                <For each={filteredThemes()}>
                  {(t) => {
                    const active = () => settings.theme === t.id;
                    return (
                      <button onClick={() => setTheme(t.id)}
                        class="group rounded-xl overflow-hidden transition-all duration-150 text-left"
                        style={{
                          outline: active() ? `2px solid ${t.accent}` : '1px solid rgba(255,255,255,0.05)',
                          'outline-offset': active() ? '2px' : '0',
                          transform: active() ? 'scale(1.02)' : undefined,
                        }}>
                        <div class="h-[48px] relative overflow-hidden" style={{ background: t.bg }}>
                          <Show when={settings.animateThemes}>
                            <ThemeAnimation id={t.id} />
                          </Show>
                          <div class="relative z-[1] flex h-full">
                            <div class="w-[18px] border-r" style={{ 'border-color': `${t.text}10` }}>
                              <div class="mt-2.5 mx-auto w-[6px] h-[6px] rounded-full" style={{ background: t.accent, opacity: 0.8 }} />
                              <div class="mt-1 mx-auto w-[6px] h-[2px] rounded-full" style={{ background: t.text, opacity: 0.15 }} />
                              <div class="mt-0.5 mx-auto w-[6px] h-[2px] rounded-full" style={{ background: t.text, opacity: 0.1 }} />
                            </div>
                            <div class="flex-1 p-1.5 pt-2.5">
                              <div class="flex gap-0.5 mb-1">
                                <span class="h-[2px] rounded-full flex-[3]" style={{ background: t.accent, opacity: 0.5 }} />
                                <span class="h-[2px] rounded-full flex-[2]" style={{ background: t.text, opacity: 0.2 }} />
                              </div>
                              <div class="flex gap-0.5 mb-0.5">
                                <span class="h-[2px] rounded-full flex-[2]" style={{ background: t.text, opacity: 0.15 }} />
                                <span class="h-[2px] rounded-full flex-[4]" style={{ background: t.text, opacity: 0.1 }} />
                              </div>
                              <div class="flex gap-0.5">
                                <span class="h-[2px] rounded-full flex-[3]" style={{ background: t.text, opacity: 0.08 }} />
                                <span class="h-[2px] rounded-full flex-[1]" style={{ background: t.accent, opacity: 0.3 }} />
                              </div>
                            </div>
                          </div>
                          <Show when={active()}>
                            <div class="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center z-10"
                              style={{ background: t.accent }}>
                              <svg class="w-2.5 h-2.5 text-white" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M3 8l4 4 6-7" />
                              </svg>
                            </div>
                          </Show>
                        </div>
                        <div class={`px-2 py-1.5 text-[10px] font-semibold tracking-wide truncate transition-colors
                          ${active() ? 'text-gray-100' : 'text-gray-500 group-hover:text-gray-400'}`}
                          style={{ background: active() ? `${t.accent}10` : undefined }}>
                          {t.name}
                        </div>
                      </button>
                    );
                  }}
                </For>
              </div>
              <Toggle label="Animated Previews" desc="Show subtle animations in theme cards" on={settings.animateThemes} onChange={(v) => updateSettings({ animateThemes: v })} />
              <MotionControl value={settings.sceneMotion ?? 'auto'} onChange={setSceneMotion} />
            </Section>

            <Show when={settings.theme === 'custom'}>
              <Section label="Custom Colors" desc="Fine-tune every shade">
                <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  <For each={Object.keys(settings.customColors) as (keyof CustomColors)[]}>
                    {(key) => (
                      <label class="flex items-center gap-2 group cursor-pointer py-1 px-2 rounded-lg hover:bg-white/[0.02] transition-colors">
                        <input type="color" value={settings.customColors[key]}
                          onInput={(e) => setCustomColors({ [key]: e.currentTarget.value })}
                          class="w-6 h-6 rounded-md border border-white/10 cursor-pointer bg-transparent shrink-0" />
                        <span class="text-[10px] text-gray-500 font-mono group-hover:text-gray-300 transition-colors truncate">{key}</span>
                      </label>
                    )}
                  </For>
                </div>
              </Section>
            </Show>

            <Section label="Typography" desc="Font family and size">
              <div class="flex gap-1.5 mb-3">
                <For each={FONT_OPTIONS}>
                  {(f) => (
                    <Pill active={settings.fontFamily === f.id} onClick={() => updateSettings({ fontFamily: f.id })}>
                      <span class={f.id === 'mono' ? 'font-mono' : f.id === 'serif' ? 'font-serif' : ''}>{f.name}</span>
                    </Pill>
                  )}
                </For>
              </div>
              <Slider label="Font Size" value={settings.fontSize} unit="px" min={10} max={20}
                onChange={(v) => updateSettings({ fontSize: v })} />
            </Section>

            <Section label="Layout" desc="Sidebar width and visual tuning">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3">
                <Slider label="Sidebar Width" value={settings.sidebarWidth} unit="px" min={140} max={400} step={10}
                  onChange={(v) => updateSettings({ sidebarWidth: v })} />
                <Slider label="Watermark" value={settings.watermarkOpacity} unit="%" min={0} max={100}
                  onChange={(v) => updateSettings({ watermarkOpacity: v })} />
              </div>
            </Section>

            <Section label="Background Image" desc="Set a custom wallpaper behind the chat">
              <input type="text" value={settings.bgImage} placeholder="https://example.com/image.jpg"
                onInput={(e) => updateSettings({ bgImage: e.currentTarget.value })}
                class="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg text-gray-200 text-[12px] px-3 py-2 outline-none focus:border-[var(--custom-accent,#818cf8)]/30 transition-colors placeholder:text-gray-700" />
              <Show when={settings.bgImage}>
                <div class="grid grid-cols-2 gap-4 mt-2.5">
                  <Slider label="Opacity" value={settings.bgOpacity} unit="%" min={0} max={100}
                    onChange={(v) => updateSettings({ bgOpacity: v })} />
                  <Slider label="Blur" value={settings.bgBlur} unit="px" min={0} max={30}
                    onChange={(v) => updateSettings({ bgBlur: v })} />
                </div>
                <div class="flex items-end gap-4 mt-2.5">
                  <div class="flex flex-col gap-1">
                    <span class="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500">Tint</span>
                    <div class="flex items-center gap-2">
                      <input type="color" value={settings.bgTint || '#000000'}
                        onInput={(e) => updateSettings({ bgTint: e.currentTarget.value })}
                        class="w-7 h-7 rounded-md border border-white/10 cursor-pointer bg-transparent shrink-0" />
                      <Show when={settings.bgTint}>
                        <button onClick={() => updateSettings({ bgTint: '' })}
                          class="text-[10px] text-gray-600 hover:text-gray-400 transition-colors">
                          Clear
                        </button>
                      </Show>
                    </div>
                  </div>
                  <div class="flex-1">
                    <Slider label="Tint Opacity" value={settings.bgTintOpacity} unit="%" min={0} max={100}
                      onChange={(v) => updateSettings({ bgTintOpacity: v })} />
                  </div>
                </div>
              </Show>
            </Section>
          </Show>

          {/* ─── MESSAGES ─── */}
          <Show when={tab() === 'messages'}>
            <Section label="Timestamps" desc="How message times are displayed">
              <div class="flex gap-1.5 flex-wrap">
                <For each={TIMESTAMP_OPTIONS}>
                  {(o) => (
                    <Pill active={settings.timestampFormat === o.id}
                      onClick={() => updateSettings({ timestampFormat: o.id })}>
                      {o.name}
                    </Pill>
                  )}
                </For>
              </div>
            </Section>

            <Section label="Display" desc="Control what appears in the message area">
              <div class="space-y-0">
                <Toggle label="Compact Mode" desc="Reduce spacing between messages for density" on={settings.compactMode} onChange={(v) => updateSettings({ compactMode: v })} />
                <Toggle label="Inline Images" desc="Expand image links into thumbnails" on={settings.inlineImages} onChange={(v) => updateSettings({ inlineImages: v })} />
                <Toggle label="Nick Colors" desc="Assign unique colors to each nickname" on={settings.colorNicks} onChange={(v) => updateSettings({ colorNicks: v })} />
                <Toggle label="Mode Prefixes" desc="Show @/+/% symbols before nicknames" on={settings.showPrefixes} onChange={(v) => updateSettings({ showPrefixes: v })} />
                <Toggle label="Join/Part/Quit" desc="Show when users enter and leave channels" on={settings.joinPartMsgs} onChange={(v) => updateSettings({ joinPartMsgs: v })} />
                <Toggle label="Read Marker" desc="Draw a line where you last read" on={settings.readMarker} onChange={(v) => updateSettings({ readMarker: v })} />
              </div>
            </Section>

            <Section label="Sidebar" desc="Buffer list behavior">
              <Toggle label="Unread Only" desc="Hide channels with no new messages" on={settings.onlyUnread} onChange={(v) => updateSettings({ onlyUnread: v })} />
            </Section>

            <Section label="Highlight Words" desc="Get notified when these words appear">
              <input type="text" value={settings.highlightWords.join(', ')}
                onInput={(e) => updateSettings({ highlightWords: e.currentTarget.value.split(',').map((w) => w.trim()).filter(Boolean) })}
                placeholder="your-nick, keyword, ..."
                class="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg text-gray-200 text-[12px] px-3 py-2 outline-none focus:border-[var(--custom-accent,#818cf8)]/30 transition-colors placeholder:text-gray-700" />
              <p class="text-[10px] text-gray-600 mt-1">Comma-separated. Case-insensitive matching.</p>
            </Section>
          </Show>

          {/* ─── NOTIFICATIONS ─── */}
          <Show when={tab() === 'notifications'}>
            <Section label="Alerts" desc="How DarkBear gets your attention">
              <div class="space-y-0">
                <Toggle label="Desktop Notifications" desc="Show browser push notifications for highlights and mentions" on={settings.notifications} onChange={(v) => updateSettings({ notifications: v })} />
                <Toggle label="Notification Sound" desc="Play an audio chime on new activity" on={settings.notificationSound} onChange={(v) => updateSettings({ notificationSound: v })} />
                <Toggle label="Mark Read on Focus" desc="Automatically clear unread counts when the window is focused" on={settings.readOnFocus} onChange={(v) => updateSettings({ readOnFocus: v })} />
              </div>
            </Section>

            <Section label="Reconnection" desc="Network recovery behavior">
              <Toggle label="Auto Reconnect" desc="Automatically reconnect when the connection drops" on={settings.autoReconnect} onChange={(v) => updateSettings({ autoReconnect: v })} />
            </Section>
          </Show>

          {/* ─── CONNECTION ─── */}
          <Show when={tab() === 'connection'}>
            <Section label="Relay" desc="WebSocket relay connection settings">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <InputField label="Host" value={settings.relay.host} placeholder="irc.example.com"
                  onChange={(v) => updateRelay({ host: v })} />
                <InputField label="Port" value={String(settings.relay.port)} placeholder="9001" type="number"
                  onChange={(v) => updateRelay({ port: Number(v) || 9001 })} />
              </div>
              <div class="space-y-0 mt-2">
                <Toggle label="TLS" desc="Encrypt the WebSocket connection" on={settings.relay.tls} onChange={(v) => updateRelay({ tls: v })} />
                <Toggle label="Compression" desc="Enable zlib compression for the relay protocol" on={settings.relay.compression} onChange={(v) => updateRelay({ compression: v })} />
              </div>
              <div class="mt-2">
                <InputField label="Password" value={settings.relay.password} placeholder="Optional relay password" type="password"
                  onChange={(v) => updateRelay({ password: v })} />
              </div>
            </Section>

            <Section label="Profiles" desc="Save and switch between connection configurations">
              <Show when={settings.profiles.length > 0}>
                <div class="space-y-1.5 mb-3">
                  <For each={settings.profiles}>
                    {(p) => (
                      <div class="flex items-center gap-2 bg-white/[0.02] border border-white/[0.05] rounded-lg px-3 py-2">
                        <span class="text-[12px] text-gray-300 font-medium flex-1 truncate">{p.name}</span>
                        <span class="text-[10px] text-gray-600 font-mono truncate max-w-[120px]">{p.relay.host}:{p.relay.port}</span>
                        <button onClick={() => loadProfile(p.name)}
                          class="text-[10px] font-semibold text-[var(--custom-accent,#818cf8)] hover:opacity-80 transition-opacity px-1.5">
                          Load
                        </button>
                        <button onClick={() => { if (confirm(`Delete profile "${p.name}"?`)) deleteProfile(p.name); }}
                          class="text-[10px] font-semibold text-red-400 hover:text-red-300 transition-colors px-1.5">
                          Del
                        </button>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
              <div class="flex gap-2">
                <input type="text" value={profileName()} onInput={(e) => setProfileName(e.currentTarget.value)}
                  placeholder="Profile name"
                  class="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-lg text-gray-200 text-[12px] px-3 py-1.5 outline-none focus:border-[var(--custom-accent,#818cf8)]/30 transition-colors placeholder:text-gray-700" />
                <button onClick={() => { const name = profileName().trim(); if (name) { saveProfile(name); setProfileName(''); } }}
                  disabled={!profileName().trim()}
                  class="px-3 py-1.5 text-[11px] font-semibold text-[var(--custom-accent,#818cf8)] bg-[var(--custom-accent,#818cf8)]/10 border border-[var(--custom-accent,#818cf8)]/20 rounded-lg hover:bg-[var(--custom-accent,#818cf8)]/15 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                  Save Current
                </button>
              </div>
            </Section>

            <Section label="Orochi Bridge" desc="Direct session to the IRCXNet orochi server for realtime extras">
              <p class="text-[10px] text-gray-600 leading-relaxed mb-1">
                Adds realtime voice/video, typing, reactions and E2EE DMs by opening a direct
                session to the IRCXNet orochi server alongside your relay.
              </p>
              <Toggle label="Enable Bridge" desc="Open the direct orochi session when connecting" on={bridge().enabled} onChange={(v) => patchBridge({ enabled: v })} />
              <Show when={bridge().enabled}>
                <div class="mt-2 space-y-3 animate-fade-in">
                  <InputField label="WebSocket URL" value={bridge().wsUrl} placeholder="wss://node.example.com/irc (empty = auto node probing)"
                    onChange={(v) => patchBridge({ wsUrl: v })} />
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <InputField label="Account" value={bridge().account} placeholder="Account (nick)"
                      onChange={(v) => patchBridge({ account: v })} />
                    <InputField label="Password" value={bridge().password} placeholder="Account password" type="password"
                      onChange={(v) => patchBridge({ password: v })} />
                  </div>
                  <div class="space-y-0">
                    <Toggle label="Auto-join Media" desc="Automatically join a channel's voice/video room when one is live" on={bridge().autoJoinMedia} onChange={(v) => patchBridge({ autoJoinMedia: v })} />
                    <Toggle label="E2EE DMs" desc="End-to-end encrypt direct messages between DarkBear devices" on={bridge().e2eeDms ?? false} onChange={(v) => patchBridge({ e2eeDms: v })} />
                  </div>
                </div>
              </Show>
            </Section>
          </Show>

          {/* ─── ADVANCED ─── */}
          <Show when={tab() === 'advanced'}>
            <Section label="File Uploads" desc="Where DarkBear sends files you drag or paste">
              <InputField label="Upload URL" value={settings.uploadUrl} placeholder="https://your-server.com/upload"
                onChange={(v) => updateSettings({ uploadUrl: v })} />
              <p class="text-[10px] text-gray-600 mt-1">POST endpoint — file sent as multipart/form-data</p>
            </Section>

            <Section label="GIF Search" desc="Tenor API for the GIF picker">
              <InputField label="Tenor API Key" value={settings.tenorApiKey} placeholder="Paste your Tenor v2 API key"
                onChange={(v) => updateSettings({ tenorApiKey: v })} type="password" />
            </Section>

            <Section label="Custom CSS" desc="Inject your own styles into the client">
              <textarea value={settings.customCSS} onInput={(e) => updateSettings({ customCSS: e.currentTarget.value })}
                placeholder={'/* Override any DarkBear style */\n.sidebar { backdrop-filter: blur(20px); }'} rows={5} spellcheck={false}
                class="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl text-gray-200 text-[11px] font-mono px-3 py-2.5 outline-none focus:border-[var(--custom-accent,#818cf8)]/30 transition-colors placeholder:text-gray-700 resize-y leading-relaxed" />
            </Section>

            <Section label="Keyboard Shortcuts" desc="Built-in key bindings">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                <For each={SHORTCUTS}>
                  {(s) => (
                    <div class="flex items-center justify-between py-1.5">
                      <span class="text-[11px] text-gray-400">{s.action}</span>
                      <kbd class="text-[10px] font-mono text-gray-500 bg-white/[0.04] border border-white/[0.06] rounded px-1.5 py-0.5">{s.keys}</kbd>
                    </div>
                  )}
                </For>
              </div>
            </Section>

            <Section label="Data" desc="Import, export, or reset your configuration">
              <div class="flex flex-wrap gap-2">
                <button onClick={handleExport}
                  class="px-3 py-1.5 text-[11px] font-semibold text-gray-300 bg-white/[0.04] border border-white/[0.06] rounded-lg hover:bg-white/[0.07] active:scale-95 transition-all">
                  {exportCopied() ? '✓ Copied' : 'Export to Clipboard'}
                </button>
                <button onClick={handleImport}
                  class="px-3 py-1.5 text-[11px] font-semibold text-gray-300 bg-white/[0.04] border border-white/[0.06] rounded-lg hover:bg-white/[0.07] active:scale-95 transition-all">
                  Import from Clipboard
                </button>
                <button onClick={() => { if (confirm('Reset ALL settings to factory defaults? This cannot be undone.')) resetSettings(); }}
                  class="px-3 py-1.5 text-[11px] font-semibold text-red-400 bg-red-500/8 border border-red-500/15 rounded-lg hover:bg-red-500/15 active:scale-95 transition-all">
                  Reset Everything
                </button>
              </div>
            </Section>
          </Show>
        </div>
      </div>
      </div>
    </Modal>
  );
}

/* ─── Shared Components ─── */

function PreferenceOverview(props: { bridgeEnabled: boolean }) {
  return (
    <div class="settings-overview rounded-3xl border border-white/[0.07] bg-white/[0.03] p-3 sm:p-4">
      <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewTile label="Theme" value={String(settings.theme)} tone="accent" />
        <OverviewTile label="Messages" value={settings.compactMode ? 'compact' : 'comfortable'} />
        <OverviewTile label="Alerts" value={settings.notifications ? 'enabled' : 'quiet'} hot={settings.notifications} />
        <OverviewTile label="Bridge" value={props.bridgeEnabled ? 'orochi on' : 'relay only'} hot={props.bridgeEnabled} />
      </div>
      <div class="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <QuickToggle label="Compact" on={settings.compactMode} onClick={() => updateSettings({ compactMode: !settings.compactMode })} />
        <QuickToggle label="Images" on={settings.inlineImages} onClick={() => updateSettings({ inlineImages: !settings.inlineImages })} />
        <QuickToggle label="Alerts" on={settings.notifications} onClick={() => updateSettings({ notifications: !settings.notifications })} />
        <QuickToggle label="Bridge" on={props.bridgeEnabled} onClick={() => updateBridge({ enabled: !props.bridgeEnabled })} />
      </div>
    </div>
  );
}

function OverviewTile(props: { label: string; value: string; tone?: 'accent'; hot?: boolean }) {
  return (
    <div
      class="rounded-2xl border border-white/[0.055] bg-black/20 px-3 py-2.5"
      classList={{
        'border-[var(--custom-accent,#818cf8)]/20 bg-[var(--custom-accent,#818cf8)]/[0.06]': props.tone === 'accent' || props.hot,
      }}
    >
      <p class="text-[9px] font-black uppercase tracking-[0.15em] text-gray-600">{props.label}</p>
      <p class="mt-1 truncate text-[13px] font-black text-gray-100">{props.value}</p>
    </div>
  );
}

function MiniStat(props: { label: string; value: string; hot?: boolean }) {
  return (
    <div class="rounded-xl border border-white/[0.05] bg-white/[0.025] px-2 py-1.5">
      <p class="text-[9px] font-black uppercase tracking-[0.12em] text-gray-600">{props.label}</p>
      <p class="mt-0.5 truncate text-[11px] font-bold" classList={{ 'text-[var(--custom-accent,#818cf8)]': props.hot, 'text-gray-300': !props.hot }}>
        {props.value}
      </p>
    </div>
  );
}

function QuickToggle(props: { label: string; on: boolean; onClick: (e: MouseEvent) => void }) {
  return (
    <button
      onClick={(e) => props.onClick(e)}
      aria-label={`Toggle ${props.label}`}
      class="flex items-center justify-between rounded-2xl border border-white/[0.055] bg-black/15 px-3 py-2 text-left transition-all active:scale-[0.98] hover:bg-white/[0.04]"
    >
      <span class="text-[11px] font-bold text-gray-300">{props.label}</span>
      <span
        class="h-2.5 w-2.5 rounded-full"
        classList={{
          'bg-[var(--custom-accent,#818cf8)] shadow-[0_0_12px_var(--custom-accent,#818cf8)]': props.on,
          'bg-gray-700': !props.on,
        }}
      />
    </button>
  );
}

function Section(props: { label: string; desc?: string; children: JSX.Element }) {
  return (
    <section class="settings-section rounded-3xl border border-white/[0.06] bg-black/20 p-3 sm:p-4">
      <div class="mb-2">
        <h3 class="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">{props.label}</h3>
        <Show when={props.desc}>
          <p class="text-[10px] text-gray-600 mt-0.5 leading-relaxed">{props.desc}</p>
        </Show>
      </div>
      {props.children}
    </section>
  );
}

function Toggle(props: { label: string; desc: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => props.onChange(!props.on)} role="switch" aria-checked={props.on}
      class="flex items-center justify-between py-3 sm:py-2.5 group w-full text-left rounded-2xl px-3 -mx-1 hover:bg-white/[0.035] active:bg-white/[0.055] transition-colors">
      <div class="min-w-0 mr-4">
        <span class="text-[13px] sm:text-[12px] text-gray-100 font-bold block leading-tight">{props.label}</span>
        <p class="text-[11px] sm:text-[10px] text-gray-600 leading-snug mt-1">{props.desc}</p>
      </div>
      <span class={`relative w-10 h-[22px] rounded-full transition-all shrink-0
        ${props.on ? 'bg-[var(--custom-accent,#818cf8)] shadow-[0_0_8px_var(--custom-accent,#818cf8)]/25' : 'bg-white/[0.06]'}`}>
        <span class={`absolute top-[2px] left-[2px] block w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-transform duration-150
          ${props.on ? 'translate-x-[18px]' : ''}`} />
      </span>
    </button>
  );
}

/**
 * Scene-motion control — the WCAG 2.2.2 (Pause, Stop, Hide) user-operable
 * mechanism. A radiogroup (mutually-exclusive Auto/Reduced) with a programmatic
 * label; 'reduced' stops the decorative SMIL scenes even when the OS does not
 * request reduced motion. Native <button>s keep it keyboard-operable and the
 * explicit focus-visible ring uses the app accent (SC 2.4.7 / 2.4.11).
 */
function MotionControl(props: { value: 'auto' | 'reduced'; onChange: (v: 'auto' | 'reduced') => void }) {
  const options: { id: 'auto' | 'reduced'; name: string }[] = [
    { id: 'auto', name: 'Auto' },
    { id: 'reduced', name: 'Reduced' },
  ];
  return (
    <div class="flex items-center justify-between py-3 sm:py-2.5 px-3 -mx-1">
      <div class="min-w-0 mr-4">
        <span id="scene-motion-label" class="text-[13px] sm:text-[12px] text-gray-100 font-bold block leading-tight">Motion</span>
        <p class="text-[11px] sm:text-[10px] text-gray-600 leading-snug mt-1">Reduced stops animated background and mascot motion. Auto follows your system's reduced-motion setting.</p>
      </div>
      <div role="radiogroup" aria-labelledby="scene-motion-label" class="flex gap-1 shrink-0 bg-white/[0.04] rounded-xl p-1">
        <For each={options}>
          {(o) => (
            <button type="button" role="radio" aria-checked={props.value === o.id}
              onClick={() => props.onChange(o.id)}
              class={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all active:scale-[0.98]
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--custom-accent,#818cf8)] focus-visible:ring-offset-2 focus-visible:ring-offset-black
                ${props.value === o.id
                  ? 'bg-[var(--custom-accent,#818cf8)]/15 text-gray-100 ring-1 ring-[var(--custom-accent,#818cf8)]/40 shadow-sm'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]'}`}>
              {o.name}
            </button>
          )}
        </For>
      </div>
    </div>
  );
}

function Pill(props: { active: boolean; onClick: () => void; children: JSX.Element }) {
  return (
    <button onClick={() => props.onClick()}
      class={`px-3.5 py-2 rounded-xl text-[11px] font-black transition-all active:scale-[0.98]
        ${props.active
          ? 'bg-[var(--custom-accent,#818cf8)]/12 text-gray-100 ring-1 ring-[var(--custom-accent,#818cf8)]/30 shadow-sm'
          : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]'}`}>
      {props.children}
    </button>
  );
}

function Slider(props: {
  label: string; value: number; unit: string; min: number; max: number; step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div class="settings-slider">
      <div class="flex items-center justify-between mb-1">
        <span class="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500">{props.label}</span>
        <span class="text-[11px] text-gray-400 tabular-nums font-mono">{props.value}{props.unit}</span>
      </div>
      <input type="range" min={props.min} max={props.max} step={props.step} value={props.value}
        onInput={(e) => props.onChange(Number(e.currentTarget.value))}
        aria-label={props.label}
        class="w-full h-7 rounded-full cursor-pointer" style={{ 'accent-color': 'var(--custom-accent, #818cf8)' }} />
    </div>
  );
}

function InputField(props: {
  label: string; value: string; placeholder?: string; type?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label class="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500 block">
        {props.label}
        <input type={props.type ?? 'text'} value={props.value} placeholder={props.placeholder}
          onInput={(e) => props.onChange(e.currentTarget.value)}
          class="w-full mt-1.5 bg-white/[0.035] border border-white/[0.07] rounded-xl text-gray-100 text-[13px] sm:text-[12px] px-3 py-2.5 outline-none focus:border-[var(--custom-accent,#818cf8)]/35 focus:bg-white/[0.055] transition-colors placeholder:text-gray-700 normal-case tracking-normal font-normal" />
      </label>
    </div>
  );
}

/* ─── Theme card animations (inline, ported from the old file) ─── */

function ThemeAnimation(props: { id: ThemeId }) {
  // Evaluated inside JSX so theme switches stay reactive (same pattern as ThemeBg).
  return <>{themeAnimationSvg(props.id)}</>;
}

function themeAnimationSvg(id: ThemeId): JSX.Element {
  const w = 80;
  const h = 48;
  const svgClass = 'absolute inset-0 w-full h-full pointer-events-none';

  switch (id) {
    case 'starfield':
      return (
        <svg class={svgClass} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          <For each={[[10, 6], [38, 11], [60, 5], [25, 34], [50, 28], [70, 22], [15, 24], [46, 38], [65, 40], [20, 16]] as [number, number][]}>
            {([x, y], i) => (
              <circle cx={x} cy={y} r={i() % 3 === 0 ? 1.2 : 0.7} fill="#fff">
                <animate attributeName="opacity" values={`0.1;${0.5 + (i() % 3) * 0.2};0.1`} dur={`${1.5 + i() * 0.3}s`} repeatCount="indefinite" />
              </circle>
            )}
          </For>
        </svg>
      );

    case 'midnight':
      return (
        <svg class={svgClass} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          <defs>
            <radialGradient id="tm-mn-g2"><stop offset="0%" stop-color="#8b9cf8" stop-opacity="0.18" /><stop offset="100%" stop-color="#8b9cf8" stop-opacity="0" /></radialGradient>
          </defs>
          <ellipse cx={w / 2} cy={h / 2} rx="26" ry="18" fill="url(#tm-mn-g2)">
            <animate attributeName="rx" values="26;32;26" dur="4s" repeatCount="indefinite" />
          </ellipse>
        </svg>
      );

    case 'nord':
      return (
        <svg class={svgClass} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          <path d={`M0,${h * 0.3} Q${w * 0.25},${h * 0.1} ${w * 0.5},${h * 0.3} T${w},${h * 0.25} V0 H0Z`} fill="#88c0d0" opacity="0.08">
            <animate attributeName="opacity" values="0.05;0.14;0.05" dur="5s" repeatCount="indefinite" />
          </path>
        </svg>
      );

    case 'ember':
      return (
        <svg class={svgClass} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          <defs>
            <radialGradient id="tm-em-gw2" cx="50%" cy="90%" r="60%">
              <stop offset="0%" stop-color="#f97316" stop-opacity="0.18" />
              <stop offset="100%" stop-color="#f97316" stop-opacity="0" />
            </radialGradient>
          </defs>
          <rect x="0" y="0" width={w} height={h} fill="url(#tm-em-gw2)">
            <animate attributeName="opacity" values="0.5;1;0.5" dur="3s" repeatCount="indefinite" />
          </rect>
        </svg>
      );

    case 'aurora':
      return (
        <svg class={svgClass} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="tm-au-g2" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#a78bfa" stop-opacity="0.12" />
              <stop offset="100%" stop-color="#c084fc" stop-opacity="0.08" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width={w} height={h} fill="url(#tm-au-g2)" />
        </svg>
      );

    case 'dracula':
      return (
        <svg class={svgClass} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          <defs>
            <radialGradient id="tm-dr-fg2" cx="50%" cy="100%" r="70%">
              <stop offset="0%" stop-color="#bd93f9" stop-opacity="0.12" />
              <stop offset="100%" stop-color="#bd93f9" stop-opacity="0" />
            </radialGradient>
          </defs>
          <rect x="0" y="0" width={w} height={h} fill="url(#tm-dr-fg2)">
            <animate attributeName="opacity" values="0.4;0.9;0.4" dur="5s" repeatCount="indefinite" />
          </rect>
        </svg>
      );

    case 'darkbear':
      return (
        <svg class={svgClass} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          <defs>
            <radialGradient id="tm-db-gw2" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#818cf8" stop-opacity="0.12" />
              <stop offset="100%" stop-color="#818cf8" stop-opacity="0" />
            </radialGradient>
          </defs>
          <ellipse cx={w / 2} cy={h / 2} rx="18" ry="14" fill="url(#tm-db-gw2)">
            <animate attributeName="rx" values="18;24;18" dur="4s" repeatCount="indefinite" />
          </ellipse>
        </svg>
      );

    case 'retro':
      return (
        <svg class={svgClass} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          <For each={[0, 1, 2]}>
            {(i) => (
              <line x1="0" y1={12 + i * 14} x2={w} y2={12 + i * 14} stroke="#ff00ff" stroke-width="0.5" opacity="0.08">
                <animate attributeName="opacity" values="0.04;0.12;0.04" dur={`${2 + i * 0.7}s`} repeatCount="indefinite" />
              </line>
            )}
          </For>
        </svg>
      );

    case 'catppuccin':
      return (
        <svg class={svgClass} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          <defs>
            <radialGradient id="tm-ct-g2" cx="30%" cy="70%" r="50%">
              <stop offset="0%" stop-color="#cba6f7" stop-opacity="0.1" />
              <stop offset="100%" stop-color="#cba6f7" stop-opacity="0" />
            </radialGradient>
          </defs>
          <ellipse cx={w * 0.3} cy={h * 0.7} rx="20" ry="14" fill="url(#tm-ct-g2)">
            <animate attributeName="opacity" values="0.6;1;0.6" dur="3.5s" repeatCount="indefinite" />
          </ellipse>
        </svg>
      );

    case 'tokyo-night':
      return (
        <svg class={svgClass} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="tm-tn-g2" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stop-color="#7aa2f7" stop-opacity="0.08" />
              <stop offset="100%" stop-color="#bb9af7" stop-opacity="0.06" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width={w} height={h} fill="url(#tm-tn-g2)">
            <animate attributeName="opacity" values="0.5;1;0.5" dur="4s" repeatCount="indefinite" />
          </rect>
        </svg>
      );

    default:
      return null;
  }
}
