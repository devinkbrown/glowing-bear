import { describe, expect, it } from 'vitest';

import { parseSearchQuery, resolveWhen } from './grammar';

// Fixed injected clock: 2026-07-12 12:00 local. Expected local-midnight values
// are derived from the same Date math so the tests hold in any timezone.
const NOW = new Date(2026, 6, 12, 12, 0, 0, 0).getTime();

function midnight(offsetDays: number): number {
  const d = new Date(NOW);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d.getTime();
}

describe('parseSearchQuery — bare text', () => {
  it('treats an empty/whitespace query as empty', () => {
    for (const raw of ['', '   ', '\t']) {
      const q = parseSearchQuery(raw, NOW);
      expect(q.isEmpty).toBe(true);
      expect(q.text).toBeNull();
    }
  });

  it('keeps a bare term as a single lowercased substring (spacing preserved)', () => {
    const q = parseSearchQuery('Hello World', NOW);
    expect(q).toMatchObject({ from: null, in: null, before: null, after: null, text: 'hello world', isEmpty: false });
  });

  it('does not treat a colon inside free text as an operator', () => {
    const q = parseSearchQuery('http://example.com', NOW);
    expect(q.text).toBe('http://example.com');
    expect(q.in).toBeNull();
  });
});

describe('parseSearchQuery — operators', () => {
  it('parses from: as a lowercased nick substring', () => {
    const q = parseSearchQuery('from:Bob', NOW);
    expect(q).toMatchObject({ from: 'bob', text: null, isEmpty: false });
  });

  it('parses in: and strips a leading channel sigil', () => {
    expect(parseSearchQuery('in:#General', NOW).in).toBe('general');
    expect(parseSearchQuery('in:general', NOW).in).toBe('general');
    expect(parseSearchQuery('in:&local', NOW).in).toBe('local');
  });

  it('parses before:/after: absolute local dates', () => {
    const day = new Date(2024, 0, 15, 0, 0, 0, 0).getTime();
    expect(parseSearchQuery('before:2024-01-15', NOW).before).toBe(day);
    expect(parseSearchQuery('after:2024-01-15', NOW).after).toBe(day);
  });

  it('parses relative ages against the injected now', () => {
    expect(parseSearchQuery('after:3h', NOW).after).toBe(NOW - 3 * 3_600_000);
    expect(parseSearchQuery('before:2d', NOW).before).toBe(NOW - 2 * 86_400_000);
    expect(parseSearchQuery('after:45m', NOW).after).toBe(NOW - 45 * 60_000);
  });

  it('resolves a zero relative age to the injected now', () => {
    expect(parseSearchQuery('after:0m', NOW).after).toBe(NOW);
    expect(parseSearchQuery('before:0h', NOW).before).toBe(NOW);
  });

  it('parses today / yesterday keywords', () => {
    expect(parseSearchQuery('after:today', NOW).after).toBe(midnight(0));
    expect(parseSearchQuery('before:yesterday', NOW).before).toBe(midnight(-1));
  });

  it('accepts valid leap-day absolute dates', () => {
    const leapDay = new Date(2024, 1, 29, 0, 0, 0, 0).getTime();
    expect(parseSearchQuery('after:2024-02-29', NOW).after).toBe(leapDay);
  });

  it('combines multiple operators plus free text', () => {
    const q = parseSearchQuery('from:alice in:#dev after:1h deploy failed', NOW);
    expect(q).toMatchObject({
      from: 'alice',
      in: 'dev',
      after: NOW - 3_600_000,
      before: null,
      text: 'deploy failed',
      isEmpty: false,
    });
  });

  it('is case-insensitive on the operator key', () => {
    const q = parseSearchQuery('FROM:Bob IN:#Ops', NOW);
    expect(q).toMatchObject({ from: 'bob', in: 'ops' });
  });
});

describe('parseSearchQuery — malformed', () => {
  it('yields a null bound (no constraint) for an unparseable date', () => {
    expect(parseSearchQuery('before:notadate', NOW).before).toBeNull();
    expect(parseSearchQuery('after:2024-13-40', NOW).after).toBeNull();
    expect(parseSearchQuery('after:2024-02-31', NOW).after).toBeNull();
  });

  it('a lone before: with a bad value still counts as an operator (empty text)', () => {
    const q = parseSearchQuery('before:xyz', NOW);
    expect(q.before).toBeNull();
    expect(q.text).toBeNull();
    expect(q.isEmpty).toBe(true);
  });

  it('a dangling before:/after: counts as an empty malformed date operator', () => {
    for (const raw of ['before:', 'after:']) {
      const q = parseSearchQuery(raw, NOW);
      expect(q.before).toBeNull();
      expect(q.after).toBeNull();
      expect(q.text).toBeNull();
      expect(q.isEmpty).toBe(true);
    }
  });

  it('a dangling from:/in: with no value falls back to free text', () => {
    const q = parseSearchQuery('from:', NOW);
    expect(q.from).toBeNull();
    expect(q.text).toBe('from:');
    expect(q.isEmpty).toBe(false);
  });

  it('keeps dangling from:/in: tokens as free text alongside real operators', () => {
    const q = parseSearchQuery('from: in:#dev in:', NOW);
    expect(q).toMatchObject({ from: null, in: 'dev', text: 'from: in:', isEmpty: false });
  });
});

describe('resolveWhen', () => {
  it('returns null for empty and garbage tokens', () => {
    expect(resolveWhen('', NOW)).toBeNull();
    expect(resolveWhen('soon', NOW)).toBeNull();
    expect(resolveWhen('3', NOW)).toBeNull();
    expect(resolveWhen('3w', NOW)).toBeNull();
  });
});
