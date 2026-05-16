'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/stores';
import { ACCESS_LEVELS, ACCESS_LEVEL_INFO, CHANNEL_MODE_INFO, PROP_KEY_INFO, type AccessLevel } from '@/protocol/ircx/types';
import Modal from '@/components/ui/Modal';

type Tab = 'props' | 'modes' | 'access';

function formatTimestamp(ts: number): string {
  if (!ts || ts <= 0) return '';
  const d = new Date(ts * 1000);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatPropValue(key: string, value: string): string {
  const k = key.toUpperCase();
  if (k === 'CREATION' && /^\d+$/.test(value)) return formatTimestamp(parseInt(value, 10));
  if (k === 'MEMBERCOUNT' || k === 'MEMBERLIMIT') return parseInt(value, 10).toLocaleString();
  return value;
}

export default function ChannelInfoPanel({ onClose }: { onClose: () => void }) {
  const channelInfoTarget = useStore(s => s.channelInfoTarget);
  const channelProps = useStore(s => s.channelProps);
  const accessLists = useStore(s => s.accessLists);
  const requestProps = useStore(s => s.requestProps);
  const requestAccess = useStore(s => s.requestAccess);
  const setProp = useStore(s => s.setProp);
  const addAccess = useStore(s => s.addAccess);
  const removeAccess = useStore(s => s.removeAccess);
  const buffers = useStore(s => s.buffers);

  const [tab, setTab] = useState<Tab>('props');
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showAddAccess, setShowAddAccess] = useState(false);
  const [newLevel, setNewLevel] = useState<AccessLevel>('HOST');
  const [newMask, setNewMask] = useState('');
  const [newReason, setNewReason] = useState('');

  const channel = channelInfoTarget;
  const props = channel ? channelProps.get(channel) : undefined;
  const access = channel ? (accessLists.get(channel) ?? []) : [];

  const channelEntry = channel
    ? Array.from(buffers.values()).find(e =>
        (e.buffer.localVars['channel'] === channel || e.buffer.shortName === channel) &&
        e.buffer.localVars['type'] === 'channel')
    : undefined;
  const modes = channelEntry?.modes ?? new Set<string>();

  useEffect(() => {
    if (!channel) return;
    requestProps(channel);
    requestAccess(channel);
  }, [channel, requestProps, requestAccess]);

  const handleSaveProp = useCallback(() => {
    if (editKey && channel) {
      setProp(channel, editKey, editValue);
      setEditKey(null);
      setEditValue('');
      setTimeout(() => requestProps(channel), 500);
    }
  }, [editKey, editValue, channel, setProp, requestProps]);

  const handleAddAccess = useCallback(() => {
    if (channel && newMask.trim()) {
      addAccess(channel, newLevel, newMask.trim(), newReason.trim() || undefined);
      setNewMask('');
      setNewReason('');
      setShowAddAccess(false);
    }
  }, [channel, newLevel, newMask, newReason, addAccess]);

  const handleRefresh = useCallback(() => {
    if (!channel) return;
    requestProps(channel);
    requestAccess(channel);
  }, [channel, requestProps, requestAccess]);

  const editableKeys = ['TOPIC', 'SUBJECT', 'LANGUAGE', 'PICS'];

  if (!channel) return null;

  return (
    <Modal onClose={onClose} title={channel} wide>
      <div className="px-4 sm:px-5 pb-4 pt-3">
        {/* Tabs + Refresh */}
        <div className="flex items-center border-b border-white/[0.06] mb-4">
          <TabBtn active={tab === 'props'} onClick={() => setTab('props')}>Properties</TabBtn>
          <TabBtn active={tab === 'modes'} onClick={() => setTab('modes')}>
            Modes
            {modes.size > 0 && (
              <span className="ml-1.5 text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-white/[0.04] text-gray-500">
                {modes.size}
              </span>
            )}
          </TabBtn>
          <TabBtn active={tab === 'access'} onClick={() => setTab('access')}>
            Access
            {access.length > 0 && (
              <span className="ml-1.5 text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-white/[0.04] text-gray-500">
                {access.length}
              </span>
            )}
          </TabBtn>
          <div className="flex-1" />
          <button onClick={handleRefresh} title="Refresh"
            className="text-gray-500 hover:text-gray-300 p-1.5 rounded-md hover:bg-white/[0.04] transition-colors">
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M1 8a7 7 0 0112.9-3.7M15 8a7 7 0 01-12.9 3.7" />
              <path d="M14 1v3.3h-3.3M2 15v-3.3h3.3" />
            </svg>
          </button>
        </div>

        {/* Properties Tab */}
        {tab === 'props' && (
          <div className="space-y-0.5">
            {!props && (
              <div className="text-center py-8 text-gray-500 text-[12px]">Loading properties...</div>
            )}
            {props && Array.from(props.entries()).map(([key, value]) => {
              const keyUpper = key.toUpperCase();
              const info = PROP_KEY_INFO[keyUpper];
              const displayValue = formatPropValue(key, value);
              return (
                <div key={key} className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.02] group transition-colors">
                  <PropIcon type={info?.icon ?? 'text'} />
                  <div className="w-[90px] shrink-0 pt-0.5">
                    <span className="text-[11px] font-mono font-bold text-gray-500 uppercase tracking-wider">
                      {info?.label ?? key}
                    </span>
                  </div>
                  {editKey === key ? (
                    <div className="flex-1 flex gap-2">
                      <input
                        type="text"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveProp(); if (e.key === 'Escape') setEditKey(null); }}
                        autoFocus
                        className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-md text-[12px] text-gray-200 px-2 py-1 outline-none focus:border-[var(--custom-accent,#818cf8)]/40"
                      />
                      <button onClick={handleSaveProp} className="text-[11px] text-emerald-400 hover:text-emerald-300 px-2">Save</button>
                      <button onClick={() => setEditKey(null)} className="text-[11px] text-gray-500 hover:text-gray-300 px-2">Cancel</button>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-start gap-2">
                      <span className="text-[12px] text-gray-300 break-all flex-1">
                        {displayValue || <span className="text-gray-600 italic">empty</span>}
                      </span>
                      {editableKeys.includes(keyUpper) && (
                        <button
                          onClick={() => { setEditKey(key); setEditValue(value); }}
                          className="opacity-0 group-hover:opacity-100 text-[10px] text-gray-500 hover:text-gray-300 px-2 py-0.5 rounded bg-white/[0.03] transition-all">
                          Edit
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {props && props.size === 0 && (
              <div className="text-center py-8 text-gray-500 text-[12px]">No properties found</div>
            )}
          </div>
        )}

        {/* Modes Tab */}
        {tab === 'modes' && (
          <div className="space-y-1">
            {modes.size === 0 ? (
              <div className="text-center py-8 text-gray-500 text-[12px]">No channel modes set</div>
            ) : (
              <>
                <div className="flex items-center gap-2 px-3 py-2 mb-2 bg-white/[0.02] rounded-lg border border-white/[0.04]">
                  <span className="text-[11px] text-gray-500">Current:</span>
                  <span className="text-[13px] font-mono text-gray-200">+{Array.from(modes).sort().join('')}</span>
                </div>
                {Array.from(modes).sort().map(mode => {
                  const info = CHANNEL_MODE_INFO[mode];
                  return (
                    <div key={mode} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.02] transition-colors">
                      <span className="w-6 h-6 rounded flex items-center justify-center text-[12px] font-mono font-bold bg-[var(--custom-accent,#818cf8)]/[0.1] text-[var(--custom-accent,#818cf8)]">
                        {mode}
                      </span>
                      <span className="text-[12px] text-gray-300">
                        {info?.label ?? `Mode ${mode}`}
                      </span>
                      {info?.param && (
                        <span className="text-[10px] text-gray-500 bg-white/[0.03] px-1.5 py-0.5 rounded">has parameter</span>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* Access List Tab */}
        {tab === 'access' && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <button
                onClick={() => setShowAddAccess(!showAddAccess)}
                className="text-[11px] font-medium text-[var(--custom-accent,#818cf8)] hover:text-[var(--custom-accent,#a5b4fc)] px-3 py-1.5 rounded-lg bg-[var(--custom-accent,#818cf8)]/[0.08] hover:bg-[var(--custom-accent,#818cf8)]/[0.12] transition-all">
                {showAddAccess ? 'Cancel' : '+ Add Entry'}
              </button>
            </div>

            {showAddAccess && (
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3 space-y-3">
                <div className="flex gap-2">
                  <select
                    value={newLevel}
                    onChange={e => setNewLevel(e.target.value as AccessLevel)}
                    className="bg-white/[0.04] border border-white/[0.08] rounded-md text-[12px] text-gray-200 px-2 py-1.5 outline-none">
                    {ACCESS_LEVELS.map(l => {
                      const info = ACCESS_LEVEL_INFO[l];
                      return <option key={l} value={l}>{info.icon} {info.label}</option>;
                    })}
                  </select>
                  <input
                    type="text"
                    value={newMask}
                    onChange={e => setNewMask(e.target.value)}
                    placeholder="nick!user@host or $a:account"
                    className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-md text-[12px] text-gray-200 px-2 py-1.5 outline-none focus:border-[var(--custom-accent,#818cf8)]/40 placeholder-gray-600"
                  />
                </div>
                {/* Level description hint */}
                <p className="text-[10px] text-gray-500 px-1">{ACCESS_LEVEL_INFO[newLevel].desc}</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newReason}
                    onChange={e => setNewReason(e.target.value)}
                    placeholder="Reason (optional)"
                    onKeyDown={e => { if (e.key === 'Enter') handleAddAccess(); }}
                    className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-md text-[12px] text-gray-200 px-2 py-1.5 outline-none focus:border-[var(--custom-accent,#818cf8)]/40 placeholder-gray-600"
                  />
                  <button onClick={handleAddAccess}
                    disabled={!newMask.trim()}
                    className="text-[11px] font-medium bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 px-4 py-1.5 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                    Add
                  </button>
                </div>
              </div>
            )}

            {ACCESS_LEVELS.map(level => {
              const entries = access.filter(e => e.level === level);
              if (entries.length === 0) return null;
              const info = ACCESS_LEVEL_INFO[level];
              return (
                <div key={level}>
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <span className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold"
                      style={{ background: `${info.color}20`, color: info.color }}>{info.icon}</span>
                    <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: info.color }}>
                      {info.label}
                    </span>
                    <span className="text-[10px] text-gray-600">{info.desc}</span>
                    <span className="text-[10px] font-mono text-gray-500 ml-auto">{entries.length}</span>
                  </div>
                  {entries.map((entry, i) => (
                    <div key={`${entry.mask}-${i}`}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.02] group transition-colors ml-2">
                      <span className="text-[12px] text-gray-300 font-mono flex-1 truncate">{entry.mask}</span>
                      {entry.reason && (
                        <span className="text-[10px] text-gray-500 truncate max-w-[160px]" title={entry.reason}>{entry.reason}</span>
                      )}
                      {entry.setter && (
                        <span className="text-[10px] text-gray-600 shrink-0">by {entry.setter}</span>
                      )}
                      {entry.timestamp > 0 && (
                        <span className="text-[10px] text-gray-600 shrink-0 tabular-nums">{formatTimestamp(entry.timestamp)}</span>
                      )}
                      <button
                        onClick={() => removeAccess(channel, level, entry.mask)}
                        className="opacity-0 group-hover:opacity-100 text-red-400/60 hover:text-red-400 transition-all p-1 shrink-0"
                        title="Remove">
                        <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M4 4l8 8M12 4l-8 8" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              );
            })}

            {access.length === 0 && !showAddAccess && (
              <div className="text-center py-8 text-gray-500 text-[12px]">No access entries</div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function PropIcon({ type }: { type: string }) {
  const cls = "w-3.5 h-3.5 text-gray-600 shrink-0 mt-0.5";
  switch (type) {
    case 'key': return (
      <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M10.5 1.5l4 4-6.5 6.5-4-4zm-6.5 9l-2.5 2.5M6 13l1 1" />
      </svg>
    );
    case 'clock': return (
      <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="8" cy="8" r="6.5" /><path d="M8 4v4l3 2" />
      </svg>
    );
    case 'globe': return (
      <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="8" cy="8" r="6.5" /><path d="M1.5 8h13M8 1.5c2 2.5 2 9.5 0 13M8 1.5c-2 2.5-2 9.5 0 13" />
      </svg>
    );
    case 'users': return (
      <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="6" cy="5" r="2.5" /><path d="M1 14c0-3 2.5-5 5-5s5 2 5 5" /><circle cx="12" cy="5" r="1.5" /><path d="M12 9c2 0 3 1.5 3 3.5" />
      </svg>
    );
    case 'tag': return (
      <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M1 8.5V2.5a1 1 0 011-1h6l6.5 6.5-7 7z" /><circle cx="5" cy="5.5" r="1" fill="currentColor" />
      </svg>
    );
    case 'image': return (
      <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <rect x="2" y="2" width="12" height="12" rx="2" /><circle cx="5.5" cy="5.5" r="1.5" /><path d="M14 10l-3-3-7 7" />
      </svg>
    );
    case 'terminal': return (
      <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <rect x="1" y="2" width="14" height="12" rx="2" /><path d="M4 7l3 2-3 2M9 11h3" />
      </svg>
    );
    default: return (
      <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M3 4h10M3 8h7M3 12h9" />
      </svg>
    );
  }
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-[12px] font-medium transition-all border-b-2 -mb-px flex items-center gap-1
        ${active
          ? 'text-gray-100 border-[var(--custom-accent,#818cf8)]'
          : 'text-gray-500 border-transparent hover:text-gray-300 hover:border-white/[0.06]'}`}>
      {children}
    </button>
  );
}
