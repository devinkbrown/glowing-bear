// OperConsole — network operator console modal (orochi Event Spine + quick
// actions). Only rendered for opers (connection.isOper()).
//
//   • Event Spine: per-category subscribe/unsubscribe (EVENT ADD/DEL),
//     session severity filter (EVENT SEVERITY), EVENT BROADCAST composer.
//   • Quick actions: KILL (with confirm), WARD helper, JUPE, raw /quote row.
//   • Live tail of recent server-buffer EVENT lines.
//
// Everything is sent raw (via /quote) to the active server buffer.

import { createSignal, createMemo, createEffect, For, Show } from 'solid-js';
import type { JSX } from 'solid-js';
import { buffersState, sendTo, isOper } from '@/state';
import type { BufferEntry } from '@/types';
import Modal from '@/ui/bits/Modal';
import { parseEventFeedText, type ParsedEventFeed } from '@/lib/ircx/parser';

/** Event Spine categories — docs/OROCHI_PROTOCOL.md §11. */
const EVENT_CATEGORIES = [
  'CONNECT', 'DISCONNECT', 'SERVER_LINK', 'FLOOD', 'ERROR', 'ANNOUNCE',
  'OPER_ACTION', 'KILL', 'SPAM', 'DEBUG', 'POLICY', 'SERVICE', 'SECURITY',
] as const;

const SEVERITY_LEVELS = ['debug', 'info', 'notice', 'warn', 'error'] as const;

const TAIL_LINES = 50;

interface Props {
  open?: boolean;
  onClose: () => void;
}

