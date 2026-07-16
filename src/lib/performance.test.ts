import { afterEach, describe, expect, it } from 'vitest';
import {
  applyPerformanceProfile,
  currentPerformanceTier,
  detectPerformanceProfile,
} from './performance';

afterEach(() => {
  document.documentElement.removeAttribute('data-performance');
});

describe('detectPerformanceProfile', () => {
  it('keeps full decorative quality when capability hints are healthy or absent', () => {
    expect(detectPerformanceProfile({})).toEqual({ tier: 'full', reasons: [] });
    expect(detectPerformanceProfile({
      deviceMemory: 8,
      hardwareConcurrency: 8,
      connection: { effectiveType: '4g', saveData: false },
    })).toEqual({ tier: 'full', reasons: [] });
  });

  it('drops optional quality for data-saving and slow-network preferences', () => {
    expect(detectPerformanceProfile({ connection: { saveData: true } })).toEqual({
      tier: 'low', reasons: ['data-saver'],
    });
    expect(detectPerformanceProfile({ connection: { effectiveType: '2g' } })).toEqual({
      tier: 'low', reasons: ['slow-network'],
    });
  });

  it('drops optional quality on two-GiB and two-core devices', () => {
    expect(detectPerformanceProfile({ deviceMemory: 2, hardwareConcurrency: 2 })).toEqual({
      tier: 'low', reasons: ['low-memory', 'low-core-count'],
    });
  });

  it('ignores invalid zero-value capability hints', () => {
    expect(detectPerformanceProfile({ deviceMemory: 0, hardwareConcurrency: 0 })).toEqual({
      tier: 'full', reasons: [],
    });
  });
});

describe('performance profile DOM contract', () => {
  it('applies and reads the root capability tier', () => {
    const profile = applyPerformanceProfile(document.documentElement, { deviceMemory: 1 });
    expect(profile.tier).toBe('low');
    expect(document.documentElement).toHaveAttribute('data-performance', 'low');
    expect(currentPerformanceTier()).toBe('low');
  });
});
