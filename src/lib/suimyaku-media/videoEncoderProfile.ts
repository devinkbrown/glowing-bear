import type { KaguraVisEncoder, KaguraVisProfile, OpcodecWasm } from './OpcodecWasm';
import type { NetworkQualityTier } from './types';

export interface TierResolution {
  width: number;
  height: number;
}

const TIER_RESOLUTIONS: Record<NetworkQualityTier, TierResolution> = {
  0: { width: Infinity, height: Infinity },
  1: { width: 1920, height: 1080 },
  2: { width: 1280, height: 720 },
  3: { width: 854, height: 480 },
};

/** Resolve an even YUV420 size without changing the source aspect ratio. */
export function tierDimensions(
  tier: NetworkQualityTier,
  profileWidth: number,
  profileHeight: number,
): TierResolution {
  const cap = TIER_RESOLUTIONS[tier];
  if (cap.width === Infinity) return { width: profileWidth, height: profileHeight };
  const aspectRatio = profileHeight / profileWidth;
  const width = Math.min(profileWidth, cap.width);
  const rawHeight = Math.min(profileHeight, Math.round(width * aspectRatio));
  return {
    width: width % 2 === 0 ? width : width - 1,
    height: rawHeight % 2 === 0 ? rawHeight : rawHeight - 1,
  };
}

/** Sizes the shipped KaguraVis encoder is known to accept, largest first. */
const ENCODER_FALLBACK_SIZES: ReadonlyArray<TierResolution> = [
  { width: 1280, height: 720 },
  { width: 1024, height: 576 },
  { width: 640, height: 360 },
  { width: 320, height: 240 },
];

function tryCreateEncoder(
  wasm: OpcodecWasm,
  width: number,
  height: number,
  quality: number,
  profile: KaguraVisProfile,
  fps: number,
): KaguraVisEncoder | null {
  try {
    return wasm.videoEncoder(width, height, quality, profile, fps);
  } catch {
    return null;
  }
}

/** Construct the encoder used by both worker and main-thread call paths. */
export function buildEncoder(
  wasm: OpcodecWasm,
  tier: NetworkQualityTier,
  profileWidth: number,
  profileHeight: number,
  quality: number,
  profile: KaguraVisProfile,
  fps: number,
): KaguraVisEncoder {
  const requested = tierDimensions(tier, profileWidth, profileHeight);
  const direct = tryCreateEncoder(wasm, requested.width, requested.height, quality, profile, fps);
  if (direct) return direct;

  for (const size of ENCODER_FALLBACK_SIZES) {
    if (size.width > requested.width) continue;
    const fallback = tryCreateEncoder(wasm, size.width, size.height, quality, profile, fps);
    if (fallback) return fallback;
  }

  const smallest = ENCODER_FALLBACK_SIZES[ENCODER_FALLBACK_SIZES.length - 1]!;
  return wasm.videoEncoder(smallest.width, smallest.height, quality, profile, fps);
}
