'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '@/stores';
import type { ThemeName, CustomThemeColors } from '@/types';
import { DEFAULT_SETTINGS } from '@/types';
import Modal from '@/components/ui/Modal';

type Tab = 'appearance' | 'messages' | 'notifications' | 'connection' | 'advanced';

const THEMES: { id: ThemeName; name: string; accent: string; bg: string; text: string }[] = [
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

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'appearance', label: 'Appearance', icon: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z' },
  { id: 'messages', label: 'Messages', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
  { id: 'notifications', label: 'Alerts', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
  { id: 'connection', label: 'Connection', icon: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1' },
  { id: 'advanced', label: 'Advanced', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
];

const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'Alt+↑/↓', action: 'Switch buffers' },
  { keys: 'Alt+A', action: 'Jump to activity' },
  { keys: 'Ctrl+K', action: 'Buffer switcher' },
  { keys: 'Ctrl+/', action: 'Toggle user list' },
  { keys: 'Escape', action: 'Close panel/modal' },
  { keys: 'Ctrl+L', action: 'Clear buffer' },
  { keys: 'Tab', action: 'Nick completion' },
  { keys: 'Ctrl+B/I/U', action: 'Bold / Italic / Underline' },
];

interface Props {
  onClose: () => void;
}

export default function SettingsModal({ onClose }: Props) {
  const settings = useStore(s => s.settings);
  const updateSettings = useStore(s => s.updateSettings);
  const updateRelay = useStore(s => s.updateRelay);
  const setTheme = useStore(s => s.setTheme);
  const setCustomColors = useStore(s => s.setCustomColors);
  const saveProfile = useStore(s => s.saveProfile);
  const deleteProfile = useStore(s => s.deleteProfile);
  const loadProfile = useStore(s => s.loadProfile);
  const resetSettings = useStore(s => s.resetSettings);

  const [tab, setTab] = useState<Tab>('appearance');
  const [themeFilter, setThemeFilter] = useState('');
  const [profileName, setProfileName] = useState('');
  const [exportCopied, setExportCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [tab]);

  const filteredThemes = themeFilter
    ? THEMES.filter(t => t.name.toLowerCase().includes(themeFilter.toLowerCase()))
    : THEMES;

  const handleExport = useCallback(() => {
    const data = JSON.stringify(settings, null, 2);
    navigator.clipboard.writeText(data).then(() => {
      setExportCopied(true);
      setTimeout(() => setExportCopied(false), 2000);
    });
  }, [settings]);

  const handleImport = useCallback(() => {
    const input = prompt('Paste exported settings JSON:');
    if (!input) return;
    try {
      const data = JSON.parse(input);
      updateSettings(data);
    } catch {
      alert('Invalid JSON');
    }
  }, [updateSettings]);

  return (
    <Modal onClose={onClose} title="Settings" width="max-w-2xl" maxHeight="620px">
      <div className="flex flex-col sm:flex-row" style={{ height: '540px' }}>
        {/* Side navigation */}
        <nav className="hidden sm:flex flex-col w-[160px] shrink-0 border-r border-white/[0.04] py-3 px-2 gap-0.5">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all text-[12px] font-medium
                ${tab === t.id
                  ? 'bg-white/[0.07] text-gray-100 shadow-sm'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]'}`}>
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={t.icon} />
              </svg>
              {t.label}
            </button>
          ))}
          <div className="flex-1" />
          <div className="px-2 pt-3 border-t border-white/[0.04]">
            <p className="text-[9px] text-gray-700 font-mono leading-relaxed">
              DarkBear v2<br/>
              {settings.theme} theme
            </p>
          </div>
        </nav>

        {/* Mobile tabs */}
        <div className="flex sm:hidden gap-0 px-2 pt-1 border-b border-white/[0.04] overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-2.5 py-2.5 text-[10px] font-semibold uppercase tracking-wider transition-colors relative whitespace-nowrap
                ${tab === t.id ? 'text-indigo-300' : 'text-gray-600 hover:text-gray-400'}`}>
              {t.label}
              {tab === t.id && <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-indigo-500 rounded-full" />}
            </button>
          ))}
        </div>

        {/* Content area */}
        <div ref={contentRef} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">

          {/* ─── APPEARANCE ─── */}
          {tab === 'appearance' && (
            <>
              <Section label="Theme" desc="Choose a color scheme for the interface">
                {THEMES.length > 8 && (
                  <div className="relative mb-2">
                    <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                    </svg>
                    <input type="text" value={themeFilter} onChange={e => setThemeFilter(e.target.value)}
                      placeholder="Filter themes..."
                      className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg text-gray-300 text-[12px] pl-8 pr-3 py-1.5 outline-none focus:border-indigo-500/30 transition-colors placeholder:text-gray-700" />
                  </div>
                )}
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {filteredThemes.map(t => {
                    const active = settings.theme === t.id;
                    return (
                      <button key={t.id} onClick={() => setTheme(t.id)}
                        className="group rounded-xl overflow-hidden transition-all duration-150 text-left"
                        style={{
                          outline: active ? `2px solid ${t.accent}` : '1px solid rgba(255,255,255,0.05)',
                          outlineOffset: active ? '2px' : '0',
                          transform: active ? 'scale(1.02)' : undefined,
                        }}>
                        <div className="h-[48px] relative overflow-hidden" style={{ background: t.bg }}>
                          {settings.animateThemes && <ThemeAnimation id={t.id} accent={t.accent} text={t.text} />}
                          <div className="relative z-[1] flex h-full">
                            <div className="w-[18px] border-r" style={{ borderColor: `${t.text}10` }}>
                              <div className="mt-2.5 mx-auto w-[6px] h-[6px] rounded-full" style={{ background: t.accent, opacity: 0.8 }} />
                              <div className="mt-1 mx-auto w-[6px] h-[2px] rounded-full" style={{ background: t.text, opacity: 0.15 }} />
                              <div className="mt-0.5 mx-auto w-[6px] h-[2px] rounded-full" style={{ background: t.text, opacity: 0.1 }} />
                            </div>
                            <div className="flex-1 p-1.5 pt-2.5">
                              <div className="flex gap-0.5 mb-1">
                                <span className="h-[2px] rounded-full flex-[3]" style={{ background: t.accent, opacity: 0.5 }} />
                                <span className="h-[2px] rounded-full flex-[2]" style={{ background: t.text, opacity: 0.2 }} />
                              </div>
                              <div className="flex gap-0.5 mb-0.5">
                                <span className="h-[2px] rounded-full flex-[2]" style={{ background: t.text, opacity: 0.15 }} />
                                <span className="h-[2px] rounded-full flex-[4]" style={{ background: t.text, opacity: 0.1 }} />
                              </div>
                              <div className="flex gap-0.5">
                                <span className="h-[2px] rounded-full flex-[3]" style={{ background: t.text, opacity: 0.08 }} />
                                <span className="h-[2px] rounded-full flex-[1]" style={{ background: t.accent, opacity: 0.3 }} />
                              </div>
                            </div>
                          </div>
                          {active && (
                            <div className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center z-10"
                              style={{ background: t.accent }}>
                              <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 8l4 4 6-7" />
                              </svg>
                            </div>
                          )}
                        </div>
                        <div className={`px-2 py-1.5 text-[10px] font-semibold tracking-wide truncate transition-colors
                          ${active ? 'text-gray-100' : 'text-gray-500 group-hover:text-gray-400'}`}
                          style={{ background: active ? `${t.accent}10` : undefined }}>
                          {t.name}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <Toggle label="Animated Previews" desc="Show subtle animations in theme cards" on={settings.animateThemes} onChange={v => updateSettings({ animateThemes: v })} />
              </Section>

              {settings.theme === 'custom' && (
                <Section label="Custom Colors" desc="Fine-tune every shade">
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {(Object.entries(settings.customColors) as [keyof CustomThemeColors, string][]).map(([key, val]) => (
                      <label key={key} className="flex items-center gap-2 group cursor-pointer py-1 px-2 rounded-lg hover:bg-white/[0.02] transition-colors">
                        <input type="color" value={val}
                          onChange={e => setCustomColors({ [key]: e.target.value })}
                          className="w-6 h-6 rounded-md border border-white/10 cursor-pointer bg-transparent shrink-0" />
                        <span className="text-[10px] text-gray-500 font-mono group-hover:text-gray-300 transition-colors truncate">{key}</span>
                      </label>
                    ))}
                  </div>
                </Section>
              )}

              <Section label="Typography" desc="Font family and size">
                <div className="flex gap-1.5 mb-3">
                  {[{ id: 'system', name: 'System', sample: 'Aa' }, { id: 'mono', name: 'Mono', sample: 'Aa' }, { id: 'serif', name: 'Serif', sample: 'Aa' }].map(f => (
                    <Pill key={f.id} active={settings.fontFamily === f.id} onClick={() => updateSettings({ fontFamily: f.id })}>
                      <span className={f.id === 'mono' ? 'font-mono' : f.id === 'serif' ? 'font-serif' : ''}>{f.name}</span>
                    </Pill>
                  ))}
                </div>
                <Slider label="Font Size" value={settings.fontSize} unit="px" min={10} max={20}
                  onChange={v => updateSettings({ fontSize: v })} />
              </Section>

              <Section label="Layout" desc="Sidebar width and visual tuning">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3">
                  <Slider label="Sidebar Width" value={settings.sidebarWidth} unit="px" min={140} max={400} step={10}
                    onChange={v => updateSettings({ sidebarWidth: v })} />
                  <Slider label="Watermark" value={settings.watermarkOpacity} unit="%" min={0} max={100}
                    onChange={v => updateSettings({ watermarkOpacity: v })} />
                </div>
              </Section>

              <Section label="Background Image" desc="Set a custom wallpaper behind the chat">
                <input type="text" value={settings.bgImage} placeholder="https://example.com/image.jpg"
                  onChange={e => updateSettings({ bgImage: e.target.value })}
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg text-gray-200 text-[12px] px-3 py-2 outline-none focus:border-indigo-500/30 transition-colors placeholder:text-gray-700" />
                {settings.bgImage && (
                  <div className="grid grid-cols-2 gap-4 mt-2.5">
                    <Slider label="Opacity" value={settings.bgOpacity} unit="%" min={0} max={100}
                      onChange={v => updateSettings({ bgOpacity: v })} />
                    <Slider label="Blur" value={settings.bgBlur} unit="px" min={0} max={30}
                      onChange={v => updateSettings({ bgBlur: v })} />
                  </div>
                )}
              </Section>
            </>
          )}

          {/* ─── MESSAGES ─── */}
          {tab === 'messages' && (
            <>
              <Section label="Timestamps" desc="How message times are displayed">
                <div className="flex gap-1.5 flex-wrap">
                  {[{ id: '24h', name: '24-hour' }, { id: '12h', name: '12-hour' }, { id: 'relative', name: 'Relative' }, { id: 'off', name: 'Hidden' }].map(o => (
                    <Pill key={o.id} active={settings.timestampFormat === o.id}
                      onClick={() => updateSettings({ timestampFormat: o.id as '12h' | '24h' | 'off' | 'relative' })}>
                      {o.name}
                    </Pill>
                  ))}
                </div>
              </Section>

              <Section label="Display" desc="Control what appears in the message area">
                <div className="space-y-0">
                  <Toggle label="Compact Mode" desc="Reduce spacing between messages for density" on={settings.compactMode} onChange={v => updateSettings({ compactMode: v })} />
                  <Toggle label="Inline Images" desc="Expand image links into thumbnails" on={settings.inlineImages} onChange={v => updateSettings({ inlineImages: v })} />
                  <Toggle label="Nick Colors" desc="Assign unique colors to each nickname" on={settings.colorNicks} onChange={v => updateSettings({ colorNicks: v })} />
                  <Toggle label="Mode Prefixes" desc="Show @/+/% symbols before nicknames" on={settings.showPrefixes} onChange={v => updateSettings({ showPrefixes: v })} />
                  <Toggle label="Join/Part/Quit" desc="Show when users enter and leave channels" on={settings.joinPartMsgs} onChange={v => updateSettings({ joinPartMsgs: v })} />
                  <Toggle label="Read Marker" desc="Draw a line where you last read" on={settings.readMarker} onChange={v => updateSettings({ readMarker: v })} />
                </div>
              </Section>

              <Section label="Sidebar" desc="Buffer list behavior">
                <Toggle label="Unread Only" desc="Hide channels with no new messages" on={settings.onlyUnread} onChange={v => updateSettings({ onlyUnread: v })} />
              </Section>

              <Section label="Highlight Words" desc="Get notified when these words appear">
                <input type="text" value={settings.highlightWords.join(', ')}
                  onChange={e => updateSettings({ highlightWords: e.target.value.split(',').map(w => w.trim()).filter(Boolean) })}
                  placeholder="your-nick, keyword, ..."
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg text-gray-200 text-[12px] px-3 py-2 outline-none focus:border-indigo-500/30 transition-colors placeholder:text-gray-700" />
                <p className="text-[10px] text-gray-600 mt-1">Comma-separated. Case-insensitive matching.</p>
              </Section>
            </>
          )}

          {/* ─── NOTIFICATIONS ─── */}
          {tab === 'notifications' && (
            <>
              <Section label="Alerts" desc="How DarkBear gets your attention">
                <div className="space-y-0">
                  <Toggle label="Desktop Notifications" desc="Show browser push notifications for highlights and mentions" on={settings.notifications} onChange={v => updateSettings({ notifications: v })} />
                  <Toggle label="Notification Sound" desc="Play an audio chime on new activity" on={settings.notificationSound} onChange={v => updateSettings({ notificationSound: v })} />
                  <Toggle label="Mark Read on Focus" desc="Automatically clear unread counts when the window is focused" on={settings.readOnFocus} onChange={v => updateSettings({ readOnFocus: v })} />
                </div>
              </Section>

              <Section label="Reconnection" desc="Network recovery behavior">
                <Toggle label="Auto Reconnect" desc="Automatically reconnect when the connection drops" on={settings.autoReconnect} onChange={v => updateSettings({ autoReconnect: v })} />
              </Section>
            </>
          )}

          {/* ─── CONNECTION ─── */}
          {tab === 'connection' && (
            <>
              <Section label="Relay" desc="WebSocket relay connection settings">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <InputField label="Host" value={settings.relay.host} placeholder="irc.example.com"
                    onChange={v => updateRelay({ host: v })} />
                  <InputField label="Port" value={String(settings.relay.port)} placeholder="9001" type="number"
                    onChange={v => updateRelay({ port: Number(v) || 9001 })} />
                </div>
                <div className="space-y-0 mt-2">
                  <Toggle label="TLS" desc="Encrypt the WebSocket connection" on={settings.relay.tls} onChange={v => updateRelay({ tls: v })} />
                  <Toggle label="Compression" desc="Enable zlib compression for the relay protocol" on={settings.relay.compression} onChange={v => updateRelay({ compression: v })} />
                </div>
                <div className="mt-2">
                  <InputField label="Password" value={settings.relay.password} placeholder="Optional relay password" type="password"
                    onChange={v => updateRelay({ password: v })} />
                </div>
              </Section>

              <Section label="Profiles" desc="Save and switch between connection configurations">
                {settings.profiles.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {settings.profiles.map(p => (
                      <div key={p.name} className="flex items-center gap-2 bg-white/[0.02] border border-white/[0.05] rounded-lg px-3 py-2">
                        <span className="text-[12px] text-gray-300 font-medium flex-1 truncate">{p.name}</span>
                        <span className="text-[10px] text-gray-600 font-mono truncate max-w-[120px]">{p.relay.host}:{p.relay.port}</span>
                        <button onClick={() => loadProfile(p.name)}
                          className="text-[10px] font-semibold text-indigo-400 hover:text-indigo-300 transition-colors px-1.5">
                          Load
                        </button>
                        <button onClick={() => { if (confirm(`Delete profile "${p.name}"?`)) deleteProfile(p.name); }}
                          className="text-[10px] font-semibold text-red-400 hover:text-red-300 transition-colors px-1.5">
                          Del
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input type="text" value={profileName} onChange={e => setProfileName(e.target.value)}
                    placeholder="Profile name"
                    className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-lg text-gray-200 text-[12px] px-3 py-1.5 outline-none focus:border-indigo-500/30 transition-colors placeholder:text-gray-700" />
                  <button onClick={() => { if (profileName.trim()) { saveProfile(profileName.trim()); setProfileName(''); } }}
                    disabled={!profileName.trim()}
                    className="px-3 py-1.5 text-[11px] font-semibold text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 rounded-lg hover:bg-indigo-500/15 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                    Save Current
                  </button>
                </div>
              </Section>
            </>
          )}

          {/* ─── ADVANCED ─── */}
          {tab === 'advanced' && (
            <>
              <Section label="File Uploads" desc="Where DarkBear sends files you drag or paste">
                <InputField label="Upload URL" value={settings.uploadUrl} placeholder="https://your-server.com/upload"
                  onChange={v => updateSettings({ uploadUrl: v })} />
                <p className="text-[10px] text-gray-600 mt-1">POST endpoint — file sent as multipart/form-data</p>
              </Section>

              <Section label="GIF Search" desc="Tenor API for the GIF picker">
                <InputField label="Tenor API Key" value={settings.tenorApiKey} placeholder="Paste your Tenor v2 API key"
                  onChange={v => updateSettings({ tenorApiKey: v })} type="password" />
              </Section>

              <Section label="Custom CSS" desc="Inject your own styles into the client">
                <textarea value={settings.customCSS} onChange={e => updateSettings({ customCSS: e.target.value })}
                  placeholder="/* Override any DarkBear style */&#10;.sidebar { backdrop-filter: blur(20px); }" rows={5} spellCheck={false}
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl text-gray-200 text-[11px] font-mono px-3 py-2.5 outline-none focus:border-indigo-500/30 transition-colors placeholder:text-gray-700 resize-y leading-relaxed" />
              </Section>

              <Section label="Keyboard Shortcuts" desc="Built-in key bindings">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                  {SHORTCUTS.map(s => (
                    <div key={s.keys} className="flex items-center justify-between py-1.5">
                      <span className="text-[11px] text-gray-400">{s.action}</span>
                      <kbd className="text-[10px] font-mono text-gray-500 bg-white/[0.04] border border-white/[0.06] rounded px-1.5 py-0.5">{s.keys}</kbd>
                    </div>
                  ))}
                </div>
              </Section>

              <Section label="Data" desc="Import, export, or reset your configuration">
                <div className="flex flex-wrap gap-2">
                  <button onClick={handleExport}
                    className="px-3 py-1.5 text-[11px] font-semibold text-gray-300 bg-white/[0.04] border border-white/[0.06] rounded-lg hover:bg-white/[0.07] active:scale-95 transition-all">
                    {exportCopied ? '✓ Copied' : 'Export to Clipboard'}
                  </button>
                  <button onClick={handleImport}
                    className="px-3 py-1.5 text-[11px] font-semibold text-gray-300 bg-white/[0.04] border border-white/[0.06] rounded-lg hover:bg-white/[0.07] active:scale-95 transition-all">
                    Import from Clipboard
                  </button>
                  <button onClick={() => { if (confirm('Reset ALL settings to factory defaults? This cannot be undone.')) resetSettings(); }}
                    className="px-3 py-1.5 text-[11px] font-semibold text-red-400 bg-red-500/8 border border-red-500/15 rounded-lg hover:bg-red-500/15 active:scale-95 transition-all">
                    Reset Everything
                  </button>
                </div>
              </Section>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ─── Shared Components ─── */

function Section({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">{label}</h3>
        {desc && <p className="text-[10px] text-gray-600 mt-0.5 leading-relaxed">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ label, desc, on, onChange }: { label: string; desc: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} className="flex items-center justify-between py-2 group w-full text-left rounded-lg px-2 -mx-2 hover:bg-white/[0.02] transition-colors">
      <div className="min-w-0 mr-4">
        <span className="text-[12px] text-gray-200 font-medium block leading-tight">{label}</span>
        <p className="text-[10px] text-gray-600 leading-snug mt-0.5">{desc}</p>
      </div>
      <span className={`relative w-9 h-[20px] rounded-full transition-all shrink-0
        ${on ? 'bg-indigo-600 shadow-[0_0_8px_rgba(99,102,241,0.25)]' : 'bg-white/[0.06]'}`}>
        <span className={`absolute top-[2px] left-[2px] block w-[16px] h-[16px] rounded-full bg-white shadow-sm transition-transform duration-150
          ${on ? 'translate-x-[16px]' : ''}`} />
      </span>
    </button>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all
        ${active
          ? 'bg-indigo-500/12 text-indigo-200 ring-1 ring-indigo-500/30 shadow-sm'
          : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]'}`}>
      {children}
    </button>
  );
}

