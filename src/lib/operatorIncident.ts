import type { ParsedEventFeed } from '@/lib/ircx/parser';

export const INCIDENT_SEVERITIES = ['debug', 'info', 'notice', 'warn', 'error'] as const;
export type IncidentSeverity = typeof INCIDENT_SEVERITIES[number];

export interface IncidentFilter {
  id: string;
  name: string;
  categories: string[];
  severities: IncidentSeverity[];
  query: string;
  createdAt: number;
}

export interface IncidentTimelineRow {
  id: string;
  at: number;
  event: ParsedEventFeed;
}

export interface OperatorAuditRecord {
  id: string;
  at: number;
  server: string;
  command: string;
  target: string;
  destructive: boolean;
}

const SECRET_VALUE_RE = /\b(pass(?:word)?|token|secret|key|session|account|acct)\b(\s*[=:]\s*|\s+)\S+/gi;
const USERHOST_RE = /\b([^\s!@]+)!([^\s@]+)@([^\s]+)/g;
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const IPV6_RE = /\b(?:[a-f\d]{0,4}:){2,}[a-f\d:.%]{1,}\b/gi;
const URL_RE = /\b(?:https?|wss?):\/\/[^\s]+/gi;
const HOST_RE = /\b(?:[a-z\d-]+\.)+[a-z]{2,}\b/gi;
const OPAQUE_RE = /\b[A-Za-z\d+/_-]{32,}={0,2}\b/g;
const SENSITIVE_KEY_RE = /(?:pass(?:word)?|token|secret|key|session|account|acct)/i;

export function sanitizeIncidentText(value: string, maxLength = 512): string {
  return value.replace(/[\r\n\0]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function redactIncidentText(value: string, maxLength = 512): string {
  return sanitizeIncidentText(value, maxLength * 2)
    .replace(URL_RE, '<url>')
    .replace(USERHOST_RE, '$1!<redacted>@<redacted>')
    .replace(IPV4_RE, '<ip>')
    .replace(IPV6_RE, '<ip>')
    .replace(HOST_RE, '<host>')
    .replace(SECRET_VALUE_RE, '$1=<redacted>')
    .replace(OPAQUE_RE, '<opaque>')
    .slice(0, maxLength);
}

export function incidentEntities(event: ParsedEventFeed): string[] {
  const values = [event.channel, event.subject, event.sender];
  for (const value of Object.values(event.attrs)) values.push(value);
  const entities = new Set<string>();
  for (const value of values) {
    const clean = sanitizeIncidentText(value ?? '', 160);
    if (!clean) continue;
    entities.add(clean);
    if (clean.includes('!')) entities.add(clean.slice(0, clean.indexOf('!')));
  }
  return [...entities];
}

export function matchesIncidentFilter(event: ParsedEventFeed, filter: Pick<IncidentFilter, 'categories' | 'severities' | 'query'>): boolean {
  const subscription = (event.subscription ?? event.category).toUpperCase();
  if (filter.categories.length > 0 && !filter.categories.includes(subscription)) return false;
  const severity = normalizedSeverity(event.severity);
  if (filter.severities.length > 0 && !filter.severities.includes(severity)) return false;
  const query = sanitizeIncidentText(filter.query, 120).toLocaleLowerCase();
  if (!query) return true;
  return [
    event.subscription, event.category, event.severity, event.verb, event.channel, event.subject,
    event.sender, event.detail, ...Object.entries(event.attrs).flat(),
  ].some((value) => value?.toLocaleLowerCase().includes(query));
}

export function matchesIncidentPivot(event: ParsedEventFeed, pivot: string): boolean {
  const target = sanitizeIncidentText(pivot, 160).toLocaleLowerCase();
  if (!target) return true;
  return incidentEntities(event).some((value) => value.toLocaleLowerCase() === target);
}

export function incidentTimeline(
  rows: IncidentTimelineRow[],
  filter: Pick<IncidentFilter, 'categories' | 'severities' | 'query'>,
  pivot = '',
): IncidentTimelineRow[] {
  return rows
    .filter((row) => matchesIncidentFilter(row.event, filter) && matchesIncidentPivot(row.event, pivot))
    .sort((a, b) => a.at - b.at)
    .slice(-500);
}

export function buildIncidentExport(input: {
  filter: Pick<IncidentFilter, 'name' | 'categories' | 'severities' | 'query'>;
  pivot: string;
  events: IncidentTimelineRow[];
  audit: OperatorAuditRecord[];
  generatedAt?: Date;
}): string {
  const payload = {
    schemaVersion: 1,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    filter: {
      name: sanitizeIncidentText(input.filter.name, 80),
      categories: input.filter.categories.slice(0, 32),
      severities: input.filter.severities.slice(0, INCIDENT_SEVERITIES.length),
      query: redactIncidentText(input.filter.query, 120),
    },
    pivot: redactIncidentText(input.pivot, 160),
    events: input.events.slice(-500).map((row) => ({
      at: new Date(row.at).toISOString(),
      category: row.event.category,
      subscription: row.event.subscription ?? row.event.category,
      severity: normalizedSeverity(row.event.severity),
      verb: row.event.verb ?? '',
      channel: redactIncidentText(row.event.channel ?? '', 160),
      subject: redactIncidentText(row.event.subject ?? '', 160),
      sender: redactIncidentText(row.event.sender ?? '', 160),
      detail: redactIncidentText(row.event.detail ?? '', 512),
      attrs: Object.fromEntries(Object.entries(row.event.attrs).slice(0, 40).map(([key, value]) => [
        sanitizeIncidentText(key, 80),
        SENSITIVE_KEY_RE.test(key) ? '<redacted>' : redactIncidentText(value, 256),
      ])),
    })),
    clientAudit: input.audit.slice(-200).map((entry) => ({
      at: new Date(entry.at).toISOString(),
      server: redactIncidentText(entry.server, 120),
      command: redactIncidentText(entry.command, 512),
      target: redactIncidentText(entry.target, 160),
      destructive: entry.destructive,
    })),
  };
  return JSON.stringify(payload, null, 2);
}

export function incidentExportFilename(now = new Date()): string {
  return `darkbear-incident-${now.toISOString().replace(/[:.]/g, '-')}.json`;
}

export function normalizedSeverity(value?: string): IncidentSeverity {
  const normalized = value?.toLocaleLowerCase();
  return INCIDENT_SEVERITIES.includes(normalized as IncidentSeverity)
    ? normalized as IncidentSeverity
    : 'info';
}
