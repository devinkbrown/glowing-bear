// UserProfileCard — IRCX user profile modal (PROP-backed). Shows avatar
// (PICTURE prop) or nick-color initials, bot/YOU badges, account line and
// monitored status; own profile fields (URL/GENDER/PICTURE/LOCATION/BIO/
// REALNAME/EMAIL) are editable via PROP. Auto-requests PROP on open.

import { createSignal, createMemo, createEffect, on, onCleanup, For, Show } from 'solid-js';
import type { JSX } from 'solid-js';
import {
  buffersState, ircxState, settings,
  requestProps, setProp, openQuery, sendInput, sendWhisper,
  monitorAdd, monitorRemove,
} from '@/state';
import { nickColor } from '@/lib/nickcolor';
import Modal from '@/ui/bits/Modal';

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

/**
 * True only when `value` is an absolute http(s) URL. Profile URL/PICTURE
 * fields are attacker-controlled (set via IRCX METADATA/WHOIS), so they must
 * never reach an `<a href>` / `<img src>` unless the scheme is safe — a
 * `javascript:` URI executes on click and `rel="noopener noreferrer"` does not
 * stop it. Fail closed: anything that is not clearly http(s) renders as inert
 * plain text instead. Whitespace/control-char scheme obfuscation is neutralised
 * because the URL parser normalises those away before we read the protocol.
 */
export function isSafeProfileUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** Own nick on the active buffer's server (falls back to any sibling buffer). */
function ownNick(): string {
  const active = buffersState.activeBuffer;
  if (!active) return '';
  const entry = buffersState.buffers[active];
  if (!entry) return '';
  const nick = entry.buffer.localVars['nick'] ?? '';
  if (nick) return nick;
  const serverName = entry.buffer.localVars['server'] ?? '';
  for (const e of Object.values(buffersState.buffers)) {
    if (e.buffer.localVars['server'] === serverName && e.buffer.localVars['nick']) {
      return e.buffer.localVars['nick'] ?? '';
    }
  }
  return '';
}

interface Props {
  open?: boolean;
  onClose: () => void;
}

