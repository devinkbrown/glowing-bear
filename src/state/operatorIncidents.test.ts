import { beforeEach, describe, expect, it } from 'vitest';

const values = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    get length() { return values.size; }, clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, String(value)),
  } satisfies Storage,
});

import {
  MAX_INCIDENT_FILTERS,
  MAX_OPERATOR_AUDIT,
  deleteIncidentFilter,
  operatorIncidentState,
  recordOperatorCommand,
  resetOperatorIncidents,
  saveIncidentFilter,
} from './operatorIncidents';

beforeEach(() => resetOperatorIncidents());

describe('operator incident state', () => {
  it('saves normalized named filters, replaces names, deletes, and caps the list', () => {
    saveIncidentFilter({ name: ' Security\n', categories: ['user', 'USER'], severities: ['notice'], query: 'alice\n' });
    saveIncidentFilter({ name: 'security', categories: ['member'], severities: ['warn'], query: '' });
    expect(operatorIncidentState.filters).toHaveLength(1);
    expect(operatorIncidentState.filters[0]).toMatchObject({ name: 'security', categories: ['MEMBER'], severities: ['warn'] });

    for (let i = 0; i < MAX_INCIDENT_FILTERS + 5; i++) {
      saveIncidentFilter({ name: `filter ${i}`, categories: [], severities: [], query: '' });
    }
    expect(operatorIncidentState.filters).toHaveLength(MAX_INCIDENT_FILTERS);
    deleteIncidentFilter(operatorIncidentState.filters[0]!.id);
    expect(operatorIncidentState.filters).toHaveLength(MAX_INCIDENT_FILTERS - 1);
  });

  it('records only redacted bounded commands and retains the newest audit entries', () => {
    for (let i = 0; i < MAX_OPERATOR_AUDIT + 5; i++) {
      recordOperatorCommand({
        server: 'private.example',
        command: `WARD ADD MASK alice!u@10.0.0.1 token=secret-${i}`,
        target: 'alice!u@10.0.0.1',
        destructive: true,
        at: i,
      });
    }
    expect(operatorIncidentState.audit).toHaveLength(MAX_OPERATOR_AUDIT);
    expect(operatorIncidentState.audit[0]?.at).toBe(MAX_OPERATOR_AUDIT + 4);
    expect(JSON.stringify(operatorIncidentState.audit)).not.toContain('secret-');
    expect(operatorIncidentState.audit[0]).toMatchObject({ destructive: true, target: 'alice!<redacted>@<redacted>' });
  });
});