export default function OperConsole(props: Props) {
  const [subscribed, setSubscribed] = createSignal<Record<string, boolean>>({});
  const [severity, setSeverity] = createSignal<string>('info');
  const [broadcast, setBroadcast] = createSignal('');
  const [killNick, setKillNick] = createSignal('');
  const [killReason, setKillReason] = createSignal('');
  const [killArmed, setKillArmed] = createSignal(false);
  const [wardArgs, setWardArgs] = createSignal('');
  const [jupeArgs, setJupeArgs] = createSignal('');
  const [rawCmd, setRawCmd] = createSignal('');

  let tailEl: HTMLDivElement | undefined;

  /** Server buffer entry backing the active buffer. */
  const serverEntry = createMemo<BufferEntry | undefined>(() => {
    const active = buffersState.activeBuffer;
    if (!active) return undefined;
    const entry = buffersState.buffers[active];
    if (!entry) return undefined;
    if (entry.buffer.localVars['type'] === 'server') return entry;
    const serverName = entry.buffer.localVars['server'] ?? '';
    return Object.values(buffersState.buffers).find((e) => {
      if (e.buffer.localVars['type'] !== 'server') return false;
      const sn = e.buffer.localVars['server'] ?? e.buffer.localVars['network'] ?? '';
      return sn === serverName;
    });
  });

  const sendRaw = (cmd: string): void => {
    const entry = serverEntry();
    if (entry) sendTo(entry.buffer.id, `/quote ${cmd}`);
  };

  /** Recent server-buffer lines parsed as Event Spine feed entries. */
  const eventFeed = createMemo(() => {
    const entry = serverEntry();
    if (!entry) return [];
    return entry.lines
      .map((line) => ({ line, event: parseEventFeedText(line.message) }))
      .filter((row): row is { line: typeof entry.lines[number]; event: ParsedEventFeed } => row.event !== null)
      .slice(-TAIL_LINES);
  });

  // Keep the tail scrolled to the newest line.
  createEffect(() => {
    eventFeed();
    if (tailEl) tailEl.scrollTop = tailEl.scrollHeight;
  });

  const toggleCategory = (cat: string): void => {
    const next = !subscribed()[cat];
    setSubscribed((prev) => ({ ...prev, [cat]: next }));
    sendRaw(next ? `EVENT ADD ${cat} *` : `EVENT DEL ${cat}`);
  };

  const handleBroadcast = (): void => {
    const text = broadcast().trim();
    if (!text) return;
    sendRaw(`EVENT BROADCAST :${text}`);
    setBroadcast('');
  };

  const handleKill = (): void => {
    if (!killNick().trim()) return;
    if (!killArmed()) {
      setKillArmed(true);
      return;
    }
    const reason = killReason().trim() || 'Killed by operator';
    sendRaw(`KILL ${killNick().trim()} :${reason}`);
    setKillNick('');
    setKillReason('');
    setKillArmed(false);
  };

  return (
    <Show when={isOper()}>
      <Modal open={props.open ?? true} onClose={props.onClose} title="Oper Console" wide>
        <div class="space-y-4 px-4 sm:px-5 pb-4 pt-3">
          {/* ── Event Spine ─────────────────────────────────────────────── */}
          <Section title="Event Spine — Category Feed">
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-1">
              <For each={[...EVENT_CATEGORIES]}>
                {(cat) => (
                  <label class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.03] cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={!!subscribed()[cat]}
                      onChange={() => toggleCategory(cat)}
                      class="accent-[var(--custom-accent,#818cf8)] w-3.5 h-3.5"
                    />
                    <span class={`text-[11px] font-mono ${subscribed()[cat] ? 'text-gray-200' : 'text-gray-500'}`}>
                      {cat}
                    </span>
                  </label>
                )}
              </For>
            </div>
            <p class="text-[10px] text-gray-600 px-1 mt-2">
              Subscriptions send <span class="font-mono">EVENT ADD &lt;CAT&gt; *</span> / <span class="font-mono">EVENT DEL &lt;CAT&gt;</span> — events fan in network-wide from every node.
            </p>
          </Section>

          <Section title="Severity Filter">
            <div class="flex items-center gap-2">
              <For each={[...SEVERITY_LEVELS]}>
                {(level) => (
                  <button
                    onClick={() => setSeverity(level)}
                    class={`text-[11px] font-mono px-2.5 py-1 rounded-md transition-colors
                      ${severity() === level
                        ? 'bg-[var(--custom-accent,#818cf8)]/[0.15] text-[var(--custom-accent,#818cf8)] ring-1 ring-[var(--custom-accent,#818cf8)]/30'
                        : 'bg-white/[0.03] text-gray-500 hover:text-gray-300 hover:bg-white/[0.06]'}`}
                  >
                    {level}
                  </button>
                )}
              </For>
              <div class="flex-1" />
              <Btn label="Apply" onClick={() => sendRaw(`EVENT SEVERITY ${severity()}`)} />
            </div>
          </Section>

          <Section title="Broadcast (network-wide WALLOPS)">
            <div class="flex gap-2">
              <Input
                placeholder="Message to all subscribed opers..."
                value={broadcast()}
                onChange={setBroadcast}
                onEnter={handleBroadcast}
                flex
              />
              <Btn label="Broadcast" disabled={!broadcast().trim()} onClick={handleBroadcast} />
            </div>
          </Section>

          {/* ── Quick actions ───────────────────────────────────────────── */}
          <Section title="KILL">
            <div class="flex gap-2">
              <Input
                placeholder="Nick"
                value={killNick()}
                onChange={(v) => { setKillNick(v); setKillArmed(false); }}
                flex
              />
              <Input placeholder="Reason" value={killReason()} onChange={setKillReason} flex />
              <button
                onClick={handleKill}
                disabled={!killNick().trim()}
                class={`text-[11px] font-medium px-4 py-1.5 rounded-md transition-colors shrink-0 disabled:opacity-30 disabled:pointer-events-none
                  ${killArmed()
                    ? 'bg-red-500/25 text-red-300 ring-1 ring-red-500/40'
                    : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'}`}
              >
                {killArmed() ? `Confirm KILL ${killNick().trim()}?` : 'Kill'}
              </button>
            </div>
          </Section>

          <Section title="WARD (Warden bans)">
            <p class="text-[10px] text-gray-500 px-1 mb-2">
              Match × Scope × Action — e.g. <span class="font-mono">ADD MASK *!*@bad.host GLOBAL BAN :reason</span>. Args are sent verbatim after <span class="font-mono">WARD</span>.
            </p>
            <div class="flex gap-2">
              <Input
                placeholder="WARD arguments..."
                value={wardArgs()}
                onChange={setWardArgs}
                onEnter={() => { if (wardArgs().trim()) { sendRaw(`WARD ${wardArgs().trim()}`); setWardArgs(''); } }}
                flex
                mono
              />
              <Btn
                label="Send"
                disabled={!wardArgs().trim()}
                onClick={() => { sendRaw(`WARD ${wardArgs().trim()}`); setWardArgs(''); }}
              />
            </div>
          </Section>

          <Section title="JUPE (server-name forbid)">
            <p class="text-[10px] text-gray-500 px-1 mb-2">
              Blocks matching server names at the mesh link gate. Args are sent verbatim after <span class="font-mono">JUPE</span>.
            </p>
            <div class="flex gap-2">
              <Input
                placeholder="JUPE arguments..."
                value={jupeArgs()}
                onChange={setJupeArgs}
                onEnter={() => { if (jupeArgs().trim()) { sendRaw(`JUPE ${jupeArgs().trim()}`); setJupeArgs(''); } }}
                flex
                mono
              />
              <Btn
                label="Send"
                disabled={!jupeArgs().trim()}
                onClick={() => { sendRaw(`JUPE ${jupeArgs().trim()}`); setJupeArgs(''); }}
              />
            </div>
          </Section>

          <Section title="Raw Command">
            <div class="flex gap-2">
              <Input
                placeholder="Raw IRC command (sent via /quote)..."
                value={rawCmd()}
                onChange={setRawCmd}
                onEnter={() => { if (rawCmd().trim()) { sendRaw(rawCmd().trim()); setRawCmd(''); } }}
                flex
                mono
              />
              <Btn
                label="Send"
                disabled={!rawCmd().trim()}
                onClick={() => { sendRaw(rawCmd().trim()); setRawCmd(''); }}
              />
            </div>
          </Section>

          {/* ── Live event tail ─────────────────────────────────────────── */}
          <Section title={`Event Feed (last ${TAIL_LINES})`}>
            <div
              ref={(el) => { tailEl = el; }}
              class="max-h-[180px] overflow-y-auto bg-black/30 border border-white/[0.04] rounded-lg px-2 py-1.5 space-y-0.5"
            >
              <Show
                when={eventFeed().length > 0}
                fallback={
                  <div class="text-center py-6 text-gray-600 text-[11px]">
                    No EVENT lines in the server buffer yet — subscribe to categories above.
                  </div>
                }
              >
                <For each={eventFeed()}>
                  {(row) => <EventFeedRow event={row.event} time={row.line.date} />}
                </For>
              </Show>
            </div>
          </Section>
        </div>
      </Modal>
    </Show>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function Section(props: { title: string; children: JSX.Element }): JSX.Element {
  return (
    <div class="bg-white/[0.01] border border-white/[0.04] rounded-xl p-3">
      <h4 class="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2.5">{props.title}</h4>
      {props.children}
    </div>
  );
}

function EventFeedRow(props: { event: ParsedEventFeed; time: Date }): JSX.Element {
  const attrs = () => Object.entries(props.event.attrs);
  const detail = () => props.event.detail || props.event.raw;
  return (
    <div class="rounded-lg border border-white/[0.045] bg-white/[0.018] px-2 py-1.5">
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="text-[9px] font-mono tabular-nums text-gray-600 shrink-0">
          {props.time.toLocaleTimeString([], { hour12: false })}
        </span>
        <span class="rounded-md bg-[var(--custom-accent,#818cf8)]/12 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-[var(--custom-accent,#818cf8)]">
          {props.event.category}
        </span>
        <Show when={props.event.verb}>
          <span class="rounded-md bg-white/[0.045] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-gray-400">
            {props.event.verb}
          </span>
        </Show>
        <Show when={props.event.source}>
          <span class="text-[9px] font-mono text-gray-600">{props.event.source}</span>
        </Show>
        <Show when={props.event.channel}>
          <span class="text-[10px] font-mono text-emerald-300/80">{props.event.channel}</span>
        </Show>
        <Show when={props.event.subject}>
          <span class="max-w-[180px] truncate text-[10px] font-mono text-gray-300">{props.event.subject}</span>
        </Show>
        <Show when={props.event.sender}>
          <span class="max-w-[180px] truncate text-[10px] font-mono text-gray-300">{props.event.sender}</span>
        </Show>
      </div>
      <Show when={detail()}>
        <div class="mt-1 break-words text-[10px] leading-snug text-gray-500">{detail()}</div>
      </Show>
      <Show when={attrs().length > 0}>
        <div class="mt-1 flex flex-wrap gap-1">
          <For each={attrs()}>
            {([key, value]) => (
              <span class="rounded bg-black/25 px-1.5 py-0.5 text-[9px] font-mono text-gray-500">
                {key}={value}
              </span>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function Input(props: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
  flex?: boolean;
  mono?: boolean;
}): JSX.Element {
  return (
    <input
      type="text"
      value={props.value}
      onInput={(e) => props.onChange(e.currentTarget.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') props.onEnter?.(); }}
      placeholder={props.placeholder}
      autocomplete="off"
      spellcheck={false}
      class={`${props.flex ? 'flex-1 min-w-0' : 'w-full'} ${props.mono ? 'font-mono' : ''} bg-white/[0.04] border border-white/[0.08] rounded-md text-[12px] text-gray-200 px-2.5 py-1.5 outline-none focus:border-[var(--custom-accent,#818cf8)]/40 placeholder-gray-600 transition-colors`}
    />
  );
}

function Btn(props: { label: string; onClick: () => void; disabled?: boolean }): JSX.Element {
  return (
    <button
      onClick={() => props.onClick()}
      disabled={props.disabled}
      class="text-[11px] font-medium bg-[var(--custom-accent,#818cf8)]/[0.1] text-[var(--custom-accent,#818cf8)] hover:bg-[var(--custom-accent,#818cf8)]/[0.2] px-4 py-1.5 rounded-md transition-colors shrink-0 disabled:opacity-30 disabled:pointer-events-none"
    >
      {props.label}
    </button>
  );
}