export default function UserProfileCard(props: Props) {
  const [editField, setEditField] = createSignal<string | null>(null);
  const [editValue, setEditValue] = createSignal('');
  let propsRefreshTimer: ReturnType<typeof setTimeout> | undefined;

  const nick = createMemo(() => ircxState.userProfileTarget);
  const profile = createMemo(() => {
    const n = nick();
    return n ? ircxState.userProfiles[n] : undefined;
  });
  const account = createMemo(() => {
    const n = nick();
    return n ? ircxState.accountMap[n.toLowerCase()] : undefined;
  });
  const isBotNick = createMemo(() => {
    const n = nick();
    return n ? !!ircxState.botNicks[n.toLowerCase()] : false;
  });
  const isMonitored = createMemo(() => {
    const n = nick();
    return n ? !!ircxState.monitorList[n.toLowerCase()] : false;
  });
  const color = createMemo(() => {
    const n = nick();
    return n ? nickColor(n) : '';
  });
  const isSelf = createMemo(() => {
    const n = nick();
    return n ? n === ownNick() : false;
  });

  // Auto-request PROP whenever the target nick changes.
  createEffect(on(nick, (n) => {
    if (n) requestProps(n);
  }));

  onCleanup(() => {
    if (propsRefreshTimer) clearTimeout(propsRefreshTimer);
  });

  const schedulePropsRefresh = (n: string): void => {
    if (propsRefreshTimer) clearTimeout(propsRefreshTimer);
    propsRefreshTimer = setTimeout(() => {
      propsRefreshTimer = undefined;
      if (nick() === n) requestProps(n);
    }, 500);
  };

  const fieldValue = (key: string): string | undefined => {
    const p = profile();
    if (!p) return undefined;
    switch (key) {
      case 'URL': return p.url;
      case 'GENDER': return p.gender;
      case 'PICTURE': return p.picture;
      case 'LOCATION': return p.location;
      case 'REALNAME': return p.realname;
      case 'EMAIL': return p.email;
      case 'no-video': return p.noVideo ? 'Yes' : undefined;
      default: return undefined;
    }
  };

  const handleSave = (): void => {
    const field = editField();
    const n = nick();
    if (field && n) {
      if (!setProp(n, field, editValue())) return;
      setEditField(null);
      setEditValue('');
      schedulePropsRefresh(n);
    }
  };

  const handleWhisper = (): void => {
    const n = nick();
    if (!n) return;
    const active = buffersState.activeBuffer;
    if (!active) return;
    const channel = buffersState.buffers[active]?.buffer.localVars['channel'];
    if (channel) {
      const msg = prompt(`Whisper to ${n}:`);
      if (msg) sendWhisper(channel, n, msg);
    }
  };

  return (
    <Modal
      open={(props.open ?? true) && nick() !== null}
      onClose={props.onClose}
      title="User Profile"
    >
      <Show when={nick()}>
        {(n) => (
          <div class="space-y-4 px-4 sm:px-5 pb-4 pt-3">
            {/* Avatar + Name header */}
            <div class="flex items-center gap-4 pb-4 border-b border-white/[0.06]">
              <Show
                when={settings.inlineImages && isSafeProfileUrl(profile()?.picture)}
                fallback={
                  <div
                    class="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold"
                    style={{ background: `${color()}20`, color: color(), 'box-shadow': `0 0 20px ${color()}15` }}
                  >
                    {n().slice(0, 2).toUpperCase()}
                  </div>
                }
              >
                <img
                  src={profile()?.picture}
                  alt={n()}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  class="w-16 h-16 rounded-full object-cover border-2 border-white/[0.08]"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </Show>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <h3 class="text-[16px] font-semibold text-gray-100 truncate">{n()}</h3>
                  <Show when={isBotNick()}>
                    <span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[var(--custom-accent,#818cf8)]/15 text-[var(--custom-accent,#818cf8)] border border-[var(--custom-accent,#818cf8)]/20">
                      BOT
                    </span>
                  </Show>
                  <Show when={isSelf()}>
                    <span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                      YOU
                    </span>
                  </Show>
                </div>
                <Show when={profile()?.realname}>
                  <p class="text-[13px] text-gray-400 truncate">{profile()?.realname}</p>
                </Show>
                <div class="flex items-center gap-3 mt-0.5">
                  <Show when={account()}>
                    <p class="text-[11px] text-gray-500">
                      Account: <span class="text-gray-400 font-mono">{account()}</span>
                    </p>
                  </Show>
                  <Show when={isMonitored()}>
                    <span class="text-[10px] text-emerald-500 flex items-center gap-1">
                      <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Monitored
                    </span>
                  </Show>
                </div>
              </div>
            </div>

            {/* Bio */}
            <Show when={profile()?.bio || (isSelf() && editField() === 'BIO')}>
              <div class="bg-white/[0.02] rounded-xl px-4 py-3 border border-white/[0.04] group relative">
                <Show
                  when={editField() === 'BIO'}
                  fallback={
                    <>
                      <p class="text-[13px] text-gray-300 leading-relaxed">{profile()?.bio}</p>
                      <Show when={isSelf()}>
                        <button
                          onClick={() => { setEditField('BIO'); setEditValue(profile()?.bio ?? ''); }}
                          class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-[10px] text-gray-500 hover:text-gray-300 px-2 py-0.5 rounded bg-white/[0.04] transition-all"
                        >
                          Edit
                        </button>
                      </Show>
                    </>
                  }
                >
                  <div class="space-y-2">
                    <textarea
                      value={editValue()}
                      onInput={(e) => setEditValue(e.currentTarget.value)}
                      rows={3}
                      ref={(el) => setTimeout(() => el.focus())}
                      class="w-full bg-white/[0.04] border border-white/[0.08] rounded-md text-[12px] text-gray-200 px-2 py-1.5 outline-none focus:border-[var(--custom-accent,#818cf8)]/40 resize-none"
                    />
                    <div class="flex gap-2 justify-end">
                      <button onClick={() => setEditField(null)} class="text-[11px] text-gray-500 hover:text-gray-300 px-2">Cancel</button>
                      <button onClick={handleSave} class="text-[11px] text-emerald-400 hover:text-emerald-300 px-2">Save</button>
                    </div>
                  </div>
                </Show>
              </div>
            </Show>
            <Show when={isSelf() && !profile()?.bio && editField() !== 'BIO'}>
              <button
                onClick={() => { setEditField('BIO'); setEditValue(''); }}
                class="w-full text-center py-3 text-[11px] text-gray-500 hover:text-gray-300 bg-white/[0.02] rounded-xl border border-dashed border-white/[0.06] hover:border-white/[0.12] transition-all"
              >
                + Add a bio
              </button>
            </Show>

            {/* Fields */}
            <Show when={profile()}>
              <div class="space-y-0.5">
                <For each={Object.entries(FIELD_LABELS)}>
                  {([key, label]) => {
                    if (key === 'BIO') return null;
                    const rawVal = createMemo(() => fieldValue(key));
                    const visible = createMemo(() => {
                      if (rawVal()) return true;
                      if (!isSelf()) return false;
                      return EDITABLE_FIELDS.includes(key);
                    });
                    return (
                      <Show when={visible()}>
                        <Show
                          when={editField() === key}
                          fallback={
                            <div class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.02] transition-colors group">
                              <FieldIcon type={FIELD_ICONS[key] ?? 'text'} />
                              <span class="text-[11px] text-gray-500 w-[80px] shrink-0">{label}</span>
                              <Show
                                when={(key === 'URL' || key === 'PICTURE') && isSafeProfileUrl(rawVal())}
                                fallback={
                                  <Show
                                    when={rawVal()}
                                    fallback={<span class="text-[12px] text-gray-600 italic flex-1">Not set</span>}
                                  >
                                    <span class="text-[12px] text-gray-300 truncate flex-1">{rawVal()}</span>
                                  </Show>
                                }
                              >
                                <a
                                  href={rawVal()}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  class="text-[12px] text-[var(--custom-accent,#818cf8)] hover:underline truncate flex-1"
                                >
                                  {rawVal()}
                                </a>
                              </Show>
                              <Show when={isSelf() && EDITABLE_FIELDS.includes(key)}>
                                <button
                                  onClick={() => { setEditField(key); setEditValue(rawVal() ?? ''); }}
                                  class="opacity-0 group-hover:opacity-100 text-[10px] text-gray-500 hover:text-gray-300 px-2 py-0.5 rounded bg-white/[0.03] transition-all shrink-0"
                                >
                                  {rawVal() ? 'Edit' : 'Set'}
                                </button>
                              </Show>
                            </div>
                          }
                        >
                          <div class="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02]">
                            <FieldIcon type={FIELD_ICONS[key] ?? 'text'} />
                            <span class="text-[11px] text-gray-500 w-[80px] shrink-0">{label}</span>
                            <input
                              type="text"
                              value={editValue()}
                              onInput={(e) => setEditValue(e.currentTarget.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditField(null); }}
                              ref={(el) => setTimeout(() => el.focus())}
                              class="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-md text-[12px] text-gray-200 px-2 py-1 outline-none focus:border-[var(--custom-accent,#818cf8)]/40"
                            />
                            <button onClick={handleSave} class="text-[11px] text-emerald-400 hover:text-emerald-300 px-1.5">Save</button>
                            <button onClick={() => setEditField(null)} class="text-[11px] text-gray-500 hover:text-gray-300 px-1.5">Cancel</button>
                          </div>
                        </Show>
                      </Show>
                    );
                  }}
                </For>
              </div>
            </Show>

            <Show when={!profile()}>
              <div class="text-center py-8 text-gray-500 text-[12px]">Loading profile...</div>
            </Show>

            {/* Actions */}
            <div class="flex gap-2 pt-2 border-t border-white/[0.06]">
              <Show when={!isSelf()}>
                <ActionBtn label="Message" onClick={() => { openQuery(n()); props.onClose(); }} />
              </Show>
              <ActionBtn label="Whois" onClick={() => sendInput(`/whois ${n()}`)} />
              <Show when={!isSelf()}>
                <ActionBtn label="Whisper" onClick={handleWhisper} />
              </Show>
              <Show when={!isSelf()}>
                <ActionBtn
                  label={isMonitored() ? 'Unmonitor' : 'Monitor'}
                  onClick={() => { if (isMonitored()) monitorRemove(n()); else monitorAdd(n()); }}
                  accent
                />
              </Show>
              <Show when={isSelf()}>
                <ActionBtn label="Refresh" onClick={() => requestProps(n())} accent />
              </Show>
            </div>
          </div>
        )}
      </Show>
    </Modal>
  );
}

function FieldIcon(props: { type: string }): JSX.Element {
  const cls = 'w-3.5 h-3.5 text-gray-600 shrink-0';
  return (
    <>
      <Show when={props.type === 'link'}>
        <svg class={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <path d="M6.5 9.5l3-3M7 10a3 3 0 01-4.24 0 3 3 0 010-4.24L4.5 4M9 6a3 3 0 014.24 0 3 3 0 010 4.24L11.5 12" />
        </svg>
      </Show>
      <Show when={props.type === 'pin'}>
        <svg class={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <path d="M8 1.5a4 4 0 00-4 4c0 3 4 7 4 7s4-4 4-7a4 4 0 00-4-4z" /><circle cx="8" cy="5.5" r="1.5" />
        </svg>
      </Show>
      <Show when={props.type === 'image'}>
        <svg class={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <rect x="2" y="2" width="12" height="12" rx="2" /><circle cx="5.5" cy="5.5" r="1.5" /><path d="M14 10l-3-3-7 7" />
        </svg>
      </Show>
      <Show when={props.type === 'mail'}>
        <svg class={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <rect x="1" y="3" width="14" height="10" rx="2" /><path d="M1 3l7 5 7-5" />
        </svg>
      </Show>
      <Show when={props.type === 'user'}>
        <svg class={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <circle cx="8" cy="5" r="3" /><path d="M2 14c0-3 2.7-5 6-5s6 2 6 5" />
        </svg>
      </Show>
      <Show when={props.type === 'toggle'}>
        <svg class={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <rect x="1" y="4" width="14" height="8" rx="4" /><circle cx="11" cy="8" r="2.5" />
        </svg>
      </Show>
      <Show when={props.type === 'text'}>
        <svg class={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <path d="M3 4h10M3 8h7M3 12h9" />
        </svg>
      </Show>
    </>
  );
}

function ActionBtn(props: { label: string; onClick: () => void; accent?: boolean }): JSX.Element {
  return (
    <button
      onClick={() => props.onClick()}
      class={`flex-1 text-[12px] font-medium py-2 rounded-lg transition-all
        ${props.accent
          ? 'bg-[var(--custom-accent,#818cf8)]/[0.08] text-[var(--custom-accent,#818cf8)] hover:bg-[var(--custom-accent,#818cf8)]/[0.15]'
          : 'bg-white/[0.03] text-gray-400 hover:bg-white/[0.06] hover:text-gray-200'}`}
    >
      {props.label}
    </button>
  );
}
