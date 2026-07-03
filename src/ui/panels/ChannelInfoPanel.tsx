// ChannelInfoPanel — IRCX channel inspector modal with three tabs:
//   Properties (live-editable TOPIC/SUBJECT/LANGUAGE/PICS via PROP),
//   Modes (current channel modes + descriptions),
//   Access (grouped OWNER/HOST/VOICE/GRANT/DENY list with add/remove).
// PROP and ACCESS lists are auto-requested whenever the target channel opens.

import { createSignal, createMemo, createEffect, on, For, Show } from 'solid-js';
import type { JSX } from 'solid-js';
import {
  buffersState, ircxState,
  requestProps, requestAccess, setProp, addAccess, removeAccess,
} from '@/state';
import {
  ACCESS_LEVELS, ACCESS_LEVEL_INFO, CHANNEL_MODE_INFO, PROP_KEY_INFO,
  type AccessLevel,
} from '@/lib/ircx/types';
import Modal from '@/ui/bits/Modal';

type Tab = 'props' | 'modes' | 'access';

const EDITABLE_KEYS = ['TOPIC', 'SUBJECT', 'LANGUAGE', 'PICS'];

function formatTimestamp(ts: number): string {
  if (!ts || ts <= 0) return '';
  const d = new Date(ts * 1000);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Access-entry lifetime in seconds → compact "3d" / "2h" / "45m" / "30s". */
function formatDuration(secs: number): string {
  if (secs <= 0) return '';
  if (secs >= 86400) return `${Math.round(secs / 86400)}d`;
  if (secs >= 3600) return `${Math.round(secs / 3600)}h`;
  if (secs >= 60) return `${Math.round(secs / 60)}m`;
  return `${secs}s`;
}

function formatPropValue(key: string, value: string): string {
  const k = key.toUpperCase();
  if (k === 'CREATION' && /^\d+$/.test(value)) return formatTimestamp(parseInt(value, 10));
  if (k === 'MEMBERCOUNT' || k === 'MEMBERLIMIT') {
    const n = parseInt(value, 10);
    if (!Number.isNaN(n)) return n.toLocaleString();
  }
  return value;
}

interface Props {
  open?: boolean;
  onClose: () => void;
}

export default function ChannelInfoPanel(props: Props) {
  const [tab, setTab] = createSignal<Tab>('props');
  const [editKey, setEditKey] = createSignal<string | null>(null);
  const [editValue, setEditValue] = createSignal('');
  const [showAddAccess, setShowAddAccess] = createSignal(false);
  const [newLevel, setNewLevel] = createSignal<AccessLevel>('HOST');
  const [newMask, setNewMask] = createSignal('');
  const [newReason, setNewReason] = createSignal('');

  const channel = createMemo(() => ircxState.channelInfoTarget);
  const chanProps = createMemo(() => {
    const ch = channel();
    return ch ? ircxState.channelProps[ch] : undefined;
  });
  const access = createMemo(() => {
    const ch = channel();
    return ch ? (ircxState.accessLists[ch] ?? []) : [];
  });

  const channelEntry = createMemo(() => {
    const ch = channel();
    if (!ch) return undefined;
    return Object.values(buffersState.buffers).find(
      (e) =>
        (e.buffer.localVars['channel'] === ch || e.buffer.shortName === ch) &&
        e.buffer.localVars['type'] === 'channel',
    );
  });
  const modes = createMemo(() => channelEntry()?.modes ?? []);

  // Auto-request PROP + ACCESS whenever the target channel changes.
  createEffect(on(channel, (ch) => {
    if (!ch) return;
    requestProps(ch);
    requestAccess(ch);
  }));

  const handleSaveProp = (): void => {
    const key = editKey();
    const ch = channel();
    if (key && ch) {
      setProp(ch, key, editValue());
      setEditKey(null);
      setEditValue('');
      setTimeout(() => requestProps(ch), 500);
    }
  };

  const handleAddAccess = (): void => {
    const ch = channel();
    if (ch && newMask().trim()) {
      addAccess(ch, newLevel(), newMask().trim(), newReason().trim() || undefined);
      setNewMask('');
      setNewReason('');
      setShowAddAccess(false);
    }
  };

  const handleRefresh = (): void => {
    const ch = channel();
    if (!ch) return;
    requestProps(ch);
    requestAccess(ch);
  };

  return (
    <Modal
      open={(props.open ?? true) && channel() !== null}
      onClose={props.onClose}
      title={channel() ?? 'Channel'}
      wide
    >
      <div class="px-4 sm:px-5 pb-4 pt-3">
        {/* Tabs + Refresh */}
        <div class="flex items-center border-b border-white/[0.06] mb-4">
          <TabBtn active={tab() === 'props'} onClick={() => setTab('props')}>Properties</TabBtn>
          <TabBtn active={tab() === 'modes'} onClick={() => setTab('modes')}>
            Modes
            <Show when={modes().length > 0}>
              <span class="ml-1.5 text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-white/[0.04] text-gray-500">
                {modes().length}
              </span>
            </Show>
          </TabBtn>
          <TabBtn active={tab() === 'access'} onClick={() => setTab('access')}>
            Access
            <Show when={access().length > 0}>
              <span class="ml-1.5 text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-white/[0.04] text-gray-500">
                {access().length}
              </span>
            </Show>
          </TabBtn>
          <div class="flex-1" />
          <button
            onClick={handleRefresh}
            title="Refresh"
            class="text-gray-500 hover:text-gray-300 p-1.5 rounded-md hover:bg-white/[0.04] transition-colors"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <path d="M1 8a7 7 0 0112.9-3.7M15 8a7 7 0 01-12.9 3.7" />
              <path d="M14 1v3.3h-3.3M2 15v-3.3h3.3" />
            </svg>
          </button>
        </div>

        {/* Properties Tab */}
        <Show when={tab() === 'props'}>
          <div class="space-y-0.5">
            <Show when={!chanProps()}>
              <div class="text-center py-8 text-gray-500 text-[12px]">Loading properties...</div>
            </Show>
            <For each={Object.entries(chanProps() ?? {})}>
              {([key, value]) => {
                const keyUpper = key.toUpperCase();
                const info = PROP_KEY_INFO[keyUpper];
                return (
                  <div class="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.02] group transition-colors">
                    <PropIcon type={info?.icon ?? 'text'} />
                    <div class="w-[90px] shrink-0 pt-0.5">
                      <span class="text-[11px] font-mono font-bold text-gray-500 uppercase tracking-wider">
                        {info?.label ?? key}
                      </span>
                    </div>
                    <Show
                      when={editKey() === key}
                      fallback={
                        <div class="flex-1 flex items-start gap-2">
                          <span class="text-[12px] text-gray-300 break-all flex-1">
                            {formatPropValue(key, value) || <span class="text-gray-600 italic">empty</span>}
                          </span>
                          <Show when={EDITABLE_KEYS.includes(keyUpper)}>
                            <button
                              onClick={() => { setEditKey(key); setEditValue(value); }}
                              class="opacity-0 group-hover:opacity-100 text-[10px] text-gray-500 hover:text-gray-300 px-2 py-0.5 rounded bg-white/[0.03] transition-all"
                            >
                              Edit
                            </button>
                          </Show>
                        </div>
                      }
                    >
                      <div class="flex-1 flex gap-2">
                        <input
                          type="text"
                          value={editValue()}
                          onInput={(e) => setEditValue(e.currentTarget.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleSaveProp(); if (e.key === 'Escape') setEditKey(null); }}
                          ref={(el) => setTimeout(() => el.focus())}
                          class="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-md text-[12px] text-gray-200 px-2 py-1 outline-none focus:border-[var(--custom-accent,#818cf8)]/40"
                        />
                        <button onClick={handleSaveProp} class="text-[11px] text-emerald-400 hover:text-emerald-300 px-2">Save</button>
                        <button onClick={() => setEditKey(null)} class="text-[11px] text-gray-500 hover:text-gray-300 px-2">Cancel</button>
                      </div>
                    </Show>
                  </div>
                );
              }}
            </For>
            <Show when={chanProps() && Object.keys(chanProps() ?? {}).length === 0}>
              <div class="text-center py-8 text-gray-500 text-[12px]">No properties found</div>
            </Show>
          </div>
        </Show>

        {/* Modes Tab */}
        <Show when={tab() === 'modes'}>
          <div class="space-y-1">
            <Show
              when={modes().length > 0}
              fallback={<div class="text-center py-8 text-gray-500 text-[12px]">No channel modes set</div>}
            >
              <div class="flex items-center gap-2 px-3 py-2 mb-2 bg-white/[0.02] rounded-lg border border-white/[0.04]">
                <span class="text-[11px] text-gray-500">Current:</span>
                <span class="text-[13px] font-mono text-gray-200">+{[...modes()].sort().join('')}</span>
              </div>
              <For each={[...modes()].sort()}>
                {(mode) => {
                  const info = CHANNEL_MODE_INFO[mode];
                  return (
                    <div class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.02] transition-colors">
                      <span class="w-6 h-6 rounded flex items-center justify-center text-[12px] font-mono font-bold bg-[var(--custom-accent,#818cf8)]/[0.1] text-[var(--custom-accent,#818cf8)]">
                        {mode}
                      </span>
                      <span class="text-[12px] text-gray-300">
                        {info?.label ?? `Mode ${mode}`}
                      </span>
                      <Show when={info?.param}>
                        <span class="text-[10px] text-gray-500 bg-white/[0.03] px-1.5 py-0.5 rounded">has parameter</span>
                      </Show>
                    </div>
                  );
                }}
              </For>
            </Show>
          </div>
        </Show>

        {/* Access List Tab */}
        <Show when={tab() === 'access'}>
          <div class="space-y-3">
            <div class="flex justify-end">
              <button
                onClick={() => setShowAddAccess(!showAddAccess())}
                class="text-[11px] font-medium text-[var(--custom-accent,#818cf8)] hover:text-[var(--custom-accent,#a5b4fc)] px-3 py-1.5 rounded-lg bg-[var(--custom-accent,#818cf8)]/[0.08] hover:bg-[var(--custom-accent,#818cf8)]/[0.12] transition-all"
              >
                {showAddAccess() ? 'Cancel' : '+ Add Entry'}
              </button>
            </div>

            <Show when={showAddAccess()}>
              <div class="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3 space-y-3">
                <div class="flex gap-2">
                  <select
                    value={newLevel()}
                    onChange={(e) => setNewLevel(e.currentTarget.value as AccessLevel)}
                    class="bg-white/[0.04] border border-white/[0.08] rounded-md text-[12px] text-gray-200 px-2 py-1.5 outline-none"
                  >
                    <For each={ACCESS_LEVELS}>
                      {(l) => <option value={l}>{ACCESS_LEVEL_INFO[l].icon} {ACCESS_LEVEL_INFO[l].label}</option>}
                    </For>
                  </select>
                  <input
                    type="text"
                    value={newMask()}
                    onInput={(e) => setNewMask(e.currentTarget.value)}
                    placeholder="nick!user@host or $a:account"
                    class="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-md text-[12px] text-gray-200 px-2 py-1.5 outline-none focus:border-[var(--custom-accent,#818cf8)]/40 placeholder-gray-600"
                  />
                </div>
                {/* Level description hint */}
                <p class="text-[10px] text-gray-500 px-1">{ACCESS_LEVEL_INFO[newLevel()].desc}</p>
                <div class="flex gap-2">
                  <input
                    type="text"
                    value={newReason()}
                    onInput={(e) => setNewReason(e.currentTarget.value)}
                    placeholder="Reason (optional)"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddAccess(); }}
                    class="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-md text-[12px] text-gray-200 px-2 py-1.5 outline-none focus:border-[var(--custom-accent,#818cf8)]/40 placeholder-gray-600"
                  />
                  <button
                    onClick={handleAddAccess}
                    disabled={!newMask().trim()}
                    class="text-[11px] font-medium bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 px-4 py-1.5 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Add
                  </button>
                </div>
              </div>
            </Show>

            <For each={ACCESS_LEVELS}>
              {(level) => {
                const entries = createMemo(() => access().filter((e) => e.level === level));
                const info = ACCESS_LEVEL_INFO[level];
                return (
                  <Show when={entries().length > 0}>
                    <div>
                      <div class="flex items-center gap-2 px-2 py-1.5">
                        <span
                          class="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold"
                          style={{ background: `${info.color}20`, color: info.color }}
                        >
                          {info.icon}
                        </span>
                        <span class="text-[11px] font-bold uppercase tracking-wider" style={{ color: info.color }}>
                          {info.label}
                        </span>
                        <span class="text-[10px] text-gray-600">{info.desc}</span>
                        <span class="text-[10px] font-mono text-gray-500 ml-auto">{entries().length}</span>
                      </div>
                      <For each={entries()}>
                        {(entry) => (
                          <div class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.02] group transition-colors ml-2">
                            <span class="text-[12px] text-gray-300 font-mono flex-1 truncate">{entry.mask}</span>
                            <Show when={entry.reason}>
                              <span class="text-[10px] text-gray-500 truncate max-w-[160px]" title={entry.reason}>{entry.reason}</span>
                            </Show>
                            <Show when={entry.setter}>
                              <span class="text-[10px] text-gray-600 shrink-0">by {entry.setter}</span>
                            </Show>
                            <Show when={entry.duration > 0}>
                              <span class="text-[10px] text-gray-600 shrink-0 tabular-nums" title="expires">
                                {formatDuration(entry.duration)}
                              </span>
                            </Show>
                            <button
                              onClick={() => { const ch = channel(); if (ch) removeAccess(ch, level, entry.mask); }}
                              class="opacity-0 group-hover:opacity-100 text-red-400/60 hover:text-red-400 transition-all p-1 shrink-0"
                              title="Remove"
                            >
                              <svg class="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                                <path d="M4 4l8 8M12 4l-8 8" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                );
              }}
            </For>

            <Show when={access().length === 0 && !showAddAccess()}>
              <div class="text-center py-8 text-gray-500 text-[12px]">No access entries</div>
            </Show>
          </div>
        </Show>
      </div>
    </Modal>
  );
}