function Slider({ label, value, unit, min, max, step, onChange }: {
  label: string; value: number; unit: string; min: number; max: number; step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500">{label}</span>
        <span className="text-[11px] text-gray-400 tabular-nums font-mono">{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-indigo-500 h-1.5 rounded-full cursor-pointer" />
    </div>
  );
}

function InputField({ label, value, placeholder, type, onChange }: {
  label: string; value: string; placeholder?: string; type?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500 mb-1 block">{label}</label>
      <input type={type ?? 'text'} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg text-gray-200 text-[12px] px-3 py-2 outline-none focus:border-indigo-500/30 transition-colors placeholder:text-gray-700" />
    </div>
  );
}

function ThemeAnimation({ id, accent, text }: { id: string; accent: string; text: string }) {
  const w = 80;
  const h = 48;
  const common = { position: 'absolute' as const, inset: 0, width: '100%', height: '100%', pointerEvents: 'none' as const };

  switch (id) {
    case 'starfield':
      return (
        <svg style={common} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          {[[10,6],[38,11],[60,5],[25,34],[50,28],[70,22],[15,24],[46,38],[65,40],[20,16]].map(([x,y],i) => (
            <circle key={i} cx={x} cy={y} r={i%3===0?1.2:0.7} fill="#fff">
              <animate attributeName="opacity" values={`0.1;${0.5+i%3*0.2};0.1`} dur={`${1.5+i*0.3}s`} repeatCount="indefinite" />
            </circle>
          ))}
        </svg>
      );

    case 'midnight':
      return (
        <svg style={common} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          <defs>
            <radialGradient id="tm-mn-g2"><stop offset="0%" stopColor="#8b9cf8" stopOpacity="0.18" /><stop offset="100%" stopColor="#8b9cf8" stopOpacity="0" /></radialGradient>
          </defs>
          <ellipse cx={w/2} cy={h/2} rx="26" ry="18" fill="url(#tm-mn-g2)">
            <animate attributeName="rx" values="26;32;26" dur="4s" repeatCount="indefinite" />
          </ellipse>
        </svg>
      );

    case 'nord':
      return (
        <svg style={common} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          <path d={`M0,${h*0.3} Q${w*0.25},${h*0.1} ${w*0.5},${h*0.3} T${w},${h*0.25} V0 H0Z`} fill="#88c0d0" opacity="0.08">
            <animate attributeName="opacity" values="0.05;0.14;0.05" dur="5s" repeatCount="indefinite" />
          </path>
        </svg>
      );

    case 'ember':
      return (
        <svg style={common} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          <defs>
            <radialGradient id="tm-em-gw2" cx="50%" cy="90%" r="60%">
              <stop offset="0%" stopColor="#f97316" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect x="0" y="0" width={w} height={h} fill="url(#tm-em-gw2)">
            <animate attributeName="opacity" values="0.5;1;0.5" dur="3s" repeatCount="indefinite" />
          </rect>
        </svg>
      );

    case 'aurora':
      return (
        <svg style={common} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="tm-au-g2" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#c084fc" stopOpacity="0.08" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width={w} height={h} fill="url(#tm-au-g2)" />
        </svg>
      );

    case 'dracula':
      return (
        <svg style={common} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          <defs>
            <radialGradient id="tm-dr-fg2" cx="50%" cy="100%" r="70%">
              <stop offset="0%" stopColor="#bd93f9" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#bd93f9" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect x="0" y="0" width={w} height={h} fill="url(#tm-dr-fg2)">
            <animate attributeName="opacity" values="0.4;0.9;0.4" dur="5s" repeatCount="indefinite" />
          </rect>
        </svg>
      );

    case 'darkbear':
      return (
        <svg style={common} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          <defs>
            <radialGradient id="tm-db-gw2" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#818cf8" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse cx={w/2} cy={h/2} rx="18" ry="14" fill="url(#tm-db-gw2)">
            <animate attributeName="rx" values="18;24;18" dur="4s" repeatCount="indefinite" />
          </ellipse>
        </svg>
      );

    case 'retro':
      return (
        <svg style={common} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          {[0,1,2].map(i => (
            <line key={i} x1="0" y1={12+i*14} x2={w} y2={12+i*14} stroke="#ff00ff" strokeWidth="0.5" opacity="0.08">
              <animate attributeName="opacity" values="0.04;0.12;0.04" dur={`${2+i*0.7}s`} repeatCount="indefinite" />
            </line>
          ))}
        </svg>
      );

    case 'catppuccin':
      return (
        <svg style={common} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          <defs>
            <radialGradient id="tm-ct-g2" cx="30%" cy="70%" r="50%">
              <stop offset="0%" stopColor="#cba6f7" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#cba6f7" stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse cx={w*0.3} cy={h*0.7} rx="20" ry="14" fill="url(#tm-ct-g2)">
            <animate attributeName="opacity" values="0.6;1;0.6" dur="3.5s" repeatCount="indefinite" />
          </ellipse>
        </svg>
      );

    case 'tokyo-night':
      return (
        <svg style={common} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="tm-tn-g2" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#7aa2f7" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#bb9af7" stopOpacity="0.06" />
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
