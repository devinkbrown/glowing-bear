// SettingsModal — the full settings surface, ported from the old React app.
//
// Five tabs:
//   Appearance — theme grid with animated previews (ThemeAnimation inline),
//                custom color pickers, typography (family + size), layout
//                sliders, background image (opacity / blur / tint).
//   Messages   — timestamp format, display toggles, sidebar unread filter,
//                highlight words editor.
//   Alerts     — desktop notifications, sound, read-on-focus, auto-reconnect.
//   Connection — relay settings + saved profiles manager + onyx-server bridge
//                (enabled, wsUrl override, account, password, autoJoinMedia,
//                e2eeDms + verified-only delivery policy).
//   Advanced   — upload URL, Tenor key, custom CSS, keyboard shortcut list,
//                export / import / reset settings.
//
// Usage: <SettingsModal open={uiState.activeModal === 'settings'} onClose={closeModal} />
// `open` defaults to true for conditional-mount usage.

import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import type { JSX } from 'solid-js';
import {
  deleteProfile,
  exportSettings,
  importSettings,
  loadProfile,
  connectionError,
  connectionState,
  lag,
  relayDiagnostics,
  resetSettings,
  saveProfile,
  setCustomColors,
  setSceneMotion,
  setTheme,
  settings,
  updateBridge,
  updateRelay,
  updateSettings,
  clearSavedMessages,
  removeSavedForBuffer,
  resetActivity,
  syncSavedRetention,
  forgetPreferenceSyncDevice,
  preferenceSyncState,
  syncPreferencesNow,
  createUserAction,
  deleteUserAction,
  resetOperatorIncidents,
  resetUploads,
} from '@/state';
import type { BridgeSettings, CustomColors, LocalePreference, SafeCommandId, ThemeId } from '@/state';
import Modal from '@/ui/bits/Modal';
import { clearCredentials } from '@/lib/credentials';
import { disableWebPush } from '@/lib/webPush';
import { clearDraftsAndHistory } from '@/state/drafts';
import { archiveStats, configureArchive, deleteArchiveBuffer, wipeArchive } from '@/lib/archive/client';
import type { ArchiveBufferStats, ArchiveStats } from '@/lib/archive/types';
import { bridgeState } from '@/state/bridge';
import { mediaState } from '@/state/media';
import {
  assetVersion,
  diagnosticErrorCode,
  diagnosticErrorId,
  exportSupportBundle,
  mediaRuntimeDiagnostics,
} from '@/lib/diagnostics';
import {
  quietHoursActive,
  resolvedTimeZone,
  systemTimeZone,
  untilTomorrow,
} from '@/lib/notificationPolicy';
import { MAX_USER_ACTIONS, SAFE_COMMANDS, safeCommandDefinition } from '@/lib/userActions';
import { activeLocale, formatDate, formatNumber, LOCALE_OPTIONS, t } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n';

type Tab = 'appearance' | 'messages' | 'notifications' | 'connection' | 'advanced';

type BridgeExt = BridgeSettings;

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

