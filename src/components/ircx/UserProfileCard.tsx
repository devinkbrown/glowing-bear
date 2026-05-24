'use client';

import { useEffect, useState, useCallback } from 'react';
import { useStore } from '@/stores';
import { nickColor } from '@/lib/nickcolor';
import Modal from '@/components/ui/Modal';

const FIELD_LABELS: Record<string, string> = {
  URL: 'Website',
  GENDER: 'Gender',
  PICTURE: 'Avatar URL',
  LOCATION: 'Location',
  BIO: 'Bio',
  REALNAME: 'Display Name',
  EMAIL: 'Email',
  'no-video': 'Decline Video',
};

const FIELD_ICONS: Record<string, string> = {
  URL: 'link',
  LOCATION: 'pin',
  BIO: 'text',
  PICTURE: 'image',
  EMAIL: 'mail',
  GENDER: 'user',
  REALNAME: 'user',
  'no-video': 'toggle',
};

const EDITABLE_FIELDS = ['URL', 'GENDER', 'PICTURE', 'LOCATION', 'BIO', 'REALNAME', 'EMAIL'];

function getOwnNick(): string {
  const state = useStore.getState();
  const active = state.activeBuffer;
  if (!active) return '';
  const entry = state.buffers.get(active);
  if (!entry) return '';
  const nick = entry.buffer.localVars['nick'] ?? '';
  if (nick) return nick;
  const serverName = entry.buffer.localVars['server'] ?? '';
  for (const e of state.buffers.values()) {
    if (e.buffer.localVars['server'] === serverName && e.buffer.localVars['nick'])
      return e.buffer.localVars['nick'];
  }
  return '';
}

