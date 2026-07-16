// ChannelListModal — in-app LIST/LISTX channel browser.

import { For, Show, createEffect, createMemo, createSignal } from 'solid-js';
import type { JSX } from 'solid-js';
import { buffersState, ircxState, requestChannelList, sendInput } from '@/state';
import Modal from '@/ui/bits/Modal';
import { formatDate } from '@/lib/i18n';

interface Props {
  open?: boolean;
  onClose: () => void;
}

export default function ChannelListModal(props: Props) {
  const [pattern, setPattern] = createSignal('');
  const [minUsers, setMinUsers] = createSignal('');
  const [maxUsers, setMaxUsers] = createSignal('');
  const [createName, setCreateName] = createSignal('');
  // A CREATE may be accepted while the immediately following JOIN loses a
  // socket race. Remember that partial success so retry does not issue CREATE
  // twice; the modal stays open until JOIN itself is accepted.
  const [createdPendingJoin, setCreatedPendingJoin] = createSignal('');

  createEffect(() => {
    if (props.open && ircxState.channelList.status === 'idle') requestChannelList();
  });

  const joined = createMemo(() => {
    const out: Record<string, true> = {};
    for (const entry of Object.values(buffersState.buffers)) {
      if (entry.buffer.localVars['type'] !== 'channel') continue;
      const ch = entry.buffer.localVars['channel'] ?? entry.buffer.shortName ?? '';
      if (ch) out[ch.toLowerCase()] = true;
    }
    return out;
  });

  const rows = createMemo(() => {
    const q = pattern().trim().toLowerCase().replace(/^\*/, '').replace(/\*$/, '');
    const min = Number.parseInt(minUsers().trim(), 10);
    const max = Number.parseInt(maxUsers().trim(), 10);
    return [...ircxState.channelList.rows]
      .filter((row) => {
        if (q && !row.channel.toLowerCase().includes(q) && !row.topic.toLowerCase().includes(q)) return false;
        if (Number.isFinite(min) && row.users < min) return false;
        if (Number.isFinite(max) && row.users > max) return false;
        return true;
      })
      .sort((a, b) => b.users - a.users || a.channel.localeCompare(b.channel));
  });

  const totalUsers = createMemo(() => rows().reduce((sum, row) => sum + row.users, 0));
  const loading = () => ircxState.channelList.status === 'loading';

  const search = (extended = false) => {
    requestChannelList({
      pattern: pattern(),
      minUsers: minUsers(),
      maxUsers: maxUsers(),
      extended,
    });
  };

  const join = (channel: string) => {
    if (sendInput(`/join ${channel}`)) props.onClose();
  };

  const createChannel = () => {
    let ch = createName().trim();
    if (!ch) return;
    if (!ch.startsWith('#') && !ch.startsWith('&')) ch = `#${ch}`;
    if (createdPendingJoin() !== ch) {
      if (!sendInput(`/quote CREATE ${ch}`)) return;
      setCreatedPendingJoin(ch);
    }
    if (!sendInput(`/join ${ch}`)) return;
    setCreatedPendingJoin('');
    setCreateName('');
    props.onClose();
  };

  return (
    <Modal
      open={props.open ?? true}
      onClose={props.onClose}
      title="Channels"
      width="min(920px, 96vw)"
      maxHeight="88dvh"
    >
      <div class="flex max-h-[calc(88dvh-60px)] min-h-[520px] flex-col bg-gray-950/40">
        <div class="border-b border-white/[0.06] px-4 py-3 sm:px-5">
          <div class="grid gap-2 sm:grid-cols-[1fr_96px_96px_auto]">
            <Input
              label="Search"
              placeholder="#chat or topic"
              value={pattern()}
              onChange={setPattern}
              onEnter={() => search(false)}
            />
            <Input label="Min" placeholder="0" value={minUsers()} onChange={setMinUsers} onEnter={() => search(false)} />
            <Input label="Max" placeholder="999" value={maxUsers()} onChange={setMaxUsers} onEnter={() => search(false)} />
            <div class="flex items-end gap-2">
              <button
                onClick={() => search(false)}
                class="h-10 rounded-lg bg-[var(--custom-accent,#818cf8)] px-4 text-[12px] font-semibold text-white shadow-lg shadow-black/20 transition-colors hover:brightness-110 disabled:opacity-60"
                disabled={loading()}
              >
                {loading() ? 'Loading' : 'Refresh'}
              </button>
              <button
                onClick={() => search(true)}
                class="h-10 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-[12px] font-semibold text-gray-300 transition-colors hover:bg-white/[0.08] hover:text-gray-100 disabled:opacity-60"
                disabled={loading()}
                title="Use Orochi LISTX"
              >
                LISTX
              </button>
            </div>
          </div>
          <div class="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500">
            <div class="flex items-center gap-2">
              <StatusDot loading={loading()} />
              <span>
                {rows().length} channel{rows().length === 1 ? '' : 's'}
                <Show when={rows().length > 0}> / {totalUsers()} users</Show>
              </span>
              <Show when={ircxState.channelList.extended}>
                <span class="rounded bg-emerald-400/10 px-1.5 py-0.5 text-emerald-300">LISTX</span>
              </Show>
            </div>
            <Show when={ircxState.channelList.updatedAt}>
              {(ts) => <span class="font-mono">updated {formatDate(ts(), { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}
            </Show>
          </div>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto">
          <Show
            when={rows().length > 0}
            fallback={
              <div class="flex h-full min-h-[260px] flex-col items-center justify-center px-6 text-center">
                <div class="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-gray-500">
                  <ChannelIcon />
                </div>
                <div class="text-[14px] font-semibold text-gray-200">
                  {loading() ? 'Scanning channels' : 'No channels matched'}
                </div>
                <p class="mt-1 max-w-sm text-[12px] leading-relaxed text-gray-500">
                  {loading() ? 'Waiting for LIST replies from the active network.' : 'Clear the filters or refresh the list.'}
                </p>
              </div>
            }
          >
            <div class="divide-y divide-white/[0.04]">
              <For each={rows()}>
                {(row) => {
                  const isJoined = () => !!joined()[row.channel.toLowerCase()];
                  return (
                    <div class="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 transition-colors hover:bg-white/[0.025] sm:grid-cols-[minmax(160px,220px)_88px_1fr_auto] sm:px-5">
                      <div class="min-w-0">
                        <div class="flex items-center gap-2">
                          <span class="truncate font-mono text-[13px] font-semibold text-gray-100">{row.channel}</span>
                          <Show when={isJoined()}>
                            <span class="rounded bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">joined</span>
                          </Show>
                        </div>
                        <Show when={row.modes}>
                          <div class="mt-1 truncate font-mono text-[10px] text-gray-600">{row.modes}</div>
                        </Show>
                      </div>
                      <div class="hidden items-center sm:flex">
                        <span class="rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-1 font-mono text-[11px] text-gray-300">
                          {row.users} users
                        </span>
                      </div>
                      <div class="col-span-2 min-w-0 text-[12px] leading-relaxed text-gray-400 sm:col-span-1">
                        <span class="line-clamp-2 break-words">{row.topic || 'No topic set'}</span>
                      </div>
                      <div class="flex items-start justify-end">
                        <button
                          onClick={() => join(row.channel)}
                          class="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-gray-200 transition-colors hover:border-[var(--custom-accent,#818cf8)]/30 hover:bg-[var(--custom-accent,#818cf8)]/10 hover:text-white"
                        >
                          {isJoined() ? 'Open' : 'Join'}
                        </button>
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>
          </Show>
        </div>

        <div class="border-t border-white/[0.06] bg-gray-950/70 px-4 py-3 sm:px-5">
          <div class="flex flex-col gap-2 sm:flex-row">
            <Input
              label="Create"
              placeholder="#new-channel"
              value={createName()}
              onChange={setCreateName}
              onEnter={createChannel}
            />
            <button
              onClick={createChannel}
              disabled={!createName().trim()}
              class="h-10 self-end rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-4 text-[12px] font-semibold text-emerald-100 transition-colors hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Create
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Input(props: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
}): JSX.Element {
  return (
    <label class="block min-w-0">
      <span class="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">{props.label}</span>
      <input
        type="text"
        value={props.value}
        onInput={(e) => props.onChange(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') props.onEnter?.();
        }}
        placeholder={props.placeholder}
        class="h-10 w-full rounded-lg border border-white/[0.08] bg-black/20 px-3 text-[13px] text-gray-100 outline-none transition-colors placeholder:text-gray-600 focus:border-[var(--custom-accent,#818cf8)]/45 focus:bg-black/30"
      />
    </label>
  );
}

function StatusDot(props: { loading: boolean }) {
  return (
    <span
      class={`h-2 w-2 rounded-full ${props.loading ? 'animate-pulse bg-amber-300' : 'bg-emerald-400'}`}
    />
  );
}

function ChannelIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
      <path d="M5 1 3 15M13 1l-2 14M1 5h14M1 11h14" />
    </svg>
  );
}