function PropIcon(props: { type: string }): JSX.Element {
  const cls = 'w-3.5 h-3.5 text-gray-600 shrink-0 mt-0.5';
  return (
    <>
      <Show when={props.type === 'key'}>
        <svg class={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <path d="M10.5 1.5l4 4-6.5 6.5-4-4zm-6.5 9l-2.5 2.5M6 13l1 1" />
        </svg>
      </Show>
      <Show when={props.type === 'clock'}>
        <svg class={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <circle cx="8" cy="8" r="6.5" /><path d="M8 4v4l3 2" />
        </svg>
      </Show>
      <Show when={props.type === 'globe'}>
        <svg class={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <circle cx="8" cy="8" r="6.5" /><path d="M1.5 8h13M8 1.5c2 2.5 2 9.5 0 13M8 1.5c-2 2.5-2 9.5 0 13" />
        </svg>
      </Show>
      <Show when={props.type === 'users'}>
        <svg class={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <circle cx="6" cy="5" r="2.5" /><path d="M1 14c0-3 2.5-5 5-5s5 2 5 5" /><circle cx="12" cy="5" r="1.5" /><path d="M12 9c2 0 3 1.5 3 3.5" />
        </svg>
      </Show>
      <Show when={props.type === 'tag'}>
        <svg class={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <path d="M1 8.5V2.5a1 1 0 011-1h6l6.5 6.5-7 7z" /><circle cx="5" cy="5.5" r="1" fill="currentColor" />
        </svg>
      </Show>
      <Show when={props.type === 'image'}>
        <svg class={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <rect x="2" y="2" width="12" height="12" rx="2" /><circle cx="5.5" cy="5.5" r="1.5" /><path d="M14 10l-3-3-7 7" />
        </svg>
      </Show>
      <Show when={props.type === 'terminal'}>
        <svg class={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <rect x="1" y="2" width="14" height="12" rx="2" /><path d="M4 7l3 2-3 2M9 11h3" />
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

function TabBtn(props: { active: boolean; onClick: () => void; children: JSX.Element }): JSX.Element {
  return (
    <button
      onClick={() => props.onClick()}
      class={`px-4 py-2.5 text-[12px] font-medium transition-all border-b-2 -mb-px flex items-center gap-1
        ${props.active
          ? 'text-gray-100 border-[var(--custom-accent,#818cf8)]'
          : 'text-gray-500 border-transparent hover:text-gray-300 hover:border-white/[0.06]'}`}
    >
      {props.children}
    </button>
  );
}