export default function UserProfileCard({ onClose }: { onClose: () => void }) {
  const userProfileTarget = useStore(s => s.userProfileTarget);
  const userProfiles = useStore(s => s.userProfiles);
  const accountMap = useStore(s => s.accountMap);
  const botNicks = useStore(s => s.botNicks);
  const requestProps = useStore(s => s.requestProps);
  const monitorList = useStore(s => s.monitorList);

  const [editField, setEditField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const nick = userProfileTarget;
  const profile = nick ? userProfiles.get(nick) : undefined;
  const account = nick ? accountMap.get(nick.toLowerCase()) : undefined;
  const isBot = nick ? botNicks.has(nick.toLowerCase()) : false;
  const color = nick ? nickColor(nick) : '';
  const isMonitored = nick ? monitorList.has(nick.toLowerCase()) : false;
  const isSelf = nick ? nick === getOwnNick() : false;

  useEffect(() => {
    if (!nick) return;
    requestProps(nick);
  }, [nick, requestProps]);

  const handleSave = useCallback(() => {
    if (editField && nick) {
      useStore.getState().setProp(nick, editField, editValue);
      setEditField(null);
      setEditValue('');
      setTimeout(() => requestProps(nick), 500);
    }
  }, [editField, editValue, nick, requestProps]);

  const handleWhisper = useCallback(() => {
    if (!nick) return;
    const state = useStore.getState();
    const active = state.activeBuffer;
    if (!active) return;
    const entry = state.buffers.get(active);
    const channel = entry?.buffer.localVars['channel'];
    if (channel) {
      const msg = prompt(`Whisper to ${nick}:`);
      if (msg) state.sendWhisper(channel, nick, msg);
    }
  }, [nick]);

  if (!nick) return null;

  return (
    <Modal onClose={onClose} title="User Profile">
      <div className="space-y-4 px-4 sm:px-5 pb-4 pt-3">
        {/* Avatar + Name header */}
        <div className="flex items-center gap-4 pb-4 border-b border-white/[0.06]">
          {profile?.picture ? (
            <img src={profile.picture} alt={nick}
              className="w-16 h-16 rounded-full object-cover border-2 border-white/[0.08]"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          ) : (
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold"
              style={{ background: `${color}20`, color, boxShadow: `0 0 20px ${color}15` }}>
              {nick.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-[16px] font-semibold text-gray-100 truncate">{nick}</h3>
              {isBot && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[var(--custom-accent,#818cf8)]/15 text-[var(--custom-accent,#818cf8)] border border-[var(--custom-accent,#818cf8)]/20">
                  BOT
                </span>
              )}
              {isSelf && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                  YOU
                </span>
              )}
            </div>
            {profile?.realname && (
              <p className="text-[13px] text-gray-400 truncate">{profile.realname}</p>
            )}
            <div className="flex items-center gap-3 mt-0.5">
              {account && (
                <p className="text-[11px] text-gray-500">
                  Account: <span className="text-gray-400 font-mono">{account}</span>
                </p>
              )}
              {isMonitored && (
                <span className="text-[10px] text-emerald-500 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Monitored
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Bio */}
        {(profile?.bio || (isSelf && editField === 'BIO')) && (
          <div className="bg-white/[0.02] rounded-xl px-4 py-3 border border-white/[0.04] group relative">
            {editField === 'BIO' ? (
              <div className="space-y-2">
                <textarea
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  rows={3}
                  autoFocus
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-md text-[12px] text-gray-200 px-2 py-1.5 outline-none focus:border-[var(--custom-accent,#818cf8)]/40 resize-none"
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setEditField(null)} className="text-[11px] text-gray-500 hover:text-gray-300 px-2">Cancel</button>
                  <button onClick={handleSave} className="text-[11px] text-emerald-400 hover:text-emerald-300 px-2">Save</button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-[13px] text-gray-300 leading-relaxed">{profile?.bio}</p>
                {isSelf && (
                  <button onClick={() => { setEditField('BIO'); setEditValue(profile?.bio ?? ''); }}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-[10px] text-gray-500 hover:text-gray-300 px-2 py-0.5 rounded bg-white/[0.04] transition-all">
                    Edit
                  </button>
                )}
              </>
            )}
          </div>
        )}
        {isSelf && !profile?.bio && editField !== 'BIO' && (
          <button onClick={() => { setEditField('BIO'); setEditValue(''); }}
            className="w-full text-center py-3 text-[11px] text-gray-500 hover:text-gray-300 bg-white/[0.02] rounded-xl border border-dashed border-white/[0.06] hover:border-white/[0.12] transition-all">
            + Add a bio
          </button>
        )}

        {/* Fields */}
        {profile && (
          <div className="space-y-0.5">
            {Object.entries(FIELD_LABELS).map(([key, label]) => {
              if (key === 'BIO') return null;
              const rawVal = key === 'URL' ? profile.url
                : key === 'GENDER' ? profile.gender
                : key === 'PICTURE' ? profile.picture
                : key === 'LOCATION' ? profile.location
                : key === 'REALNAME' ? profile.realname
                : key === 'EMAIL' ? profile.email
                : key === 'no-video' ? (profile.noVideo ? 'Yes' : undefined)
                : undefined;

              if (!rawVal && !isSelf) return null;
              if (!rawVal && !EDITABLE_FIELDS.includes(key)) return null;

              if (editField === key) {
                return (
                  <div key={key} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02]">
                    <FieldIcon type={FIELD_ICONS[key] ?? 'text'} />
                    <span className="text-[11px] text-gray-500 w-[80px] shrink-0">{label}</span>
                    <input
                      type="text"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditField(null); }}
                      autoFocus
                      className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-md text-[12px] text-gray-200 px-2 py-1 outline-none focus:border-[var(--custom-accent,#818cf8)]/40"
                    />
                    <button onClick={handleSave} className="text-[11px] text-emerald-400 hover:text-emerald-300 px-1.5">Save</button>
                    <button onClick={() => setEditField(null)} className="text-[11px] text-gray-500 hover:text-gray-300 px-1.5">Cancel</button>
                  </div>
                );
              }

              return (
                <div key={key} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.02] transition-colors group">
                  <FieldIcon type={FIELD_ICONS[key] ?? 'text'} />
                  <span className="text-[11px] text-gray-500 w-[80px] shrink-0">{label}</span>
                  {(key === 'URL' || key === 'PICTURE') && rawVal ? (
                    <a href={rawVal} target="_blank" rel="noopener noreferrer"
                      className="text-[12px] text-[var(--custom-accent,#818cf8)] hover:underline truncate flex-1">{rawVal}</a>
                  ) : rawVal ? (
                    <span className="text-[12px] text-gray-300 truncate flex-1">{rawVal}</span>
                  ) : (
                    <span className="text-[12px] text-gray-600 italic flex-1">Not set</span>
                  )}
                  {isSelf && EDITABLE_FIELDS.includes(key) && (
                    <button
                      onClick={() => { setEditField(key); setEditValue(rawVal ?? ''); }}
                      className="opacity-0 group-hover:opacity-100 text-[10px] text-gray-500 hover:text-gray-300 px-2 py-0.5 rounded bg-white/[0.03] transition-all shrink-0">
                      {rawVal ? 'Edit' : 'Set'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!profile && (
          <div className="text-center py-8 text-gray-500 text-[12px]">Loading profile...</div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t border-white/[0.06]">
          {!isSelf && (
            <ActionBtn label="Message" onClick={() => {
              useStore.getState().openQuery(nick);
              onClose();
            }} />
          )}
          <ActionBtn label="Whois" onClick={() => {
            useStore.getState().sendInput(`/whois ${nick}`);
          }} />
          {!isSelf && (
            <ActionBtn label="Whisper" onClick={handleWhisper} />
          )}
          {!isSelf && (
            <ActionBtn label={isMonitored ? 'Unmonitor' : 'Monitor'} onClick={() => {
              if (isMonitored) useStore.getState().monitorRemove(nick);
              else useStore.getState().monitorAdd(nick);
            }} accent />
          )}
          {isSelf && (
            <ActionBtn label="Refresh" onClick={() => requestProps(nick)} accent />
          )}
        </div>
      </div>
    </Modal>
  );
}

function FieldIcon({ type }: { type: string }) {
  const cls = "w-3.5 h-3.5 text-gray-600 shrink-0";
  switch (type) {
    case 'link': return (
      <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M6.5 9.5l3-3M7 10a3 3 0 01-4.24 0 3 3 0 010-4.24L4.5 4M9 6a3 3 0 014.24 0 3 3 0 010 4.24L11.5 12" />
      </svg>
    );
    case 'pin': return (
      <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M8 1.5a4 4 0 00-4 4c0 3 4 7 4 7s4-4 4-7a4 4 0 00-4-4z" /><circle cx="8" cy="5.5" r="1.5" />
      </svg>
    );
    case 'image': return (
      <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <rect x="2" y="2" width="12" height="12" rx="2" /><circle cx="5.5" cy="5.5" r="1.5" /><path d="M14 10l-3-3-7 7" />
      </svg>
    );
    case 'mail': return (
      <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <rect x="1" y="3" width="14" height="10" rx="2" /><path d="M1 3l7 5 7-5" />
      </svg>
    );
    case 'user': return (
      <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="8" cy="5" r="3" /><path d="M2 14c0-3 2.7-5 6-5s6 2 6 5" />
      </svg>
    );
    case 'toggle': return (
      <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <rect x="1" y="4" width="14" height="8" rx="4" /><circle cx="11" cy="8" r="2.5" />
      </svg>
    );
    default: return (
      <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M3 4h10M3 8h7M3 12h9" />
      </svg>
    );
  }
}

function ActionBtn({ label, onClick, accent }: { label: string; onClick: () => void; accent?: boolean }) {
  return (
    <button onClick={onClick}
      className={`flex-1 text-[12px] font-medium py-2 rounded-lg transition-all
        ${accent
          ? 'bg-[var(--custom-accent,#818cf8)]/[0.08] text-[var(--custom-accent,#818cf8)] hover:bg-[var(--custom-accent,#818cf8)]/[0.15]'
          : 'bg-white/[0.03] text-gray-400 hover:bg-white/[0.06] hover:text-gray-200'}`}>
      {label}
    </button>
  );
}
