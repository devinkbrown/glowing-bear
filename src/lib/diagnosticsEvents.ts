export type DiagnosticEventKind =
  | 'relay-state'
  | 'relay-phase'
  | 'relay-error'
  | 'bridge-state'
  | 'media-state';

export interface DiagnosticEvent {
  at: string;
  kind: DiagnosticEventKind;
  value?: string;
}

const MAX_EVENTS = 80;
const events: DiagnosticEvent[] = [];

export function recordDiagnosticEvent(kind: DiagnosticEventKind, value?: string): void {
  events.push({ at: new Date().toISOString(), kind, value: value?.slice(0, 40) });
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
}

export function snapshotDiagnosticEvents(): DiagnosticEvent[] {
  return events.map((event) => ({ ...event }));
}

export function resetDiagnosticEvents(): void {
  events.length = 0;
}
