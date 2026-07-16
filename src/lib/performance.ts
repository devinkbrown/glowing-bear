// Capability-based decorative quality profile.
//
// This deliberately uses only coarse, non-identifying browser hints. The
// result controls optional scene/blur work; chat, archive, media, and protocol
// behavior are identical in both tiers. Missing hints default to full quality.

export type PerformanceTier = 'full' | 'low';

export type PerformanceReason =
  | 'data-saver'
  | 'slow-network'
  | 'low-memory'
  | 'low-core-count';

export interface CapabilityNavigator {
  readonly deviceMemory?: number;
  readonly hardwareConcurrency?: number;
  readonly connection?: {
    readonly saveData?: boolean;
    readonly effectiveType?: string;
  };
}

export interface PerformanceProfile {
  readonly tier: PerformanceTier;
  readonly reasons: readonly PerformanceReason[];
}

const LOW_MEMORY_GIB = 2;
const LOW_CORE_COUNT = 2;
const SLOW_CONNECTIONS = new Set(['slow-2g', '2g']);

export function detectPerformanceProfile(capabilities: CapabilityNavigator): PerformanceProfile {
  const reasons: PerformanceReason[] = [];
  if (capabilities.connection?.saveData === true) reasons.push('data-saver');
  if (SLOW_CONNECTIONS.has(capabilities.connection?.effectiveType ?? '')) reasons.push('slow-network');
  if (
    typeof capabilities.deviceMemory === 'number' &&
    capabilities.deviceMemory > 0 &&
    capabilities.deviceMemory <= LOW_MEMORY_GIB
  ) {
    reasons.push('low-memory');
  }
  if (
    typeof capabilities.hardwareConcurrency === 'number' &&
    capabilities.hardwareConcurrency > 0 &&
    capabilities.hardwareConcurrency <= LOW_CORE_COUNT
  ) {
    reasons.push('low-core-count');
  }
  return { tier: reasons.length > 0 ? 'low' : 'full', reasons };
}

function browserCapabilities(): CapabilityNavigator {
  if (typeof navigator === 'undefined') return {};
  return navigator as Navigator & CapabilityNavigator;
}

/** Apply the coarse profile before the Solid tree mounts. */
export function applyPerformanceProfile(
  root: HTMLElement | undefined = typeof document === 'undefined' ? undefined : document.documentElement,
  capabilities: CapabilityNavigator = browserCapabilities(),
): PerformanceProfile {
  const profile = detectPerformanceProfile(capabilities);
  if (root) root.dataset.performance = profile.tier;
  return profile;
}

/** Read the applied profile, falling back to detection for isolated renders. */
export function currentPerformanceTier(
  root: HTMLElement | undefined = typeof document === 'undefined' ? undefined : document.documentElement,
): PerformanceTier {
  const applied = root?.dataset.performance;
  if (applied === 'full' || applied === 'low') return applied;
  return detectPerformanceProfile(browserCapabilities()).tier;
}
