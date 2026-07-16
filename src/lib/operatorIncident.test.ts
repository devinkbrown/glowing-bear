import { describe, expect, it } from 'vitest';
import type { ParsedEventFeed } from '@/lib/ircx/parser';
import {
  buildIncidentExport,
  incidentEntities,
  incidentTimeline,
  matchesIncidentFilter,
  redactIncidentText,
} from './operatorIncident';
import type { IncidentSeverity } from './operatorIncident';

function event(over: Partial<ParsedEventFeed> = {}): ParsedEventFeed {
  return {
    type: 'event_feed', kind: 'event', raw: 'raw-secret', category: 'USER',
    verb: 'CONNECT', subject: 'alice!u@10.0.0.1', attrs: {}, severity: 'notice',
    ...over,
  };
}

describe('operator incident helpers', () => {
  it('filters by category, severity and query while correlating nick/channel pivots', () => {
    const filter = { categories: ['USER', 'MEMBER'], severities: ['notice'] as IncidentSeverity[], query: 'alice' };
    expect(matchesIncidentFilter(event(), filter)).toBe(true);
    expect(incidentEntities(event())).toEqual(['alice!u@10.0.0.1', 'alice']);

    const rows = [
      { id: '2', at: 2, event: event({ category: 'MEMBER', channel: '#root', subject: 'alice' }) },
      { id: '1', at: 1, event: event() },
      { id: '3', at: 3, event: event({ subject: 'bob' }) },
    ];
    expect(incidentTimeline(rows, filter, 'alice').map((row) => row.id)).toEqual(['1', '2']);
  });

  it('redacts endpoints, userhosts, secrets and opaque key material', () => {
    const redacted = redactIncidentText('alice!u@private.host 10.0.0.1 password hunter2 token=abcd https://private.test/a AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    expect(redacted).toContain('alice!<redacted>@<redacted>');
    expect(redacted).toContain('<ip>');
    expect(redacted).toContain('password=<redacted>');
    expect(redacted).toContain('token=<redacted>');
    expect(redacted).toContain('<url>');
    expect(redacted).not.toContain('private.host');
    expect(redacted).toContain('<opaque>');
    expect(redacted).not.toContain('hunter2');
    expect(redacted).not.toContain('private.test');
  });

  it('exports only bounded structured redacted events and client audit records', () => {
    const json = buildIncidentExport({
      generatedAt: new Date('2026-07-16T12:00:00Z'),
      filter: { name: 'security', categories: ['USER'], severities: ['notice'], query: '' },
      pivot: 'alice',
      events: [{ id: '1', at: 1, event: event({ detail: 'token=private-token', attrs: { ip: '10.0.0.1', account: 'private-account' } }) }],
      audit: [{ id: 'a', at: 2, server: 'private.example', command: 'KILL alice :token=private-token', target: 'alice', destructive: true }],
    });
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed).toMatchObject({ schemaVersion: 1, generatedAt: '2026-07-16T12:00:00.000Z', pivot: 'alice' });
    expect(json).not.toContain('raw-secret');
    expect(json).not.toContain('private-token');
    expect(json).not.toContain('10.0.0.1');
    expect(json).not.toContain('private-account');
    expect(json).not.toContain('private.example');
  });
});
