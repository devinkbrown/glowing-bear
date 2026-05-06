'use client';

import { useState, useRef, useEffect } from 'react';
import { useStore } from '@/stores';
import type { ThemeName } from '@/types';
import Modal from '@/components/ui/Modal';

type Tab = 'appearance' | 'messages' | 'notifications' | 'advanced';

const THEMES: { id: ThemeName; name: string; accent: string; bg: string; text: string }[] = [
  { id: 'darkbear', name: 'DarkBear', accent: '#818cf8', bg: '#0a0b10', text: '#d0d5e8' },
  { id: 'midnight', name: 'Midnight', accent: '#8b9cf8', bg: '#000000', text: '#e0e0e0' },
  { id: 'obsidian', name: 'Obsidian', accent: '#a78bfa', bg: '#080808', text: '#d4d4d4' },
  { id: 'nord', name: 'Nord', accent: '#88c0d0', bg: '#242933', text: '#d8dee9' },
  { id: 'gruvbox', name: 'Gruvbox', accent: '#d79921', bg: '#141617', text: '#ebdbb2' },
  { id: 'rose-pine', name: 'Rose Pine', accent: '#eb6f92', bg: '#191724', text: '#e0def4' },
  { id: 'abyss', name: 'Abyss', accent: '#2dd4bf', bg: '#040a0c', text: '#b0e0e0' },
  { id: 'ember', name: 'Ember', accent: '#f97316', bg: '#0a0604', text: '#e0c0a0' },
  { id: 'aurora', name: 'Aurora', accent: '#a78bfa', bg: '#08040e', text: '#d0c0ee' },
  { id: 'catppuccin', name: 'Catppuccin', accent: '#cba6f7', bg: '#11111b', text: '#cdd6f4' },
  { id: 'tokyo-night', name: 'Tokyo Night', accent: '#7aa2f7', bg: '#13141e', text: '#c0caf5' },
  { id: 'dracula', name: 'Dracula', accent: '#bd93f9', bg: '#1e1f29', text: '#f0f0ec' },
  { id: 'solarized', name: 'Solarized', accent: '#268bd2', bg: '#002b36', text: '#c8d4d0' },
  { id: 'starfield', name: 'Starfield', accent: '#818cf8', bg: '#04050a', text: '#c8cce8' },
  { id: 'lightning', name: 'Lightning', accent: '#60a5fa', bg: '#080a12', text: '#d0d8e8' },
  { id: 'light', name: 'Light', accent: '#4f46e5', bg: '#ffffff', text: '#1f2937' },
  { id: 'custom', name: 'Custom', accent: '#888', bg: '#0c0d12', text: '#d0d4e0' },
];

interface Props {
  onClose: () => void;
}