const TABS: { id: Tab; label: MessageKey; desc: MessageKey; icon: string }[] = [
  { id: 'appearance', label: 'settings.tabAppearance', desc: 'settings.tabAppearanceDescription', icon: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z' },
  { id: 'messages', label: 'settings.tabMessages', desc: 'settings.tabMessagesDescription', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
  { id: 'notifications', label: 'settings.tabAlerts', desc: 'settings.tabAlertsDescription', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
  { id: 'connection', label: 'settings.tabConnection', desc: 'settings.tabConnectionDescription', icon: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1' },
  { id: 'advanced', label: 'settings.tabAdvanced', desc: 'settings.tabAdvancedDescription', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
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
  { keys: 'M/D/V/S/C/H', action: 'Call controls and transcript' },
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
  const [supportCopied, setSupportCopied] = createSignal(false);
  const [archiveStatus, setArchiveStatus] = createSignal('');
  const [archiveBuffers, setArchiveBuffers] = createSignal<ArchiveBufferStats[]>([]);
  const [archiveSelectedBuffer, setArchiveSelectedBuffer] = createSignal('');
  const [userActionName, setUserActionName] = createSignal('');
  const [userActionCommand, setUserActionCommand] = createSignal<SafeCommandId>('join');
  const [userActionScope, setUserActionScope] = createSignal('global');
  let contentRef: HTMLDivElement | undefined;
  let exportCopiedTimer: ReturnType<typeof setTimeout> | undefined;
  let supportCopiedTimer: ReturnType<typeof setTimeout> | undefined;

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
  const relayErrorId = () => diagnosticErrorId('relay', diagnosticErrorCode(connectionError()));
  const bridgeErrorId = () => diagnosticErrorId('bridge', diagnosticErrorCode(bridgeState.error));
  const mediaErrorId = () => diagnosticErrorId('media', diagnosticErrorCode(mediaState.error));
  const relayPhaseDetail = () => {
    const d = relayDiagnostics();
    if (d.reconnectReason === 'none') return `${Math.round(lag())} ms`;
    const delay = d.reconnectDelayMs > 0 ? ` · ${Math.round(d.reconnectDelayMs / 1000)}s` : '';
    return `${d.reconnectReason} · attempt ${d.reconnectAttempt}${delay}`;
  };
  const protocolDetail = () => {
    const d = relayDiagnostics();
    const hash = d.hashAlgorithm === 'none' ? d.handshake : d.hashAlgorithm;
    return `${hash} · ${d.compression}`;
  };
  const preferenceSyncTime = () => preferenceSyncState.lastSyncedAt
    ? formatDate(preferenceSyncState.lastSyncedAt, { hour: '2-digit', minute: '2-digit' })
    : 'not synced';
  const dndStatus = () => {
    const now = Date.now();
    if (settings.notificationsSnoozedUntil > now) {
      return `Paused until ${formatDate(settings.notificationsSnoozedUntil, {
        weekday: 'short', hour: '2-digit', minute: '2-digit',
      })}`;
    }
    if (quietHoursActive({
      enabled: settings.quietHoursEnabled,
      start: settings.quietHoursStart,
      end: settings.quietHoursEnd,
      timeZone: settings.quietHoursTimezone,
    }, new Date(now))) return 'Scheduled quiet hours are active now';
    return settings.notifications ? 'Alerts are active' : 'Desktop alerts are disabled';
  };

  onCleanup(() => {
    if (exportCopiedTimer) clearTimeout(exportCopiedTimer);
    if (supportCopiedTimer) clearTimeout(supportCopiedTimer);
  });

  const handleExport = () => {
    void navigator.clipboard.writeText(exportSettings()).then(() => {
      setExportCopied(true);
      if (exportCopiedTimer) clearTimeout(exportCopiedTimer);
      exportCopiedTimer = setTimeout(() => {
        exportCopiedTimer = undefined;
        setExportCopied(false);
      }, 2000);
    });
  };

  const handleImport = () => {
    const input = prompt('Paste redacted settings export JSON:');
    if (!input) return;
    if (!importSettings(input)) alert('Invalid JSON');
  };

  const handleSupportExport = () => {
    void navigator.clipboard.writeText(exportSupportBundle()).then(() => {
      setSupportCopied(true);
      if (supportCopiedTimer) clearTimeout(supportCopiedTimer);
      supportCopiedTimer = setTimeout(() => {
        supportCopiedTimer = undefined;
        setSupportCopied(false);
      }, 2000);
    });
  };

  const handleForgetDevice = async () => {
    const confirmed = confirm(
      'Forget this device? This clears saved profiles and settings, relay and bridge passwords, session tokens, drafts and input history, and the local push subscription.',
    );
    if (!confirmed) return;
    await disableWebPush(null);
    await wipeArchive().catch(() => undefined);
    clearCredentials();
    clearDraftsAndHistory();
    resetActivity();
    resetOperatorIncidents();
    resetUploads();
    resetSettings();
    forgetPreferenceSyncDevice();
  };

  const archivePolicy = () => ({
    retention: settings.archiveRetention,
    maxMiB: settings.archiveMaxMiB,
  });

  const applyArchiveStats = (stats: ArchiveStats) => {
    setArchiveBuffers(stats.buffers);
    setArchiveSelectedBuffer((current) =>
      stats.buffers.some((buffer) => buffer.bufferKey === current)
        ? current
        : (stats.buffers[0]?.bufferKey ?? ''),
    );
    setArchiveStatus(`${formatNumber(stats.messages)} messages · ${formatNumber(stats.bytes / 1024 / 1024, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MiB`);
  };

  const refreshArchiveStats = async () => {
    applyArchiveStats(await archiveStats());
  };

  const handleArchiveRetention = (retention: typeof settings.archiveRetention) => {
    updateSettings({ archiveRetention: retention });
    syncSavedRetention(retention);
    setArchiveStatus(retention === 'off' ? 'Wiping local transcript…' : 'Applying retention…');
    void configureArchive({ ...archivePolicy(), retention })
      .then(async () => {
        await refreshArchiveStats();
      })
      .catch(() => setArchiveStatus('Archive unavailable in this browser'));
  };

  const handleWipeArchive = () => {
    if (!confirm('Delete all locally archived message history from this device?')) return;
    setArchiveStatus('Wiping local transcript…');
    void wipeArchive()
      .then(() => {
        clearSavedMessages();
        setArchiveBuffers([]);
        setArchiveSelectedBuffer('');
        setArchiveStatus('Local transcript deleted');
      })
      .catch(() => setArchiveStatus('Archive unavailable in this browser'));
  };

  const handleDeleteArchiveBuffer = () => {
    const bufferKey = archiveSelectedBuffer();
    const buffer = archiveBuffers().find((candidate) => candidate.bufferKey === bufferKey);
    if (!buffer || !confirm(`Delete locally archived history for ${buffer.bufferName}?`)) return;
    setArchiveStatus(`Deleting ${buffer.bufferName}…`);
    void deleteArchiveBuffer(bufferKey)
      .then(async () => {
        removeSavedForBuffer(bufferKey);
        await refreshArchiveStats();
      })
      .catch(() => setArchiveStatus('Archive unavailable in this browser'));
  };

  createEffect(() => {
    if (tab() !== 'advanced' || settings.archiveRetention === 'off') return;
    void refreshArchiveStats().catch(() => setArchiveStatus('Archive unavailable in this browser'));
  });

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
            <h2 class="mt-1 text-[20px] font-black tracking-tight text-gray-50">{t('settings.preferences')}</h2>
            <p class="mt-1 text-[11px] leading-relaxed text-gray-600">{t('settings.description')}</p>
          </div>
          <For each={TABS}>
            {(tabOption) => (
              <button onClick={() => setTab(tabOption.id)}
                class={`settings-nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all
                  ${tab() === tabOption.id
                    ? 'bg-[var(--custom-accent,#818cf8)]/[0.11] text-gray-100 shadow-sm ring-1 ring-[var(--custom-accent,#818cf8)]/20'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.035]'}`}>
                <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]">
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d={tabOption.icon} />
                  </svg>
                </span>
                <span class="min-w-0">
                  <span class="block text-[12px] font-bold leading-tight">{t(tabOption.label)}</span>
                  <span class="mt-0.5 block truncate text-[10px] leading-tight text-gray-600">{t(tabOption.desc)}</span>
                </span>
              </button>
            )}
          </For>
          <div class="flex-1" />
          <div class="settings-rail-status rounded-2xl border border-white/[0.06] bg-black/20 p-3">
            <p class="text-[9px] font-black uppercase tracking-[0.16em] text-gray-600">{t('settings.current')}</p>
            <div class="mt-2 flex items-center gap-2">
              <span class="h-2.5 w-2.5 rounded-full bg-[var(--custom-accent,#818cf8)]" />
              <span class="min-w-0 truncate text-[12px] font-semibold text-gray-300">{settings.theme}</span>
            </div>
            <div class="mt-2 grid grid-cols-2 gap-1.5 text-center">
              <MiniStat label={t('settings.font')} value={`${settings.fontSize}px`} />
              <MiniStat label={t('settings.bridge')} value={bridge().enabled ? t('settings.on') : t('settings.off')} hot={bridge().enabled} />
            </div>
          </div>
        </nav>

        <div class="flex min-h-0 flex-1 flex-col">
          <div class="settings-mobile-head border-b border-white/[0.06] px-3 pb-0 pt-3 lg:hidden">
            <div class="mb-2 flex items-center justify-between gap-3 px-1">
              <div class="min-w-0">
                <p class="text-[9px] font-black uppercase tracking-[0.18em] text-gray-600">DarkBear</p>
                <h2 class="text-[18px] font-black tracking-tight text-gray-50">{t('settings.preferences')}</h2>
              </div>
              <button
                onClick={() => props.onClose()}
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.035] text-gray-500 active:bg-white/[0.08]"
                aria-label={t('settings.close')}
              >
                <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </div>
            <div class="flex gap-1 overflow-x-auto pb-2">
              <For each={TABS}>
                {(tabOption) => (
                  <button onClick={() => setTab(tabOption.id)}
                    class={`shrink-0 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-[0.08em] transition-all
                      ${tab() === tabOption.id ? 'bg-[var(--custom-accent,#818cf8)] text-white shadow-lg shadow-black/20' : 'bg-white/[0.035] text-gray-500 active:bg-white/[0.07]'}`}>
                    {t(tabOption.label)}
                  </button>
                )}
              </For>
            </div>
          </div>

          <div class="hidden items-center justify-between border-b border-white/[0.06] px-5 py-4 lg:flex">
            <div>
              <p class="text-[10px] font-black uppercase tracking-[0.16em] text-gray-600">
                {t(TABS.find((tabOption) => tabOption.id === tab())?.desc ?? 'settings.tabAppearanceDescription')}
              </p>
              <h3 class="mt-1 text-[17px] font-black tracking-tight text-gray-50">
                {t(TABS.find((tabOption) => tabOption.id === tab())?.label ?? 'settings.tabAppearance')}
              </h3>
            </div>
            <button
              onClick={() => props.onClose()}
              class="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.035] text-gray-500 hover:text-gray-200 hover:bg-white/[0.06]"
              aria-label={t('settings.close')}
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
            <Section label={t('locale.languageRegion')} desc={t('locale.languageRegionDescription')}>
              <label class="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500">
                {t('locale.language')}
                <select
                  data-testid="locale-select"
                  aria-label={t('locale.language')}
                  value={settings.locale}
                  onChange={(event) => updateSettings({ locale: event.currentTarget.value as LocalePreference })}
                  class="mt-1.5 w-full rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2.5 text-[12px] font-normal normal-case tracking-normal text-gray-100 outline-none focus:border-[var(--custom-accent,#818cf8)]/35"
                >
                  <For each={LOCALE_OPTIONS}>
                    {(option) => <option value={option.value}>{t(option.label)}</option>}
                  </For>
                </select>
              </label>
              <p class="mt-2 text-[10px] leading-relaxed text-gray-600">
                {t('locale.current', { locale: activeLocale() })}
              </p>
            </Section>

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
                <Toggle label="Inline Images" desc="Opt in to fetching remote image thumbnails" on={settings.inlineImages} onChange={(v) => updateSettings({ inlineImages: v })} />
                <Toggle label="Nick Colors" desc="Assign unique colors to each nickname" on={settings.colorNicks} onChange={(v) => updateSettings({ colorNicks: v })} />
                <Toggle label={t('settings.modePrefixes')} desc={t('settings.modePrefixesDesc')} on={settings.showPrefixes} onChange={(v) => updateSettings({ showPrefixes: v })} />
                <Toggle label="Join/Part/Quit" desc="Show when users enter and leave channels" on={settings.joinPartMsgs} onChange={(v) => updateSettings({ joinPartMsgs: v })} />
                <Toggle label={t('settings.readMarker')} desc={t('settings.readMarkerDesc')} on={settings.readMarker} onChange={(v) => updateSettings({ readMarker: v })} />
              </div>
            </Section>

            <Section label="Sidebar" desc="Buffer list behavior">
              <Toggle label="Unread Only" desc="Hide channels with no new messages" on={settings.onlyUnread} onChange={(v) => updateSettings({ onlyUnread: v })} />
            </Section>

            <Section label="Call Captions" desc="Readable live caption presentation">
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label class="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500">
                  Caption size
                  <select aria-label="Default caption size" value={settings.captionSize}
                    onChange={(event) => updateSettings({ captionSize: event.currentTarget.value as typeof settings.captionSize })}
                    class="mt-1.5 w-full rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2.5 text-[12px] font-normal normal-case tracking-normal text-gray-100 outline-none focus:border-[var(--custom-accent,#818cf8)]/35">
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                  </select>
                </label>
                <label class="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500">
                  Caption background
                  <select aria-label="Default caption background" value={settings.captionBackground}
                    onChange={(event) => updateSettings({ captionBackground: event.currentTarget.value as typeof settings.captionBackground })}
                    class="mt-1.5 w-full rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2.5 text-[12px] font-normal normal-case tracking-normal text-gray-100 outline-none focus:border-[var(--custom-accent,#818cf8)]/35">
                    <option value="solid">High contrast</option>
                    <option value="translucent">Translucent</option>
                  </select>
                </label>
              </div>
              <p class="mt-2 text-[10px] leading-relaxed text-gray-600">Caption presentation stays on this device. Caption persistence follows the Local Archive setting, which is off by default.</p>
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
                <Toggle label="Desktop Notifications" desc="Show permitted browser and Web Push notifications" on={settings.notifications} onChange={(v) => updateSettings({ notifications: v })} />
                <Toggle label="Notification Sound" desc="Play an audio chime on new activity" on={settings.notificationSound} onChange={(v) => updateSettings({ notificationSound: v })} />
                <Toggle label="Mark Read on Focus" desc="Automatically clear unread counts when the window is focused" on={settings.readOnFocus} onChange={(v) => updateSettings({ readOnFocus: v })} />
              </div>
            </Section>

            <Section label="Do Not Disturb" desc="Pause alerts now or follow a device-local schedule">
              <div class="space-y-3" data-testid="notification-dnd">
                <div role="status" aria-live="polite" class="rounded-2xl border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-[11px] font-semibold text-gray-300">
                  {dndStatus()}
                </div>
                <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <For each={[
                    { label: 'Pause 1 hour', until: () => Date.now() + 60 * 60 * 1000 },
                    { label: 'Pause 8 hours', until: () => Date.now() + 8 * 60 * 60 * 1000 },
                    { label: 'Until tomorrow', until: () => untilTomorrow() },
                  ]}>
                    {(option) => (
                      <button type="button" onClick={() => updateSettings({ notificationsSnoozedUntil: option.until() })}
                        class="rounded-xl border border-white/[0.07] bg-white/[0.03] px-2 py-2 text-[10px] font-bold text-gray-300 transition-colors hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-[var(--custom-accent,#818cf8)]">
                        {option.label}
                      </button>
                    )}
                  </For>
                  <button type="button" onClick={() => updateSettings({ notificationsSnoozedUntil: 0 })}
                    disabled={settings.notificationsSnoozedUntil <= Date.now()}
                    class="rounded-xl border border-white/[0.07] bg-white/[0.03] px-2 py-2 text-[10px] font-bold text-gray-300 transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-35 focus-visible:ring-2 focus-visible:ring-[var(--custom-accent,#818cf8)]">
                    Resume alerts
                  </button>
                </div>
                <div class="border-t border-white/[0.05] pt-1">
                  <Toggle label="Scheduled quiet hours" desc="Silence foreground and closed-tab push alerts during this window" on={settings.quietHoursEnabled} onChange={(v) => updateSettings({ quietHoursEnabled: v })} />
                </div>
                <Show when={settings.quietHoursEnabled}>
                  <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <InputField label="Quiet starts" type="time" value={settings.quietHoursStart}
                      onChange={(v) => updateSettings({ quietHoursStart: v })} />
                    <InputField label="Quiet ends" type="time" value={settings.quietHoursEnd}
                      onChange={(v) => updateSettings({ quietHoursEnd: v })} />
                    <InputField label="Time zone" value={settings.quietHoursTimezone}
                      placeholder={systemTimeZone()}
                      onChange={(v) => updateSettings({ quietHoursTimezone: v.trim() || 'system' })} />
                  </div>
                  <p class="text-[10px] leading-relaxed text-gray-600">
                    Use <span class="font-mono text-gray-500">system</span> to follow this browser ({systemTimeZone()}), or an IANA zone such as <span class="font-mono text-gray-500">Europe/Berlin</span>. Current policy zone: {resolvedTimeZone(settings.quietHoursTimezone)}.
                  </p>
                </Show>
                <p class="text-[10px] leading-relaxed text-gray-600">Schedules and temporary pauses stay on this device. Per-buffer all/mentions/mute tiers remain unchanged.</p>
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
                <Toggle label="Remember Relay Password" desc="Persist across browser restarts on this device" on={settings.rememberRelayPassword}
                  onChange={(v) => updateSettings({ rememberRelayPassword: v })} />
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

            <Section label={t('settings.extras')} desc={t('settings.extrasDesc')}>
              <p class="text-[10px] text-gray-600 leading-relaxed mb-1">
                {t('settings.bridgeBlurb')}
              </p>
              <Toggle label={t('settings.enableExtras')} desc={t('settings.enableExtrasDesc')} on={bridge().enabled} onChange={(v) => patchBridge({ enabled: v })} />
              <Show when={bridge().enabled}>
                <div class="mt-2 space-y-3 animate-fade-in">
                  <InputField label={t('settings.wsUrl')} value={bridge().wsUrl} placeholder="wss://node.example.com/irc"
                    onChange={(v) => patchBridge({ wsUrl: v })} />
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <InputField label={t('connect.account')} value={bridge().account} placeholder={t('connect.accountNick')}
                      onChange={(v) => patchBridge({ account: v })} />
                    <InputField label={t('connect.password')} value={bridge().password} placeholder={t('connect.accountPassword')} type="password"
                      onChange={(v) => patchBridge({ password: v })} />
                  </div>
                  <div class="space-y-0">
                    <Toggle label={t('connect.rememberBridge')} desc={t('connect.sessionOnly')} on={settings.rememberBridgePassword}
                      onChange={(v) => updateSettings({ rememberBridgePassword: v })} />
                    <Toggle label={t('settings.autoJoinMedia')} desc={t('settings.autoJoinMediaDesc')} on={bridge().autoJoinMedia} onChange={(v) => patchBridge({ autoJoinMedia: v })} />
                    <Toggle label={t('settings.e2eeDms')} desc={t('settings.e2eeDmsDesc')} on={bridge().e2eeDms} onChange={(v) => patchBridge({ e2eeDms: v })} />
                    <Show when={bridge().e2eeDms}>
                      <label class="mt-2 block rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2.5">
                        <span class="block text-[12px] font-semibold text-gray-300">{t('settings.e2eePolicy')}</span>
                        <span class="mb-2 block text-[10px] leading-relaxed text-gray-600">
                          {t('settings.e2eePolicyDesc')}
                        </span>
                        <select
                          aria-label={t('settings.e2eePolicy')}
                          value={bridge().e2eePolicy}
                          onChange={(event) => patchBridge({
                            e2eePolicy: event.currentTarget.value === 'verified' ? 'verified' : 'opportunistic',
                          })}
                          class="w-full rounded-lg border border-white/[0.08] bg-gray-950 px-3 py-2 text-[12px] text-gray-200 outline-none focus:border-[var(--custom-accent,#818cf8)]/40"
                        >
                          <option value="opportunistic">{t('settings.e2eeOpportunistic')}</option>
                          <option value="verified">{t('settings.e2eeVerified')}</option>
                        </select>
                      </label>
                    </Show>
                  </div>
                </div>
              </Show>
            </Section>

            <Section label="Cross-device preferences" desc="Account-scoped sync when Onyx Server metadata is available">
              <div data-testid="preference-sync-status" class="rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-3">
                <div class="flex items-center gap-3">
                  <span
                    class={`h-2.5 w-2.5 shrink-0 rounded-full ${
                      preferenceSyncState.status === 'synced'
                        ? 'bg-emerald-400'
                        : preferenceSyncState.status === 'error'
                          ? 'bg-red-400'
                          : preferenceSyncState.available
                            ? 'bg-amber-400'
                            : 'bg-gray-600'
                    }`}
                    aria-hidden="true"
                  />
                  <div class="min-w-0 flex-1">
                    <p class="text-[12px] font-semibold capitalize text-gray-200">
                      {preferenceSyncState.status.replace('-', ' ')}
                    </p>
                    <p class="mt-0.5 text-[10px] leading-relaxed text-gray-600">
                      {preferenceSyncState.detail} · {preferenceSyncTime()}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Sync preferences now"
                    disabled={!preferenceSyncState.available || preferenceSyncState.status === 'checking'}
                    onClick={() => syncPreferencesNow()}
                    class="shrink-0 rounded-lg border border-[var(--custom-accent,#818cf8)]/20 bg-[var(--custom-accent,#818cf8)]/10 px-3 py-1.5 text-[11px] font-semibold text-[var(--custom-accent,#818cf8)] transition-all hover:bg-[var(--custom-accent,#818cf8)]/15 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Sync now
                  </button>
                </div>
              </div>
              <p class="mt-2 text-[10px] leading-relaxed text-gray-600">
                Syncs theme, font and motion accessibility, alert controls, per-buffer notification tiers, pins, mutes, and read positions. Passwords, endpoints, custom CSS, local archives, and media devices stay on this browser. Export/import remains the fallback without the capability.
              </p>
            </Section>
          </Show>

          {/* ─── ADVANCED ─── */}
          <Show when={tab() === 'advanced'}>
            <Section label="Command Palette Actions" desc="Named allowlisted IRC actions with generated argument prompts">
              <div class="space-y-3" data-testid="user-action-settings">
                <Show when={settings.userActions.length > 0}>
                  <div class="space-y-2">
                    <For each={settings.userActions}>
                      {(action) => (
                        <div class="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2.5">
                          <span class="min-w-0 flex-1">
                            <span class="block truncate text-[12px] font-bold text-gray-200">{action.name}</span>
                            <code class="mt-0.5 block truncate text-[10px] text-gray-600">{safeCommandDefinition(action.commandId).template}</code>
                          </span>
                          <span class="max-w-[110px] truncate text-[9px] font-bold uppercase tracking-[0.08em] text-gray-600">
                            {action.scope === 'global' ? 'all profiles' : action.scope.slice('profile:'.length)}
                          </span>
                          <button type="button" aria-label={`Delete action ${action.name}`} onClick={() => deleteUserAction(action.id)}
                            class="rounded-lg px-2 py-1 text-[10px] font-bold text-red-400 hover:bg-red-500/10 hover:text-red-300">
                            Delete
                          </button>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>

                <div class="grid gap-3 sm:grid-cols-3">
                  <InputField label="Action name" value={userActionName()} placeholder="Whois teammate"
                    onChange={setUserActionName} />
                  <label class="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500">
                    Safe command
                    <select aria-label="Safe command" value={userActionCommand()}
                      onChange={(event) => setUserActionCommand(event.currentTarget.value as SafeCommandId)}
                      class="mt-1.5 w-full rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2.5 text-[12px] font-normal normal-case tracking-normal text-gray-100 outline-none focus:border-[var(--custom-accent,#818cf8)]/35">
                      <For each={SAFE_COMMANDS}>{(command) => <option value={command.id}>{command.label}</option>}</For>
                    </select>
                  </label>
                  <label class="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500">
                    Profile scope
                    <select aria-label="Action profile scope" value={userActionScope()}
                      onChange={(event) => setUserActionScope(event.currentTarget.value)}
                      class="mt-1.5 w-full rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2.5 text-[12px] font-normal normal-case tracking-normal text-gray-100 outline-none focus:border-[var(--custom-accent,#818cf8)]/35">
                      <option value="global">All profiles</option>
                      <For each={settings.profiles}>{(profile) => <option value={`profile:${profile.name}`}>{profile.name}</option>}</For>
                    </select>
                  </label>
                </div>
                <div class="flex flex-col gap-2 rounded-xl border border-white/[0.05] bg-black/15 px-3 py-2.5 sm:flex-row sm:items-center">
                  <span class="min-w-0 flex-1">
                    <code class="block truncate text-[11px] text-gray-300">{safeCommandDefinition(userActionCommand()).template}</code>
                    <span class="mt-0.5 block text-[10px] text-gray-600">{safeCommandDefinition(userActionCommand()).description}</span>
                  </span>
                  <button type="button"
                    disabled={!userActionName().trim() || settings.userActions.length >= MAX_USER_ACTIONS}
                    onClick={() => {
                      const added = createUserAction(userActionName(), userActionCommand(), userActionScope());
                      if (added) setUserActionName('');
                    }}
                    class="shrink-0 rounded-xl bg-[var(--custom-accent,#818cf8)]/15 px-4 py-2 text-[11px] font-black text-[var(--custom-accent,#818cf8)] hover:bg-[var(--custom-accent,#818cf8)]/20 disabled:cursor-not-allowed disabled:opacity-35">
                    Add action
                  </button>
                </div>
                <p class="text-[10px] leading-relaxed text-gray-600">Up to {MAX_USER_ACTIONS} local actions. Arguments are requested at run time, the exact IRC command is shown before first use, and expansion is capped. Raw commands, JavaScript, and shell execution are unavailable.</p>
              </div>
            </Section>

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

            <Section label="Local Archive" desc="Optional IndexedDB transcript; indexing and full-history search run in a Web Worker">
              <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px] sm:items-end">
                <label class="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500">
                  Retention
                  <select
                    aria-label="Archive retention"
                    value={settings.archiveRetention}
                    onChange={(event) => handleArchiveRetention(event.currentTarget.value as typeof settings.archiveRetention)}
                    class="mt-1.5 w-full rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2.5 text-[12px] font-normal normal-case tracking-normal text-gray-100 outline-none focus:border-[var(--custom-accent,#818cf8)]/35"
                  >
                    <option value="off">Off — store no transcript</option>
                    <option value="7d">Keep 7 days</option>
                    <option value="30d">Keep 30 days</option>
                    <option value="custom">Custom size limit</option>
                  </select>
                </label>
                <Show when={settings.archiveRetention === 'custom'}>
                  <InputField label="Maximum MiB" type="number" value={String(settings.archiveMaxMiB)}
                    onChange={(value) => updateSettings({ archiveMaxMiB: Math.max(10, Math.min(2048, Number(value) || 100)) })} />
                </Show>
              </div>
              <p class="mt-2 text-[10px] leading-relaxed text-gray-600">
                Off is the default. Enabling this stores message text, sender, buffer, time, msgid, and reply parent only on this device. Passwords, tokens, endpoints, and E2EE keys are never part of the archive.
              </p>
              <Show when={archiveBuffers().length > 0}>
                <div class="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <label class="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500">
                    Archived buffer
                    <select aria-label="Archived buffer" value={archiveSelectedBuffer()}
                      onChange={(event) => setArchiveSelectedBuffer(event.currentTarget.value)}
                      class="mt-1.5 w-full rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2 text-[11px] font-normal normal-case tracking-normal text-gray-100 outline-none focus:border-[var(--custom-accent,#818cf8)]/35">
                      <For each={archiveBuffers()}>{(buffer) => (
                        <option value={buffer.bufferKey}>{buffer.bufferName} · {formatNumber(buffer.messages)}</option>
                      )}</For>
                    </select>
                  </label>
                  <button onClick={handleDeleteArchiveBuffer}
                    class="rounded-lg border border-red-500/15 bg-red-500/5 px-3 py-2 text-[11px] font-semibold text-red-300 hover:bg-red-500/12 active:scale-95">
                    Delete Buffer History
                  </button>
                </div>
              </Show>
              <div class="mt-3 flex items-center justify-between gap-3">
                <span class="min-w-0 truncate text-[10px] text-gray-600">{archiveStatus() || 'No archive status requested'}</span>
                <button onClick={handleWipeArchive}
                  class="shrink-0 rounded-lg border border-red-500/20 bg-red-500/8 px-3 py-1.5 text-[11px] font-semibold text-red-300 hover:bg-red-500/15 active:scale-95">
                  Delete Local History
                </button>
              </div>
            </Section>

            <Section label="Diagnostics" desc="Connection and runtime health without message or credential data">
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <DiagnosticValue label="Relay" value={connectionState()} detail={connectionError() ? relayErrorId() : (relayDiagnostics().serverVersion || 'not connected')} />
                <DiagnosticValue label="Phase" value={relayDiagnostics().phase} detail={relayPhaseDetail()} />
                <DiagnosticValue label="Protocol" value={relayDiagnostics().protocolMode} detail={protocolDetail()} />
                <DiagnosticValue label="Onyx" value={bridgeState.status} detail={bridgeState.error ? bridgeErrorId() : (bridgeState.e2eeReady ? 'device key published' : 'DM encryption idle')} />
                <DiagnosticValue label="Onyx Server Media" value={mediaState.mediaAvailable ? mediaState.callState : 'unavailable'} detail={mediaState.error ? mediaErrorId() : `${mediaState.health.status} · ${Object.keys(mediaState.peers).length} peers`} />
                <DiagnosticValue label="Codec Runtime" value={mediaRuntimeDiagnostics().webAssembly && mediaRuntimeDiagnostics().mediaDevices ? 'capable' : 'limited'} detail={`${mediaRuntimeDiagnostics().audioWorklet ? 'audio worklet' : 'audio fallback'} · ${mediaRuntimeDiagnostics().videoWorker ? 'video worker' : 'video fallback'}`} />
                <DiagnosticValue label="Service Worker" value={typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? (navigator.serviceWorker.controller ? 'controlled' : 'uncontrolled') : 'unsupported'} detail="deploy shell" />
                <DiagnosticValue label="Auth" value={relayDiagnostics().authMode} detail={relayDiagnostics().totp ? 'TOTP available' : relayDiagnostics().handshake} />
              </div>
              <div class="mt-2 flex items-center justify-between gap-3 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2">
                <span class="min-w-0 truncate font-mono text-[10px] text-gray-600">{assetVersion() || 'development build'}</span>
                <button onClick={handleSupportExport}
                  class="shrink-0 px-3 py-1.5 text-[11px] font-semibold text-gray-300 bg-white/[0.04] border border-white/[0.06] rounded-lg hover:bg-white/[0.07] active:scale-95 transition-all">
                  {supportCopied() ? 'Copied' : 'Copy Support Bundle'}
                </button>
              </div>
            </Section>

            <Section label="Data" desc="Copy portable preferences without passwords, API keys, or URL credentials and query data">
              <div class="flex flex-wrap gap-2">
                <button onClick={handleExport}
                  class="px-3 py-1.5 text-[11px] font-semibold text-gray-300 bg-white/[0.04] border border-white/[0.06] rounded-lg hover:bg-white/[0.07] active:scale-95 transition-all">
                  {exportCopied() ? '✓ Copied' : 'Copy Redacted Settings'}
                </button>
                <button onClick={handleImport}
                  class="px-3 py-1.5 text-[11px] font-semibold text-gray-300 bg-white/[0.04] border border-white/[0.06] rounded-lg hover:bg-white/[0.07] active:scale-95 transition-all">
                  Import Redacted Settings
                </button>
                <button onClick={() => { if (confirm('Reset ALL settings to factory defaults? This cannot be undone.')) resetSettings(); }}
                  class="px-3 py-1.5 text-[11px] font-semibold text-red-400 bg-red-500/8 border border-red-500/15 rounded-lg hover:bg-red-500/15 active:scale-95 transition-all">
                  Reset Everything
                </button>
                <button onClick={() => { void handleForgetDevice(); }}
                  class="px-3 py-1.5 text-[11px] font-semibold text-red-300 bg-red-500/12 border border-red-500/25 rounded-lg hover:bg-red-500/20 active:scale-95 transition-all">
                  Forget This Device
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

function DiagnosticValue(props: { label: string; value: string; detail: string }) {
  return (
    <div class="min-w-0 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2">
      <span class="block text-[9px] font-bold uppercase text-gray-600">{props.label}</span>
      <span class="mt-0.5 block truncate text-[12px] font-semibold text-gray-300">{props.value}</span>
      <span class="block truncate text-[9px] text-gray-700">{props.detail}</span>
    </div>
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
        <OverviewTile label="Onyx" value={props.bridgeEnabled ? 'extras on' : 'relay only'} hot={props.bridgeEnabled} />
      </div>
      <div class="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <QuickToggle label="Compact" on={settings.compactMode} onClick={() => updateSettings({ compactMode: !settings.compactMode })} />
        <QuickToggle label="Images" on={settings.inlineImages} onClick={() => updateSettings({ inlineImages: !settings.inlineImages })} />
        <QuickToggle label="Alerts" on={settings.notifications} onClick={() => updateSettings({ notifications: !settings.notifications })} />
        <QuickToggle label="Onyx" on={props.bridgeEnabled} onClick={() => updateBridge({ enabled: !props.bridgeEnabled })} />
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
