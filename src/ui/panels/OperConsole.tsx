// OperConsole — network operator incident workspace. Only rendered for opers
// (connection.isOper()).
//
//   • Saved Event Spine subscription/severity/query views and entity pivots.
//   • Redacted incident export plus a bounded local client-command audit.
//   • Exact-target confirmation for KILL, WARD, JUPE, and destructive raw rows.
//
// Everything is sent raw (via /quote) to the active server buffer.

import { createSignal, createMemo, createEffect, For, Show } from 'solid-js';
import type { JSX } from 'solid-js';
import {
  buffersState,
  deleteIncidentFilter,
  isOper,
  operatorIncidentState,
  recordOperatorCommand,
  saveIncidentFilter,
  sendTo,
} from '@/state';
import type { BufferEntry } from '@/types';
import Modal from '@/ui/bits/Modal';
import { parseEventFeedText, type ParsedEventFeed } from '@/lib/ircx/parser';
import {
  INCIDENT_SEVERITIES,
  buildIncidentExport,
  incidentEntities,
  incidentExportFilename,
  incidentTimeline,
  sanitizeIncidentText,
} from '@/lib/operatorIncident';
import type {
  IncidentFilter,
  IncidentSeverity,
  IncidentTimelineRow,
} from '@/lib/operatorIncident';
import { formatDate } from '@/lib/i18n';

/** Event Spine categories — docs/OROCHI_PROTOCOL.md §11. */
const EVENT_CATEGORIES = [
  'CONNECT', 'DISCONNECT', 'SERVER_LINK', 'FLOOD', 'ERROR', 'ANNOUNCE',
  'OPER_ACTION', 'KILL', 'SPAM', 'DEBUG', 'POLICY', 'SERVICE', 'SECURITY',
] as const;

const TAIL_LINES = 500;
const DESTRUCTIVE_COMMANDS = new Set(['DIE', 'JUPE', 'KILL', 'REHASH', 'RESTART', 'SQUIT', 'WARD']);

interface PendingDestructive {
  kind: 'kill' | 'ward' | 'jupe' | 'raw';
  command: string;
  target: string;
}

interface Props {
  open?: boolean;
  onClose: () => void;
}