export default function SettingsModal({ onClose }: Props) {
  const settings = useStore(s => s.settings);
  const updateSettings = useStore(s => s.updateSettings);
  const setTheme = useStore(s => s.setTheme);
  const setCustomColors = useStore(s => s.setCustomColors);
  const resetSettings = useStore(s => s.resetSettings);

  const [tab, setTab] = useState<Tab>('appearance');
  const themeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tab === 'appearance') {
      requestAnimationFrame(() => {
        const el = themeRef.current?.querySelector('[data-active]') as HTMLElement | null;
        el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'instant' });
      });
    }
  }, [tab]);

  return (
    <Modal onClose={onClose} title="Settings" width="max-w-[560px]">
      {/* Tabs */}
      <div className="flex gap-0.5 sm:gap-1 px-3 sm:px-5 pt-1 pb-0 border-b border-white/[0.04] overflow-x-auto">
        {(['appearance', 'messages', 'notifications', 'advanced'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-2.5 sm:px-3 py-2.5 text-[11px] sm:text-[12px] font-medium capitalize transition-colors relative whitespace-nowrap
              ${tab === t ? 'text-indigo-300' : 'text-gray-500 hover:text-gray-300'}`}>
            {t}
            {tab === t && <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-indigo-500 rounded-full" />}
          </button>
        ))}
      </div>

      <div className="p-4 sm:p-5 space-y-6 max-h-[60dvh] overflow-y-auto">
        {tab === 'appearance' && (
          <>
            <Section label="Theme">
              <div className="relative group/slider">
                <div ref={themeRef}
                  className="flex gap-2.5 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-2 [&::-webkit-scrollbar]:hidden"
                  style={{ scrollbarWidth: 'none' }}>
                  {THEMES.map(t => {
                    const active = settings.theme === t.id;
                    return (
                      <button key={t.id} onClick={() => setTheme(t.id)}
                        data-active={active || undefined}
                        className="snap-start shrink-0 w-[96px] rounded-xl overflow-hidden transition-all duration-200"
                        style={{
                          outline: active ? `2px solid ${t.accent}` : '1px solid rgba(255,255,255,0.06)',
                          outlineOffset: active ? '2px' : '0',
                          transform: active ? 'scale(1.06)' : undefined,
                          boxShadow: active ? `0 4px 20px ${t.accent}30` : undefined,
                        }}>
                        <div className="h-[58px] relative overflow-hidden" style={{ background: t.bg }}>
                          {settings.animateThemes && <ThemeAnimation id={t.id} accent={t.accent} text={t.text} />}
                          <div className="relative z-[1] flex h-full">
                            <div className="w-[20px] border-r" style={{ borderColor: `${t.text}12` }}>
                              <div className="mt-2.5 mx-auto w-[6px] h-[6px] rounded-full" style={{ background: t.accent, opacity: 0.7 }} />
                              <div className="mt-1 mx-auto w-[8px] h-[2px] rounded-full" style={{ background: t.text, opacity: 0.15 }} />
                              <div className="mt-0.5 mx-auto w-[8px] h-[2px] rounded-full" style={{ background: t.accent, opacity: 0.25 }} />
                            </div>
                            <div className="flex-1 p-1.5 pt-2.5">
                              <div className="flex gap-0.5 mb-1">
                                <span className="h-[2px] rounded-full flex-[3]" style={{ background: t.text, opacity: 0.2 }} />
                                <span className="h-[2px] rounded-full flex-[2]" style={{ background: t.accent, opacity: 0.4 }} />
                              </div>
                              <div className="flex gap-0.5 mb-1">
                                <span className="h-[2px] rounded-full flex-[2]" style={{ background: t.text, opacity: 0.12 }} />
                                <span className="h-[2px] rounded-full flex-[3]" style={{ background: t.text, opacity: 0.08 }} />
                              </div>
                              <div className="flex gap-0.5">
                                <span className="h-[2px] rounded-full flex-[4]" style={{ background: t.accent, opacity: 0.2 }} />
                                <span className="h-[2px] rounded-full flex-[1]" style={{ background: t.text, opacity: 0.12 }} />
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className={`px-1 py-1.5 text-[10px] font-medium text-center truncate
                          ${active ? 'text-gray-200' : 'text-gray-500'}`}
                          style={active ? { background: `${t.accent}12` } : undefined}>
                          {t.name}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => themeRef.current?.scrollBy({ left: -200, behavior: 'smooth' })}
                  className="absolute left-0 top-0 bottom-2 w-9 flex items-center justify-center
                    bg-gradient-to-r from-gray-950 via-gray-950/80 to-transparent rounded-l-xl cursor-pointer active:scale-90 transition-transform">
                  <svg className="w-5 h-5 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                </button>
                <button onClick={() => themeRef.current?.scrollBy({ left: 200, behavior: 'smooth' })}
                  className="absolute right-0 top-0 bottom-2 w-9 flex items-center justify-center
                    bg-gradient-to-l from-gray-950 via-gray-950/80 to-transparent rounded-r-xl cursor-pointer active:scale-90 transition-transform">
                  <svg className="w-5 h-5 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
                </button>
              </div>
              <div className="mt-2">
                <Toggle label="Animated Previews" desc="Animate theme cards" on={settings.animateThemes} onChange={v => updateSettings({ animateThemes: v })} />
              </div>
            </Section>

            {settings.theme === 'custom' && (
              <Section label="Custom Colors">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Object.entries(settings.customColors).map(([key, val]) => (
                    <label key={key} className="flex items-center gap-2 group cursor-pointer py-1">
                      <input type="color" value={val}
                        onChange={e => setCustomColors({ [key]: e.target.value })}
                        className="w-7 h-7 sm:w-5 sm:h-5 rounded border border-white/10 cursor-pointer bg-transparent" />
                      <span className="text-[11px] text-gray-500 font-mono group-hover:text-gray-300 transition-colors">{key}</span>
                    </label>
                  ))}
                </div>
              </Section>
            )}

            <Section label="Font Family">
              <div className="flex gap-1.5">
                {[{ id: 'system', name: 'System' }, { id: 'mono', name: 'Mono' }, { id: 'serif', name: 'Serif' }].map(f => (
                  <Pill key={f.id} active={settings.fontFamily === f.id} onClick={() => updateSettings({ fontFamily: f.id })}>
                    {f.name}
                  </Pill>
                ))}
              </div>
            </Section>

            <Slider label="Font Size" value={settings.fontSize} unit="px" min={10} max={20}
              onChange={v => updateSettings({ fontSize: v })} />
            <Slider label="Sidebar Width" value={settings.sidebarWidth} unit="px" min={140} max={400} step={10}
              onChange={v => updateSettings({ sidebarWidth: v })} />
            <Slider label="Watermark" value={settings.watermarkOpacity} unit="%" min={0} max={100}
              onChange={v => updateSettings({ watermarkOpacity: v })} />

            <Section label="Background Image">
              <input type="text" value={settings.bgImage} placeholder="https://..."
                onChange={e => updateSettings({ bgImage: e.target.value })}
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg text-gray-200 text-[13px] px-3 py-2.5 sm:py-2 outline-none focus:border-indigo-500/30 transition-colors placeholder:text-gray-600" />
              {settings.bgImage && (
                <div className="flex gap-4 mt-2">
                  <Slider label="Opacity" value={settings.bgOpacity} unit="%" min={0} max={100}
                    onChange={v => updateSettings({ bgOpacity: v })} inline />
                  <Slider label="Blur" value={settings.bgBlur} unit="px" min={0} max={30}
                    onChange={v => updateSettings({ bgBlur: v })} inline />
                </div>
              )}
            </Section>
          </>
        )}

        {tab === 'messages' && (
          <>
            <Section label="Timestamps">
              <div className="flex gap-1.5 flex-wrap">
                {[{ id: '24h', name: '24h' }, { id: '12h', name: '12h' }, { id: 'relative', name: 'Relative' }, { id: 'off', name: 'Off' }].map(o => (
                  <Pill key={o.id} active={settings.timestampFormat === o.id}
                    onClick={() => updateSettings({ timestampFormat: o.id as '12h' | '24h' | 'off' | 'relative' })}>
                    {o.name}
                  </Pill>
                ))}
              </div>
            </Section>
            <Toggle label="Compact Mode" desc="Tighter message spacing" on={settings.compactMode} onChange={v => updateSettings({ compactMode: v })} />
            <Toggle label="Inline Images" desc="Preview image links" on={settings.inlineImages} onChange={v => updateSettings({ inlineImages: v })} />
            <Toggle label="Nick Colors" desc="Colorize nicknames" on={settings.colorNicks} onChange={v => updateSettings({ colorNicks: v })} />
            <Toggle label="Prefixes" desc="Show @/+/% before nicks" on={settings.showPrefixes} onChange={v => updateSettings({ showPrefixes: v })} />
            <Toggle label="Join/Part/Quit" desc="Show join and leave messages" on={settings.joinPartMsgs} onChange={v => updateSettings({ joinPartMsgs: v })} />
            <Toggle label="Read Marker" desc="Show unread separator line" on={settings.readMarker} onChange={v => updateSettings({ readMarker: v })} />
            <Toggle label="Unread Only" desc="Hide idle buffers in sidebar" on={settings.onlyUnread} onChange={v => updateSettings({ onlyUnread: v })} />

            <Section label="Highlight Words">
              <input type="text" value={settings.highlightWords.join(', ')}
                onChange={e => updateSettings({ highlightWords: e.target.value.split(',').map(w => w.trim()).filter(Boolean) })}
                placeholder="word1, word2, ..."
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg text-gray-200 text-[13px] px-3 py-2.5 sm:py-2 outline-none focus:border-indigo-500/30 transition-colors placeholder:text-gray-600" />
              <p className="text-[11px] text-gray-500 mt-1">Comma-separated</p>
            </Section>
          </>
        )}

        {tab === 'notifications' && (
          <>
            <Toggle label="Desktop Notifications" desc="Browser notifications for highlights" on={settings.notifications} onChange={v => updateSettings({ notifications: v })} />
            <Toggle label="Sound" desc="Play notification sound" on={settings.notificationSound} onChange={v => updateSettings({ notificationSound: v })} />
            <Toggle label="Mark Read on Focus" desc="Clear unread on window focus" on={settings.readOnFocus} onChange={v => updateSettings({ readOnFocus: v })} />
            <Toggle label="Auto Reconnect" desc="Reconnect on disconnect" on={settings.autoReconnect} onChange={v => updateSettings({ autoReconnect: v })} />
            <Toggle label="Video Calls" desc="Enable WebRTC calls" on={settings.enableVideoCalls} onChange={v => updateSettings({ enableVideoCalls: v })} />

            {settings.enableVideoCalls && (
              <Section label="TURN Server">
                <div className="space-y-2">
                  <input type="text" value={settings.turnUrl}
                    onChange={e => updateSettings({ turnUrl: e.target.value })}
                    placeholder="turn:your-server.com:3478"
                    className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg text-gray-200 text-[13px] px-3 py-2.5 sm:py-2 outline-none focus:border-indigo-500/30 transition-colors placeholder:text-gray-600" />
                  <div className="flex gap-2">
                    <input type="text" value={settings.turnUsername}
                      onChange={e => updateSettings({ turnUsername: e.target.value })}
                      placeholder="Username"
                      className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-lg text-gray-200 text-[13px] px-3 py-2.5 sm:py-2 outline-none focus:border-indigo-500/30 transition-colors placeholder:text-gray-600" />
                    <input type="password" value={settings.turnCredential}
                      onChange={e => updateSettings({ turnCredential: e.target.value })}
                      placeholder="Credential"
                      className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-lg text-gray-200 text-[13px] px-3 py-2.5 sm:py-2 outline-none focus:border-indigo-500/30 transition-colors placeholder:text-gray-600" />
                  </div>
                  <p className="text-[11px] text-gray-500">Required for calls behind symmetric NAT. Leave empty for STUN-only.</p>
                </div>
              </Section>
            )}
          </>
        )}

        {tab === 'advanced' && (
          <>
            <Section label="Upload URL">
              <input type="text" value={settings.uploadUrl}
                onChange={e => updateSettings({ uploadUrl: e.target.value })}
                placeholder="https://your-server.com/upload"
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg text-gray-200 text-[13px] px-3 py-2.5 sm:py-2 outline-none focus:border-indigo-500/30 transition-colors placeholder:text-gray-600" />
              <p className="text-[11px] text-gray-500 mt-1">POST endpoint for file uploads (FormData). Response should be a URL.</p>
            </Section>

            <Section label="Tenor API Key">
              <input type="text" value={settings.tenorApiKey}
                onChange={e => updateSettings({ tenorApiKey: e.target.value })}
                placeholder="API key for GIF search"
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg text-gray-200 text-[13px] px-3 py-2.5 sm:py-2 outline-none focus:border-indigo-500/30 transition-colors placeholder:text-gray-600" />
              <p className="text-[11px] text-gray-500 mt-1">Get a key from <span className="text-gray-400">console.cloud.google.com</span> &rarr; Tenor API</p>
            </Section>

            <Section label="Custom CSS">
              <textarea value={settings.customCSS} onChange={e => updateSettings({ customCSS: e.target.value })}
                placeholder="/* your styles */" rows={6} spellCheck={false}
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg text-gray-200 text-[12px] font-mono px-3 py-2.5 outline-none focus:border-indigo-500/30 transition-colors placeholder:text-gray-600 resize-y leading-relaxed" />
            </Section>
            <div className="pt-4 border-t border-white/[0.04]">
              <button onClick={() => { if (confirm('Reset all settings to defaults?')) resetSettings(); }}
                className="px-4 py-2.5 text-[12px] font-medium text-red-400 bg-red-500/8 border border-red-500/15 rounded-lg hover:bg-red-500/15 active:bg-red-500/20 transition-colors">
                Reset All Settings
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-400 mb-2 block">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ label, desc, on, onChange }: { label: string; desc: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} className="flex items-center justify-between py-2.5 sm:py-2 group w-full text-left">
      <div className="min-w-0 mr-3">
        <span className="text-[13px] text-gray-200 block">{label}</span>
        <p className="text-[11px] text-gray-500">{desc}</p>
      </div>
      <span className={`relative w-11 h-[26px] sm:w-10 sm:h-[22px] rounded-full transition-all shrink-0
        ${on ? 'bg-indigo-600 shadow-[0_0_8px_rgba(99,102,241,0.25)]' : 'bg-white/[0.06]'}`}>
        <span className={`absolute top-[3px] left-[3px] block w-5 h-5 sm:w-4 sm:h-4 rounded-full bg-white shadow-sm transition-transform
          ${on ? 'translate-x-[18px]' : ''}`} />
      </span>
    </button>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`px-3.5 py-2 sm:px-3 sm:py-1.5 rounded-lg text-[12px] font-medium transition-all
        ${active
          ? 'bg-indigo-500/12 text-indigo-200 ring-1 ring-indigo-500/25'
          : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]'}`}>
      {children}
    </button>
  );
}

function Slider({ label, value, unit, min, max, step, onChange, inline }: {
  label: string; value: number; unit: string; min: number; max: number; step?: number;
  onChange: (v: number) => void; inline?: boolean;
}) {
  if (inline) {
    return (
      <label className="flex-1">
        <span className="text-[11px] text-gray-400">{label}: {value}{unit}</span>
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full accent-indigo-500 h-2 sm:h-1" />
      </label>
    );
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-400">{label}</span>
        <span className="text-[11px] text-gray-400 tabular-nums font-mono">{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-indigo-500 h-2 sm:h-1" />
    </div>
  );
}

function ThemeAnimation({ id, accent, text }: { id: string; accent: string; text: string }) {
  const w = 96;
  const h = 58;
  const common = { position: 'absolute' as const, inset: 0, width: w, height: h, pointerEvents: 'none' as const };

  switch (id) {
    case 'starfield':
      return (
        <svg style={common} viewBox={`0 0 ${w} ${h}`}>
          {[[12,8],[45,14],[72,6],[30,42],[60,36],[82,28],[18,30],[55,48],[8,50],[38,22],[68,44],[24,16]].map(([x,y],i) => (
            <circle key={i} cx={x} cy={y} r={i%3===0?1.2:0.7} fill="#fff">
              <animate attributeName="opacity" values={`0.1;${0.5+i%3*0.2};0.1`} dur={`${1.5+i*0.3}s`} repeatCount="indefinite" />
            </circle>
          ))}
          {[[20,10,55,35],[70,5,30,50]].map(([x1,y1,x2,y2],i) => (
            <line key={`s${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#818cf8" strokeWidth="0.5" strokeLinecap="round">
              <animate attributeName="opacity" values="0;0.6;0" dur={`${3+i}s`} repeatCount="indefinite" begin={`${i*1.5}s`} />
            </line>
          ))}
        </svg>
      );

    case 'midnight':
      return (
        <svg style={common} viewBox={`0 0 ${w} ${h}`}>
          <defs>
            <radialGradient id="tm-mn-g"><stop offset="0%" stopColor="#8b9cf8" stopOpacity="0.15" /><stop offset="100%" stopColor="#8b9cf8" stopOpacity="0" /></radialGradient>
          </defs>
          <ellipse cx={w/2} cy={h/2} rx="30" ry="20" fill="url(#tm-mn-g)">
            <animate attributeName="rx" values="30;35;30" dur="4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.6;1;0.6" dur="4s" repeatCount="indefinite" />
          </ellipse>
          {[[10,12],[35,8],[60,18],[80,10],[25,45],[50,40],[75,48]].map(([x,y],i) => (
            <circle key={i} cx={x} cy={y} r={0.6} fill={text}>
              <animate attributeName="opacity" values="0.05;0.4;0.05" dur={`${2+i*0.4}s`} repeatCount="indefinite" />
            </circle>
          ))}
        </svg>
      );

    case 'obsidian':
      return (
        <svg style={common} viewBox={`0 0 ${w} ${h}`}>
          <defs>
            <linearGradient id="tm-ob-sw" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#a78bfa" stopOpacity="0" />
              <stop offset="40%" stopColor="#a78bfa" stopOpacity="0.12" />
              <stop offset="60%" stopColor="#a78bfa" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect x="-100" y="0" width="60" height={h} fill="url(#tm-ob-sw)" transform="skewX(-20)">
            <animateTransform attributeName="transform" type="translate" values="-20,0;140,0;-20,0" dur="5s" repeatCount="indefinite" additive="sum" />
          </rect>
          {[[15,20],[50,35],[80,15]].map(([x,y],i) => (
            <polygon key={i} points={`${x},${y} ${x+3},${y-2} ${x+6},${y} ${x+3},${y+2}`} fill="#a78bfa" opacity="0.06" />
          ))}
        </svg>
      );

    case 'nord':
      return (
        <svg style={common} viewBox={`0 0 ${w} ${h}`}>
          <defs>
            <linearGradient id="tm-nd-au" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#88c0d0" stopOpacity="0.15" />
              <stop offset="33%" stopColor="#81a1c1" stopOpacity="0.1" />
              <stop offset="66%" stopColor="#5e81ac" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#88c0d0" stopOpacity="0.15" />
            </linearGradient>
          </defs>
          <path d={`M0,${h*0.3} Q${w*0.25},${h*0.15} ${w*0.5},${h*0.3} T${w},${h*0.3} V0 H0Z`} fill="url(#tm-nd-au)">
            <animate attributeName="d" values={
              `M0,${h*0.3} Q${w*0.25},${h*0.15} ${w*0.5},${h*0.3} T${w},${h*0.3} V0 H0Z;` +
              `M0,${h*0.25} Q${w*0.25},${h*0.35} ${w*0.5},${h*0.2} T${w},${h*0.25} V0 H0Z;` +
              `M0,${h*0.3} Q${w*0.25},${h*0.15} ${w*0.5},${h*0.3} T${w},${h*0.3} V0 H0Z`
            } dur="6s" repeatCount="indefinite" />
          </path>
          {[[20,10],[50,8],[75,12]].map(([x,y],i) => (
            <circle key={i} cx={x} cy={y} r="1" fill="#88c0d0" opacity="0.15">
              <animate attributeName="opacity" values="0.08;0.2;0.08" dur={`${3+i}s`} repeatCount="indefinite" />
            </circle>
          ))}
        </svg>
      );

    case 'gruvbox':
      return (
        <svg style={common} viewBox={`0 0 ${w} ${h}`}>
          <defs>
            <radialGradient id="tm-gv-gw" cx="50%" cy="100%" r="70%">
              <stop offset="0%" stopColor="#d79921" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#d79921" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect x="0" y="0" width={w} height={h} fill="url(#tm-gv-gw)">
            <animate attributeName="opacity" values="0.5;1;0.5" dur="4s" repeatCount="indefinite" />
          </rect>
          {[[15,40,1],[35,45,0.8],[55,38,1.2],[75,42,0.6],[25,50,0.5],[65,48,0.7]].map(([x,y,r],i) => (
            <circle key={i} cx={x} cy={y} r={r} fill={i%2===0?'#d79921':'#cc241d'} opacity="0.15">
              <animate attributeName="cy" values={`${y};${y-8};${y}`} dur={`${2+i*0.5}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.15;0.35;0" dur={`${2+i*0.5}s`} repeatCount="indefinite" />
            </circle>
          ))}
        </svg>
      );

    case 'rose-pine':
      return (
        <svg style={common} viewBox={`0 0 ${w} ${h}`}>
          {[[10,50,3],[28,48,2.5],[48,52,2],[65,46,3.5],[82,50,2],[20,55,1.5],[55,54,2.5],[40,56,1.8]].map(([x,y,s],i) => (
            <g key={i}>
              <path d={`M${x},${y} Q${x-(s as number)},${y-(s as number)*2} ${x},${y-(s as number)*3} Q${x+(s as number)},${y-(s as number)*2} ${x},${y}`}
                fill="#eb6f92" opacity="0">
                <animate attributeName="opacity" values="0;0.2;0" dur={`${3+i*0.7}s`} repeatCount="indefinite" begin={`${i*0.5}s`} />
                <animateTransform attributeName="transform" type="translate" values={`0,0;${i%2===0?'-3':3},-12`} dur={`${3+i*0.7}s`} repeatCount="indefinite" begin={`${i*0.5}s`} />
                <animateTransform attributeName="transform" type="rotate" values={`0,${x},${y};${i%2===0?-30:30},${x},${y}`} dur={`${3+i*0.7}s`} repeatCount="indefinite" begin={`${i*0.5}s`} additive="sum" />
              </path>
            </g>
          ))}
        </svg>
      );

    case 'abyss':
      return (
        <svg style={common} viewBox={`0 0 ${w} ${h}`}>
          <defs>
            <radialGradient id="tm-ab-gw" cx="50%" cy="30%" r="60%">
              <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect x="0" y="0" width={w} height={h} fill="url(#tm-ab-gw)">
            <animate attributeName="opacity" values="0.4;0.8;0.4" dur="5s" repeatCount="indefinite" />
          </rect>
          {[0,1,2].map(i => (
            <path key={i} d={`M0,${20+i*12} Q${w*0.3},${15+i*12} ${w*0.5},${20+i*12} T${w},${20+i*12}`}
              fill="none" stroke="#2dd4bf" strokeWidth="0.5" opacity="0.08">
              <animate attributeName="d" values={
                `M0,${20+i*12} Q${w*0.3},${15+i*12} ${w*0.5},${20+i*12} T${w},${20+i*12};` +
                `M0,${22+i*12} Q${w*0.3},${25+i*12} ${w*0.5},${18+i*12} T${w},${22+i*12};` +
                `M0,${20+i*12} Q${w*0.3},${15+i*12} ${w*0.5},${20+i*12} T${w},${20+i*12}`
              } dur={`${4+i}s`} repeatCount="indefinite" />
            </path>
          ))}
          {[[30,25],[60,35],[15,40]].map(([x,y],i) => (
            <circle key={`b${i}`} cx={x} cy={y} r="1.5" fill="#2dd4bf" opacity="0">
              <animate attributeName="opacity" values="0;0.12;0" dur={`${6+i*2}s`} repeatCount="indefinite" begin={`${i*2}s`} />
              <animate attributeName="r" values="1.5;3;1.5" dur={`${6+i*2}s`} repeatCount="indefinite" begin={`${i*2}s`} />
            </circle>
          ))}
        </svg>
      );

    case 'ember':
      return (
        <svg style={common} viewBox={`0 0 ${w} ${h}`}>
          <defs>
            <radialGradient id="tm-em-gw" cx="50%" cy="90%" r="60%">
              <stop offset="0%" stopColor="#f97316" stopOpacity="0.2" />
              <stop offset="50%" stopColor="#ef4444" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect x="0" y="0" width={w} height={h} fill="url(#tm-em-gw)">
            <animate attributeName="opacity" values="0.6;1;0.6" dur="3s" repeatCount="indefinite" />
          </rect>
          {[[12,55,1.2],[25,52,0.8],[38,56,1],[52,50,0.7],[65,54,1.1],[78,52,0.6],[20,58,0.5],[45,58,0.9],[70,56,0.8],[33,54,0.6]].map(([x,y,r],i) => (
            <circle key={i} cx={x} cy={y} r={r} fill={i%3===0?'#fbbf24':i%3===1?'#f97316':'#ef4444'}>
              <animate attributeName="cy" values={`${y};${y-15-i*2};${y}`} dur={`${2+i*0.3}s`} repeatCount="indefinite" begin={`${i*0.25}s`} />
              <animate attributeName="opacity" values="0.4;0.6;0" dur={`${2+i*0.3}s`} repeatCount="indefinite" begin={`${i*0.25}s`} />
              <animate attributeName="r" values={`${r};${(r as number)*0.3};0`} dur={`${2+i*0.3}s`} repeatCount="indefinite" begin={`${i*0.25}s`} />
            </circle>
          ))}
        </svg>
      );

    case 'aurora':
      return (
        <svg style={common} viewBox={`0 0 ${w} ${h}`}>
          <defs>
            <linearGradient id="tm-au-g1" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.12"><animate attributeName="stopColor" values="#a78bfa;#c084fc;#818cf8;#a78bfa" dur="6s" repeatCount="indefinite" /></stop>
              <stop offset="50%" stopColor="#c084fc" stopOpacity="0.08"><animate attributeName="stopColor" values="#c084fc;#818cf8;#a78bfa;#c084fc" dur="6s" repeatCount="indefinite" /></stop>
              <stop offset="100%" stopColor="#818cf8" stopOpacity="0.12"><animate attributeName="stopColor" values="#818cf8;#a78bfa;#c084fc;#818cf8" dur="6s" repeatCount="indefinite" /></stop>
            </linearGradient>
          </defs>
          <rect x="0" y="0" width={w} height={h} fill="url(#tm-au-g1)" />
          {[0,1,2,3].map(i => (
            <rect key={i} x={i*24} y="0" width="4" height={h} fill="#a78bfa" opacity="0.04">
              <animate attributeName="height" values={`${h};${h*0.4};${h}`} dur={`${3+i*0.5}s`} repeatCount="indefinite" begin={`${i*0.7}s`} />
              <animate attributeName="opacity" values="0.04;0.12;0.04" dur={`${3+i*0.5}s`} repeatCount="indefinite" begin={`${i*0.7}s`} />
            </rect>
          ))}
        </svg>
      );

    case 'catppuccin':
      return (
        <svg style={common} viewBox={`0 0 ${w} ${h}`}>
          <defs>
            <radialGradient id="tm-cp-gw" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#cba6f7" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#cba6f7" stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse cx={w/2} cy={h/2} rx="25" ry="18" fill="url(#tm-cp-gw)">
            <animate attributeName="rx" values="25;32;25" dur="5s" repeatCount="indefinite" />
            <animate attributeName="ry" values="18;22;18" dur="5s" repeatCount="indefinite" />
          </ellipse>
          {[[20,15],[48,12],[72,20],[35,40],[60,42]].map(([x,y],i) => (
            <circle key={i} cx={x} cy={y} r="8" fill="none" stroke="#cba6f7" strokeWidth="0.3" opacity="0">
              <animate attributeName="opacity" values="0;0.08;0" dur={`${4+i}s`} repeatCount="indefinite" begin={`${i*0.8}s`} />
              <animate attributeName="r" values="2;10;2" dur={`${4+i}s`} repeatCount="indefinite" begin={`${i*0.8}s`} />
            </circle>
          ))}
        </svg>
      );

    case 'tokyo-night':
      return (
        <svg style={common} viewBox={`0 0 ${w} ${h}`}>
          {[[8,50,20],[30,48,18],[55,52,15],[78,46,22]].map(([x,y,ht],i) => (
            <rect key={i} x={x} y={y-(ht as number)} width="6" height={ht} fill="#1a1b27" stroke="#7aa2f7" strokeWidth="0.3" opacity="0.3">
              <animate attributeName="opacity" values="0.2;0.4;0.2" dur={`${3+i}s`} repeatCount="indefinite" />
            </rect>
          ))}
          {[[10,30],[33,28],[58,34],[80,26]].map(([x,y],i) => (
            <rect key={`w${i}`} x={x} y={y} width="2" height="1.5" fill={['#7aa2f7','#ff9e64','#9ece6a','#bb9af7'][i]} opacity="0.4">
              <animate attributeName="opacity" values="0.2;0.6;0.2" dur={`${1.5+i*0.3}s`} repeatCount="indefinite" />
            </rect>
          ))}
          <line x1="0" y1={h-3} x2={w} y2={h-3} stroke="#7aa2f7" strokeWidth="0.4" opacity="0.15" />
          <circle cx="0" cy={h-3} r="1" fill="#ff9e64" opacity="0.5">
            <animate attributeName="cx" values="0;96;0" dur="8s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.3;0.6;0.3" dur="2s" repeatCount="indefinite" />
          </circle>
        </svg>
      );

    case 'dracula':
      return (
        <svg style={common} viewBox={`0 0 ${w} ${h}`}>
          <defs>
            <radialGradient id="tm-dr-fg" cx="50%" cy="100%" r="80%">
              <stop offset="0%" stopColor="#bd93f9" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#bd93f9" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect x="0" y="0" width={w} height={h} fill="url(#tm-dr-fg)">
            <animate attributeName="opacity" values="0.3;0.7;0.3" dur="6s" repeatCount="indefinite" />
          </rect>
          {[0,1,2].map(i => (
            <ellipse key={i} cx={20+i*28} cy={h+5} rx="18" ry="12" fill="#6272a4" opacity="0.06">
              <animate attributeName="cy" values={`${h+5};${h-10};${h+5}`} dur={`${5+i*2}s`} repeatCount="indefinite" begin={`${i}s`} />
              <animate attributeName="opacity" values="0.04;0.1;0.04" dur={`${5+i*2}s`} repeatCount="indefinite" begin={`${i}s`} />
            </ellipse>
          ))}
          {[[25,15],[60,10]].map(([x,y],i) => (
            <g key={`b${i}`} opacity="0">
              <path d={`M${x},${y} Q${x-4},${y-3} ${x-8},${y} Q${x-4},${y+1} ${x},${y} Q${x+4},${y+1} ${x+8},${y} Q${x+4},${y-3} ${x},${y}`}
                fill="#bd93f9" />
              <animate attributeName="opacity" values="0;0.15;0.15;0" dur="8s" repeatCount="indefinite" begin={`${i*4}s`} />
              <animateTransform attributeName="transform" type="translate" values={`0,0;${i%2===0?30:-30},-5`} dur="8s" repeatCount="indefinite" begin={`${i*4}s`} />
            </g>
          ))}
        </svg>
      );

    case 'solarized':
      return (
        <svg style={common} viewBox={`0 0 ${w} ${h}`}>
          <circle cx={w*0.7} cy={h*0.25} r="8" fill="#b58900" opacity="0.12">
            <animate attributeName="opacity" values="0.08;0.18;0.08" dur="4s" repeatCount="indefinite" />
          </circle>
          {[0,45,90,135,180,225,270,315].map((angle,i) => {
            const rad = angle * Math.PI / 180;
            const cx = w*0.7, cy = h*0.25;
            return (
              <line key={i} x1={cx+Math.cos(rad)*10} y1={cy+Math.sin(rad)*10}
                x2={cx+Math.cos(rad)*16} y2={cy+Math.sin(rad)*16}
                stroke="#b58900" strokeWidth="0.5" strokeLinecap="round" opacity="0.08">
                <animate attributeName="opacity" values="0.04;0.12;0.04" dur="4s" repeatCount="indefinite" begin={`${i*0.5}s`} />
              </line>
            );
          })}
          <defs>
            <linearGradient id="tm-sl-wm" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#268bd2" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#268bd2" stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect x="0" y={h*0.5} width={w} height={h*0.5} fill="url(#tm-sl-wm)" />
        </svg>
      );

    case 'lightning':
      return (
        <svg style={common} viewBox={`0 0 ${w} ${h}`}>
          <rect x="0" y="0" width={w} height={h} fill="#60a5fa" opacity="0">
            <animate attributeName="opacity" values="0;0;0;0.2;0;0.1;0;0" dur="4s" repeatCount="indefinite" />
          </rect>
          <path d="M48,2 L44,22 L50,22 L42,40" fill="none" stroke="#93c5fd" strokeWidth="1.2" strokeLinecap="round" opacity="0">
            <animate attributeName="opacity" values="0;0;0;0.8;0;0.5;0;0" dur="4s" repeatCount="indefinite" />
          </path>
          <path d="M25,5 L22,18 L27,18 L20,32" fill="none" stroke="#bfdbfe" strokeWidth="0.8" strokeLinecap="round" opacity="0">
            <animate attributeName="opacity" values="0;0;0.6;0;0;0;0;0" dur="5s" repeatCount="indefinite" begin="1.5s" />
          </path>
          {[[15,10],[35,6],[55,12],[75,8],[25,18],[60,16],[85,14]].map(([x,y],i) => (
            <circle key={i} cx={x} cy={y} r="0.5" fill="#93c5fd" opacity="0.15">
              <animate attributeName="opacity" values="0.08;0.3;0.08" dur={`${2+i*0.3}s`} repeatCount="indefinite" />
            </circle>
          ))}
          {[0,1,2].map(i => (
            <ellipse key={`c${i}`} cx={10+i*30} cy={h*0.25} rx="16" ry="6" fill="#1e3a5f" opacity="0.25">
              <animateTransform attributeName="transform" type="translate" values={`0,0;${6+i*2},0;0,0`} dur={`${5+i}s`} repeatCount="indefinite" />
            </ellipse>
          ))}
        </svg>
      );

    case 'light':
      return (
        <svg style={common} viewBox={`0 0 ${w} ${h}`}>
          <defs>
            <linearGradient id="tm-lt-sw" x1="0" y1="0" x2="1" y2="0.3">
              <stop offset="0%" stopColor="#fff" stopOpacity="0" />
              <stop offset="45%" stopColor="#fff" stopOpacity="0.3" />
              <stop offset="55%" stopColor="#fff" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect x="-60" y="0" width="40" height={h} fill="url(#tm-lt-sw)" transform="skewX(-15)">
            <animateTransform attributeName="transform" type="translate" values="-20,0;130,0;-20,0" dur="4s" repeatCount="indefinite" additive="sum" />
          </rect>
          <rect x="0" y="0" width={w} height={h} fill="#4f46e5" opacity="0.02">
            <animate attributeName="opacity" values="0.01;0.04;0.01" dur="3s" repeatCount="indefinite" />
          </rect>
        </svg>
      );

    case 'darkbear':
      return (
        <svg style={common} viewBox={`0 0 ${w} ${h}`}>
          <defs>
            <radialGradient id="tm-db-gw" cx="50%" cy="50%" r="45%">
              <stop offset="0%" stopColor="#818cf8" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse cx={w/2} cy={h/2} rx="20" ry="15" fill="url(#tm-db-gw)">
            <animate attributeName="rx" values="20;28;20" dur="4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.7;1;0.7" dur="4s" repeatCount="indefinite" />
          </ellipse>
          <circle cx={w/2} cy={h/2} r="3" fill="none" stroke="#818cf8" strokeWidth="0.5" opacity="0.1">
            <animate attributeName="r" values="3;18;3" dur="5s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.15;0;0.15" dur="5s" repeatCount="indefinite" />
          </circle>
          <circle cx={w/2} cy={h/2} r="3" fill="none" stroke="#818cf8" strokeWidth="0.5" opacity="0.1">
            <animate attributeName="r" values="3;18;3" dur="5s" repeatCount="indefinite" begin="2.5s" />
            <animate attributeName="opacity" values="0.15;0;0.15" dur="5s" repeatCount="indefinite" begin="2.5s" />
          </circle>
        </svg>
      );

    case 'custom':
      return (
        <svg style={common} viewBox={`0 0 ${w} ${h}`}>
          <defs>
            <linearGradient id="tm-cu-rb" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.1"><animate attributeName="stopColor" values="#ef4444;#f97316;#eab308;#22c55e;#3b82f6;#8b5cf6;#ef4444" dur="8s" repeatCount="indefinite" /></stop>
              <stop offset="50%" stopColor="#22c55e" stopOpacity="0.08"><animate attributeName="stopColor" values="#22c55e;#3b82f6;#8b5cf6;#ef4444;#f97316;#eab308;#22c55e" dur="8s" repeatCount="indefinite" /></stop>
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.1"><animate attributeName="stopColor" values="#3b82f6;#8b5cf6;#ef4444;#f97316;#eab308;#22c55e;#3b82f6" dur="8s" repeatCount="indefinite" /></stop>
            </linearGradient>
          </defs>
          <rect x="0" y="0" width={w} height={h} fill="url(#tm-cu-rb)" />
          <rect x="30" y="15" width="36" height="28" rx="4" fill="none" stroke={accent} strokeWidth="0.5" strokeDasharray="3,3" opacity="0.15">
            <animate attributeName="stroke-dashoffset" values="0;-12" dur="3s" repeatCount="indefinite" />
          </rect>
        </svg>
      );

    default:
      return null;
  }
}
