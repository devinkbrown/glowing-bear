import { describe, expect, it } from 'vitest';
import { selectAlertOwner, type AlertPeerState } from './tabAlertCoordinator';

const NOW = 20_000;

function peer(id: string, over: Partial<AlertPeerState> = {}): AlertPeerState {
  return { id, active: true, focused: false, lastSeen: NOW, ...over };
}

describe('selectAlertOwner', () => {
  it('elects one stable owner from connected background tabs', () => {
    expect(selectAlertOwner([peer('tab-zulu'), peer('tab-alpha')], NOW)).toBe('tab-alpha');
  });

  it('prefers the focused connected tab so background tabs stay silent', () => {
    expect(selectAlertOwner([
      peer('tab-alpha'),
      peer('tab-zulu', { focused: true }),
    ], NOW)).toBe('tab-zulu');
  });

  it('ignores disconnected, stale, and future-dated peers', () => {
    expect(selectAlertOwner([
      peer('tab-disconnected', { active: false }),
      peer('tab-stale', { lastSeen: NOW - 15_001 }),
      peer('tab-future', { lastSeen: NOW + 1 }),
      peer('tab-live'),
    ], NOW)).toBe('tab-live');
  });

  it('returns null when no live connected tab is eligible', () => {
    expect(selectAlertOwner([peer('tab-offline', { active: false })], NOW)).toBeNull();
  });
});