export default function OperConsole(props: Props) {
  const [subscribed, setSubscribed] = createSignal<Record<string, boolean>>({});
  const [severity, setSeverity] = createSignal<IncidentSeverity>('info');
  const [severityDraft, setSeverityDraft] = createSignal<IncidentSeverity>('info');
  const [feedQuery, setFeedQuery] = createSignal('');
  const [filterName, setFilterName] = createSignal('');
  const [selectedFilterId, setSelectedFilterId] = createSignal('');
  const [pivot, setPivot] = createSignal('');
  const [broadcast, setBroadcast] = createSignal('');
  const [killNick, setKillNick] = createSignal('');
  const [killReason, setKillReason] = createSignal('');
  const [wardArgs, setWardArgs] = createSignal('');
  const [jupeArgs, setJupeArgs] = createSignal('');
  const [rawCmd, setRawCmd] = createSignal('');
  const [pendingDestructive, setPendingDestructive] = createSignal<PendingDestructive | null>(null);
  const [confirmationTarget, setConfirmationTarget] = createSignal('');

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

  const sendRaw = (cmd: string, target = '', destructive = false): boolean => {
    const entry = serverEntry();
    const command = sanitizeIncidentText(cmd, 2048);
    if (!entry || !command) return false;
    if (!sendTo(entry.buffer.id, `/quote ${command}`)) return false;
    recordOperatorCommand({
      server: entry.buffer.localVars['server'] ?? entry.buffer.shortName ?? entry.buffer.name,
      command,
      target,
      destructive,
    });
    return true;
  };

  /** Recent server-buffer lines parsed as Event Spine feed entries. */
  const allEventRows = createMemo<IncidentTimelineRow[]>(() => {
    const entry = serverEntry();
    if (!entry) return [];
    return entry.lines
      .map((line) => ({ id: line.id, at: line.date.getTime(), event: parseEventFeedText(line.message) }))
      .filter((row): row is IncidentTimelineRow => row.event !== null)
      .slice(-TAIL_LINES);
  });

  const selectedCategories = () => EVENT_CATEGORIES.filter((category) => subscribed()[category]);
  const selectedSeverities = (): IncidentSeverity[] => {
    const index = INCIDENT_SEVERITIES.indexOf(severityDraft());
    return [...INCIDENT_SEVERITIES.slice(Math.max(0, index))];
  };
  const currentFilter = createMemo<IncidentFilter>(() => ({
    id: selectedFilterId() || 'current',
    name: filterName().trim() || 'Current incident view',
    categories: [...selectedCategories()],
    severities: selectedSeverities(),
    query: feedQuery(),
    createdAt: 0,
  }));
  const eventFeed = createMemo(() => incidentTimeline(allEventRows(), currentFilter(), pivot()));

  // Keep the tail scrolled to the newest line.
  createEffect(() => {
    eventFeed();
    if (tailEl) tailEl.scrollTop = tailEl.scrollHeight;
  });

  const toggleCategory = (cat: string): void => {
    const next = !subscribed()[cat];
    if (sendRaw(next ? `EVENT ADD ${cat} *` : `EVENT DEL ${cat}`)) {
      setSubscribed((prev) => ({ ...prev, [cat]: next }));
      setSelectedFilterId('');
    } else {
      // A checkbox toggles its DOM state before change fires. Re-emit the
      // acknowledged value so a rejected dispatch cannot look subscribed.
      setSubscribed((prev) => ({ ...prev, [cat]: !!prev[cat] }));
    }
  };

  const applySeverity = (): void => {
    const next = severityDraft();
    if (!sendRaw(`EVENT SEVERITY ${next}`)) {
      setSeverityDraft(severity());
      return;
    }
    setSeverity(next);
    setSelectedFilterId('');
  };

  const saveFilter = (): void => {
    const saved = saveIncidentFilter({
      name: filterName(),
      categories: [...selectedCategories()],
      severities: selectedSeverities(),
      query: feedQuery(),
    });
    if (!saved) return;
    setSelectedFilterId(saved.id);
    setFilterName(saved.name);
  };

  const applyFilter = (id: string): void => {
    const filter = operatorIncidentState.filters.find((item) => item.id === id);
    if (!filter) return;
    // Once any command is attempted, the previously selected saved view can
    // no longer be claimed unless this entire view is accepted below.
    setSelectedFilterId('');
    const nextCategories = Object.fromEntries(EVENT_CATEGORIES.map((category) => [category, filter.categories.includes(category)]));
    const acknowledgedCategories = { ...subscribed() };
    let accepted = true;
    for (const category of EVENT_CATEGORIES) {
      const was = !!subscribed()[category];
      const next = !!nextCategories[category];
      if (was === next) continue;
      if (sendRaw(next ? `EVENT ADD ${category} *` : `EVENT DEL ${category}`)) {
        acknowledgedCategories[category] = next;
      } else {
        accepted = false;
      }
    }
    setSubscribed(acknowledgedCategories);
    const nextSeverity = filter.severities[0] ?? 'debug';
    if (sendRaw(`EVENT SEVERITY ${nextSeverity}`)) {
      setSeverity(nextSeverity);
      setSeverityDraft(nextSeverity);
    } else {
      accepted = false;
      setSeverityDraft(severity());
    }
    if (!accepted) return;
    setSelectedFilterId(id);
    setFeedQuery(filter.query);
    setFilterName(filter.name);
    setPivot('');
  };

  const exportIncident = (): void => {
    const now = new Date();
    const payload = buildIncidentExport({
      filter: currentFilter(),
      pivot: pivot(),
      events: eventFeed(),
      audit: operatorIncidentState.audit,
      generatedAt: now,
    });
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = incidentExportFilename(now);
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const stageDestructive = (kind: PendingDestructive['kind'], command: string, target: string): void => {
    const exactTarget = sanitizeIncidentText(target, 160);
    const exactCommand = sanitizeIncidentText(command, 2048);
    if (!exactTarget || !exactCommand) return;
    setPendingDestructive({ kind, command: exactCommand, target: exactTarget });
    setConfirmationTarget('');
  };

  const confirmDestructive = (): void => {
    const pending = pendingDestructive();
    if (!pending || confirmationTarget() !== pending.target) return;
    if (!sendRaw(pending.command, pending.target, true)) return;
    if (pending.kind === 'kill') { setKillNick(''); setKillReason(''); }
    if (pending.kind === 'ward') setWardArgs('');
    if (pending.kind === 'jupe') setJupeArgs('');
    if (pending.kind === 'raw') setRawCmd('');
    setPendingDestructive(null);
    setConfirmationTarget('');
  };

  const handleBroadcast = (): void => {
    const text = broadcast().trim();
    if (!text) return;
    if (sendRaw(`EVENT BROADCAST :${text}`)) setBroadcast('');
  };

  const handleKill = (): void => {
    const target = sanitizeIncidentText(killNick(), 160);
    if (!target) return;
    const reason = killReason().trim() || 'Killed by operator';
    stageDestructive('kill', `KILL ${target} :${reason}`, target);
  };

  const stageWard = (): void => {
    const args = sanitizeIncidentText(wardArgs(), 1900);
    const parts = args.split(/\s+/);
    stageDestructive('ward', `WARD ${args}`, parts[2] ?? parts[0] ?? 'WARD');
  };

  const stageJupe = (): void => {
    const args = sanitizeIncidentText(jupeArgs(), 1900);
    stageDestructive('jupe', `JUPE ${args}`, args.split(/\s+/)[0] ?? 'JUPE');
  };

  const sendRawInput = (): void => {
    const command = sanitizeIncidentText(rawCmd(), 2048);
    if (!command) return;
    const parts = command.split(/\s+/);
    if (DESTRUCTIVE_COMMANDS.has(parts[0]!.toUpperCase())) {
      stageDestructive('raw', command, parts[1] ?? parts[0]!);
      return;
    }
    if (sendRaw(command, parts[1] ?? '')) setRawCmd('');
  };

  return (
    <Show when={isOper()}>
      <Modal open={props.open ?? true} onClose={props.onClose} title="Oper Console" wide>
        <div class="max-h-[calc(85dvh-56px)] space-y-4 overflow-y-auto px-4 pb-4 pt-3 sm:px-5" data-testid="operator-incident-workspace">
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
                    <span class={`text-[11px] font-mono ${subscribed()[cat] ? 'text-white' : 'text-white/70'}`}>
                      {cat}
                    </span>
                  </label>
                )}
              </For>
            </div>
            <p class="mt-2 px-1 text-[10px] text-white/70">
              Subscriptions send <span class="font-mono">EVENT ADD &lt;CAT&gt; *</span> / <span class="font-mono">EVENT DEL &lt;CAT&gt;</span> — events fan in network-wide from every node.
            </p>
          </Section>

          <Section title="Severity Filter">
            <div class="flex flex-wrap items-center gap-2">
              <For each={[...INCIDENT_SEVERITIES]}>
                {(level) => (
                  <button
                    type="button"
                    aria-pressed={severityDraft() === level}
                    onClick={() => setSeverityDraft(level)}
                    class={`text-[11px] font-mono px-2.5 py-1 rounded-md transition-colors
                      ${severityDraft() === level
                        ? 'bg-[var(--custom-accent,#818cf8)]/[0.18] text-white ring-1 ring-[var(--custom-accent,#818cf8)]/40'
                        : 'bg-white/[0.03] text-white/70 hover:bg-white/[0.06] hover:text-white'}`}
                  >
                    {level}
                  </button>
                )}
              </For>
              <div class="flex-1" />
              <Btn label="Apply" onClick={applySeverity} />
            </div>
          </Section>

          <Section title="Saved Incident Views">
            <div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <Input
                ariaLabel="Incident view name"
                placeholder="View name"
                value={filterName()}
                onChange={(value) => { setFilterName(value); setSelectedFilterId(''); }}
              />
              <Input
                ariaLabel="Event feed query"
                placeholder="Filter nick, channel, detail..."
                value={feedQuery()}
                onChange={(value) => { setFeedQuery(value); setSelectedFilterId(''); }}
              />
              <Btn label="Save view" disabled={!filterName().trim()} onClick={saveFilter} />
            </div>
            <Show
              when={operatorIncidentState.filters.length > 0}
              fallback={<p class="mt-2 px-1 text-[10px] text-white/65">Save the current categories, severity threshold, and query for this device.</p>}
            >
              <div class="mt-2 flex flex-wrap gap-1.5" aria-label="Saved incident views">
                <For each={operatorIncidentState.filters}>
                  {(filter) => (
                    <div class="flex overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.025]">
                      <button
                        type="button"
                        aria-pressed={selectedFilterId() === filter.id}
                        onClick={() => applyFilter(filter.id)}
                        class="px-2.5 py-1.5 text-[10px] font-bold text-white/75 hover:bg-white/[0.05]"
                      >
                        {filter.name}
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete incident view ${filter.name}`}
                        onClick={() => {
                          deleteIncidentFilter(filter.id);
                          if (selectedFilterId() === filter.id) setSelectedFilterId('');
                        }}
                        class="border-l border-white/[0.07] px-2 text-[11px] text-white/65 hover:bg-red-500/10 hover:text-red-200"
                      >
                        ×
                      </button>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </Section>

          <Section title="Broadcast (network-wide WALLOPS)">
            <div class="flex gap-2">
              <Input
                ariaLabel="Operator broadcast"
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
                ariaLabel="KILL target nick"
                placeholder="Nick"
                value={killNick()}
                onChange={setKillNick}
                flex
              />
              <Input ariaLabel="KILL reason" placeholder="Reason" value={killReason()} onChange={setKillReason} flex />
              <button
                onClick={handleKill}
                disabled={!killNick().trim()}
                class="shrink-0 rounded-md bg-red-500/10 px-4 py-1.5 text-[11px] font-medium text-red-300 transition-colors hover:bg-red-500/20 disabled:pointer-events-none disabled:opacity-30"
              >
                Review KILL
              </button>
            </div>
          </Section>

          <Section title="WARD (Warden bans)">
            <p class="mb-2 px-1 text-[10px] text-white/70">
              Match × Scope × Action — e.g. <span class="font-mono">ADD MASK *!*@bad.host GLOBAL BAN :reason</span>. Args are sent verbatim after <span class="font-mono">WARD</span>.
            </p>
            <div class="flex gap-2">
              <Input
                ariaLabel="WARD arguments"
                placeholder="WARD arguments..."
                value={wardArgs()}
                onChange={setWardArgs}
                onEnter={stageWard}
                flex
                mono
              />
              <Btn
                label="Send"
                disabled={!wardArgs().trim()}
                onClick={stageWard}
              />
            </div>
          </Section>

          <Section title="JUPE (server-name forbid)">
            <p class="mb-2 px-1 text-[10px] text-white/70">
              Blocks matching server names at the mesh link gate. Args are sent verbatim after <span class="font-mono">JUPE</span>.
            </p>
            <div class="flex gap-2">
              <Input
                ariaLabel="JUPE arguments"
                placeholder="JUPE arguments..."
                value={jupeArgs()}
                onChange={setJupeArgs}
                onEnter={stageJupe}
                flex
                mono
              />
              <Btn
                label="Send"
                disabled={!jupeArgs().trim()}
                onClick={stageJupe}
              />
            </div>
          </Section>

          <Section title="Raw Command">
            <div class="flex gap-2">
              <Input
                ariaLabel="Raw IRC command"
                placeholder="Raw IRC command (sent via /quote)..."
                value={rawCmd()}
                onChange={setRawCmd}
                onEnter={sendRawInput}
                flex
                mono
              />
              <Btn
                label="Send"
                disabled={!rawCmd().trim()}
                onClick={sendRawInput}
              />
            </div>
          </Section>

          <Show when={pendingDestructive()}>
            {(pending) => (
              <section class="rounded-xl border border-red-400/25 bg-red-500/[0.07] p-3" aria-labelledby="destructive-confirm-title">
                <h4 id="destructive-confirm-title" class="text-[11px] font-black uppercase tracking-[0.12em] text-red-100">
                  Confirm destructive target
                </h4>
                <p class="mt-1 text-[10px] leading-relaxed text-white/75">
                  Review the exact command, then type <strong class="font-mono text-white">{pending().target}</strong> to confirm this target.
                </p>
                <code class="mt-2 block break-all rounded-lg bg-black/30 px-2.5 py-2 text-[11px] text-red-100">{pending().command}</code>
                <div class="mt-2 flex flex-wrap gap-2">
                  <Input
                    ariaLabel={`Type ${pending().target} to confirm`}
                    placeholder={pending().target}
                    value={confirmationTarget()}
                    onChange={setConfirmationTarget}
                    onEnter={confirmDestructive}
                    flex
                    mono
                  />
                  <button
                    type="button"
                    onClick={() => { setPendingDestructive(null); setConfirmationTarget(''); }}
                    class="rounded-md border border-white/10 px-3 py-1.5 text-[11px] font-bold text-white/75 hover:bg-white/[0.05]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={confirmationTarget() !== pending().target}
                    onClick={confirmDestructive}
                    class="rounded-md bg-red-100 px-3 py-1.5 text-[11px] font-black text-red-950 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    Send destructive command
                  </button>
                </div>
              </section>
            )}
          </Show>

          {/* ── Live event tail ─────────────────────────────────────────── */}
          <Section title={`Correlated Event Timeline (${eventFeed().length}/${allEventRows().length})`}>
            <div class="mb-2 flex flex-wrap items-center gap-2">
              <Show when={pivot()}>
                <button
                  type="button"
                  onClick={() => setPivot('')}
                  class="rounded-lg border border-emerald-300/20 bg-emerald-300/[0.08] px-2.5 py-1 text-[10px] font-bold text-emerald-100"
                  aria-label={`Clear incident pivot ${pivot()}`}
                >
                  Pivot: {pivot()} ×
                </button>
              </Show>
              <span class="flex-1 text-[10px] text-white/65">
                Select a nick or channel in the timeline to correlate it across event categories.
              </span>
              <Btn label="Export redacted JSON" disabled={eventFeed().length === 0 && operatorIncidentState.audit.length === 0} onClick={exportIncident} />
            </div>
            <div
              ref={(el) => { tailEl = el; }}
              class="max-h-[180px] overflow-y-auto bg-black/30 border border-white/[0.04] rounded-lg px-2 py-1.5 space-y-0.5"
            >
              <Show
                when={eventFeed().length > 0}
                fallback={
                  <div class="py-6 text-center text-[11px] text-white/65">
                    No EVENT lines in the server buffer yet — subscribe to categories above.
                  </div>
                }
              >
                <For each={eventFeed()}>
                  {(row) => <EventFeedRow event={row.event} time={new Date(row.at)} onPivot={setPivot} />}
                </For>
              </Show>
            </div>
          </Section>

          <Section title={`Local Client Audit (${operatorIncidentState.audit.length}/200)`}>
            <p class="mb-2 text-[10px] leading-relaxed text-white/65">
              Bounded device-local record of commands sent from this console. Sensitive values are redacted before storage and export.
            </p>
            <div class="max-h-[150px] space-y-1 overflow-y-auto rounded-lg border border-white/[0.04] bg-black/25 p-2">
              <Show when={operatorIncidentState.audit.length > 0} fallback={<p class="py-4 text-center text-[10px] text-white/60">No client commands recorded yet.</p>}>
                <For each={operatorIncidentState.audit.slice(0, 30)}>
                  {(entry) => (
                    <div class="flex items-start gap-2 rounded-md bg-white/[0.02] px-2 py-1.5 text-[10px]">
                      <time class="shrink-0 font-mono text-white/60">{formatDate(entry.at, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })}</time>
                      <code class="min-w-0 flex-1 break-all text-white/80">{entry.command}</code>
                      <Show when={entry.destructive}><span class="shrink-0 font-black uppercase text-red-200">destructive</span></Show>
                    </div>
                  )}
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
      <h4 class="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-white/75">{props.title}</h4>
      {props.children}
    </div>
  );
}

function EventFeedRow(props: { event: ParsedEventFeed; time: Date; onPivot: (value: string) => void }): JSX.Element {
  const attrs = () => Object.entries(props.event.attrs);
  const entities = () => incidentEntities(props.event);
  const detail = () => props.event.detail;
  return (
    <div class="rounded-lg border border-white/[0.045] bg-white/[0.018] px-2 py-1.5">
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="shrink-0 font-mono text-[9px] tabular-nums text-white/70">
          {formatDate(props.time, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })}
        </span>
        <span class="rounded-md bg-[var(--custom-accent,#818cf8)]/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-white">
          {props.event.subscription ?? props.event.category}
        </span>
        <Show when={props.event.subscription && props.event.subscription !== props.event.category}>
          <span class="rounded-md bg-white/[0.045] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-white/70">
            {props.event.category}
          </span>
        </Show>
        <span class="rounded-md bg-white/[0.045] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-white/70">
          {props.event.severity ?? 'info'}
        </span>
        <Show when={props.event.verb}>
          <span class="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-white/75">
            {props.event.verb}
          </span>
        </Show>
        <Show when={props.event.source}>
          <span class="font-mono text-[9px] text-white/70">{props.event.source}</span>
        </Show>
      </div>
      <Show when={detail()}>
        <div class="mt-1 break-words text-[10px] leading-snug text-white/75">{detail()}</div>
      </Show>
      <Show when={attrs().length > 0}>
        <div class="mt-1 flex flex-wrap gap-1">
          <For each={attrs()}>
            {([key, value]) => (
              <span class="rounded bg-black/25 px-1.5 py-0.5 font-mono text-[9px] text-white/75">
                {key}={value}
              </span>
            )}
          </For>
        </div>
      </Show>
      <Show when={entities().length > 0}>
        <div class="mt-1 flex flex-wrap items-center gap-1">
          <span class="text-[9px] font-bold uppercase tracking-[0.08em] text-white/60">Pivot</span>
          <For each={entities()}>
            {(entity) => (
              <button
                type="button"
                onClick={() => props.onPivot(entity)}
                class="max-w-[220px] truncate rounded bg-emerald-300/[0.08] px-1.5 py-0.5 font-mono text-[9px] text-emerald-100 hover:bg-emerald-300/[0.15]"
              >
                {entity}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function Input(props: {
  ariaLabel?: string;
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
      aria-label={props.ariaLabel ?? props.placeholder}
      value={props.value}
      onInput={(e) => props.onChange(e.currentTarget.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') props.onEnter?.(); }}
      placeholder={props.placeholder}
      autocomplete="off"
      spellcheck={false}
      class={`${props.flex ? 'flex-1 min-w-0' : 'w-full'} ${props.mono ? 'font-mono' : ''} rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[12px] text-white/90 outline-none placeholder:text-white/45 focus:border-[var(--custom-accent,#818cf8)]/40`}
    />
  );
}

function Btn(props: { label: string; onClick: () => void; disabled?: boolean }): JSX.Element {
  return (
    <button
      onClick={() => props.onClick()}
      disabled={props.disabled}
      class="shrink-0 rounded-md border border-[var(--custom-accent,#818cf8)]/30 bg-[var(--custom-accent,#818cf8)]/[0.14] px-4 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-[var(--custom-accent,#818cf8)]/[0.24] disabled:pointer-events-none disabled:opacity-30"
    >
      {props.label}
    </button>
  );
}
