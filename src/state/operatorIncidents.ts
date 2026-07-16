import { createStore, produce } from 'solid-js/store';
import {
  INCIDENT_SEVERITIES,
  redactIncidentText,
  sanitizeIncidentText,
} from '@/lib/operatorIncident';
import type {
  IncidentFilter,
  IncidentSeverity,
  OperatorAuditRecord,
} from '@/lib/operatorIncident';

const FILTERS_KEY = 'darkbear_operator_filters_v1';
const AUDIT_KEY = 'darkbear_operator_audit_v1';
export const MAX_INCIDENT_FILTERS = 20;
export const MAX_OPERATOR_AUDIT = 200;

interface OperatorIncidentState {
  filters: IncidentFilter[];
  audit: OperatorAuditRecord[];
}

function readArray(key: string): unknown[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function normalizeStringArray(value: unknown, max: number, transform: (value: string) => string): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string')
    .map(transform).filter(Boolean))].slice(0, max);
}

function normalizeFilter(value: unknown): IncidentFilter | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const id = sanitizeIncidentText(typeof source.id === 'string' ? source.id : '', 80);
  const name = sanitizeIncidentText(typeof source.name === 'string' ? source.name : '', 80);
  if (!id || !name) return null;
  const severities = normalizeStringArray(source.severities, INCIDENT_SEVERITIES.length, (item) => item.toLocaleLowerCase())
    .filter((item): item is IncidentSeverity => INCIDENT_SEVERITIES.includes(item as IncidentSeverity));
  return {
    id,
    name,
    categories: normalizeStringArray(source.categories, 32, (item) => item.toUpperCase()),
    severities,
    query: sanitizeIncidentText(typeof source.query === 'string' ? source.query : '', 120),
    createdAt: typeof source.createdAt === 'number' && Number.isFinite(source.createdAt) ? source.createdAt : 0,
  };
}

function normalizeAudit(value: unknown): OperatorAuditRecord | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const id = sanitizeIncidentText(typeof source.id === 'string' ? source.id : '', 80);
  const command = redactIncidentText(typeof source.command === 'string' ? source.command : '', 512);
  if (!id || !command) return null;
  return {
    id,
    at: typeof source.at === 'number' && Number.isFinite(source.at) ? source.at : 0,
    server: redactIncidentText(typeof source.server === 'string' ? source.server : '', 120),
    command,
    target: redactIncidentText(typeof source.target === 'string' ? source.target : '', 160),
    destructive: source.destructive === true,
  };
}

const [state, setState] = createStore<OperatorIncidentState>({
  filters: readArray(FILTERS_KEY).map(normalizeFilter).filter((item): item is IncidentFilter => item !== null).slice(0, MAX_INCIDENT_FILTERS),
  audit: readArray(AUDIT_KEY).map(normalizeAudit).filter((item): item is OperatorAuditRecord => item !== null).slice(0, MAX_OPERATOR_AUDIT),
});

export { state as operatorIncidentState };

function persistFilters(): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(FILTERS_KEY, JSON.stringify(state.filters));
}

function persistAudit(): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(AUDIT_KEY, JSON.stringify(state.audit));
}

function nextId(prefix: string): string {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

export function saveIncidentFilter(input: {
  name: string;
  categories: string[];
  severities: IncidentSeverity[];
  query: string;
}): IncidentFilter | null {
  const name = sanitizeIncidentText(input.name, 80);
  if (!name) return null;
  const filter = normalizeFilter({ ...input, id: nextId('filter'), createdAt: Date.now() });
  if (!filter) return null;
  setState('filters', (items) => [filter, ...items.filter((item) => item.name.toLocaleLowerCase() !== name.toLocaleLowerCase())].slice(0, MAX_INCIDENT_FILTERS));
  persistFilters();
  return filter;
}

export function deleteIncidentFilter(id: string): void {
  setState('filters', (items) => items.filter((item) => item.id !== id));
  persistFilters();
}

export function clearIncidentFilters(): void {
  setState('filters', []);
  persistFilters();
}

export function recordOperatorCommand(input: {
  server: string;
  command: string;
  target?: string;
  destructive?: boolean;
  at?: number;
}): OperatorAuditRecord | null {
  const command = redactIncidentText(input.command, 512);
  if (!command) return null;
  const entry: OperatorAuditRecord = {
    id: nextId('audit'),
    at: input.at ?? Date.now(),
    server: redactIncidentText(input.server, 120),
    command,
    target: redactIncidentText(input.target ?? '', 160),
    destructive: input.destructive === true,
  };
  setState(produce((draft) => {
    draft.audit.unshift(entry);
    if (draft.audit.length > MAX_OPERATOR_AUDIT) draft.audit.length = MAX_OPERATOR_AUDIT;
  }));
  persistAudit();
  return entry;
}

export function clearOperatorAudit(): void {
  setState('audit', []);
  persistAudit();
}

export function resetOperatorIncidents(): void {
  setState({ filters: [], audit: [] });
  persistFilters();
  persistAudit();
}
