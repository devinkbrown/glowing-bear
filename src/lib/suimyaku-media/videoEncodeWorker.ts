/**
 * videoEncodeWorker.ts — Off-main-thread video capture/encode worker.
 *
 * PROTOCOL (MessageEvent.data shapes):
 *
 * Main → Worker:
 *   { type: 'init', wasmUrl: string, encWidth: number, encHeight: number,
 *     encQuality: number, encProfile: 'camera'|'screen', encFps: number,
 *     track?: MediaStreamTrack, readable?: ReadableStream<VideoFrame> }
 *     — Start the capture/encode loop. Exactly one frame source is provided:
 *       `track` (a transferable MediaStreamTrack — the worker wraps it in a
 *       MediaStreamTrackProcessor) OR `readable` (a ReadableStream of
 *       VideoFrames already derived from a MediaStreamTrackProcessor on the
 *       main thread, used when MediaStreamTrack is not transferable in this
 *       Chromium). Whichever is present is transferred via the transfer list.
 *
 *   { type: 'tier', tier: 0|1|2|3 }
 *     — Update the adaptive-resolution tier. The worker scales its draw
 *       canvas to the tier's resolution on the next VideoFrame.
 *
 *   { type: 'keyreq' }
 *     — Force the next encode to be a keyframe.
 *
 *   { type: 'stop' }
 *     — Tear down reader and encoder; worker exits after this.
 *
 * Worker → Main:
 *   { type: 'encoded', data: Uint8Array, ftype: 'KEYFRAME'|'FRAME',
 *     encodeMs: number, frameBudgetMs: number }
 *     — One encoded kaguravis frame. `data.buffer` is transferred (zero-copy).
 *
 *   { type: 'ready' }
 *     — WASM loaded and encoder initialised; capture loop running.
 *
 *   { type: 'error', msg: string }
 *     — Fatal or non-fatal diagnostic.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Tier → draw resolution mapping:
 *
 *   Tier 0 — full profile resolution  (no downscale)
 *   Tier 1 — 1920 × 1080  (cap at 1080p)
 *   Tier 2 — 1280 × 720   (cap at 720p)
 *   Tier 3 — 854  × 480   (cap at 480p; audio-only gate handled in engine)
 *
 * When the draw size is smaller than the encoder dimensions the OffscreenCanvas
 * is created at the tier size AND a new KaguraVisEncoder is created at that size
 * so the WASM codec always receives frames at its configured dimensions.
 *
 * Re-initialising the encoder on a tier change is intentional: the codec
 * must be consistent with the YUV plane sizes it receives.
 */


import { OpcodecWasm, KaguraVisEncoder, rgbaToYuv420 } from './OpcodecWasm';
import type { KaguraVisProfile } from './OpcodecWasm';
import type { NetworkQualityTier } from './types';
import { buildEncoder, tierDimensions } from './videoEncoderProfile';

// ─────────────────────────────────────────────────────────────────────────────
// Tier → capped resolution table
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Worker state
// ─────────────────────────────────────────────────────────────────────────────

interface WorkerState {
  wasm:         OpcodecWasm;
  enc:          KaguraVisEncoder;
  reader:       ReadableStreamDefaultReader<VideoFrame>;
  profileWidth: number;
  profileHeight: number;
  profileQuality: number;
  profileFps:   number;
  encProfile:   KaguraVisProfile;
  tier:         NetworkQualityTier;
  forceKey:     boolean;
  frameCount:   number;
  stopped:      boolean;
}

let state: WorkerState | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Encoder initialisation (also called on tier change)
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Main capture loop — runs until stopped or reader closes
// ─────────────────────────────────────────────────────────────────────────────

async function captureLoop(s: WorkerState): Promise<void> {
  /* Track the current draw dimensions so we can rebuild the OffscreenCanvas
   * when the tier changes without allocating one per frame. */
  let drawW = s.enc.width;
  let drawH = s.enc.height;
  let canvas = new OffscreenCanvas(drawW, drawH);
  let ctx    = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
  /* Remember the tier-target size the current encoder was built FOR. The
   * encoder's own dimensions may differ (codec fallback), so we must compare
   * the new tier target against the last requested target — not against
   * s.enc.width — or a fallback would trigger an endless per-frame rebuild. */
  let builtForW = tierDimensions(s.tier, s.profileWidth, s.profileHeight).width;
  let builtForH = tierDimensions(s.tier, s.profileWidth, s.profileHeight).height;

  while (true) {
    if (s.stopped) break;

    let result: ReadableStreamReadResult<VideoFrame>;
    try {
      result = await s.reader.read();
    } catch {
      // Track ended or reader cancelled — normal shutdown path.
      break;
    }
    if (result.done) break;

    const frame = result.value;

    s.frameCount += 1;
    const skipMod = s.tier === 0 ? 1 : s.tier === 1 ? 2 : 4;
    if (s.frameCount % skipMod !== 0) {
      frame.close();
      continue;
    }

    /* Rebuild canvas + encoder if the tier's target size differs from what the
     * encoder is currently using. We compare against the encoder's ACTUAL
     * dimensions (s.enc.width/height) rather than the tier target, because the
     * codec may have fallen back to a different size than tierDimensions asked
     * for. After (re)building, draw dimensions are taken from the encoder so the
     * YUV planes always match exactly what the WASM encoder expects. */
    const { width: targetW, height: targetH } = tierDimensions(
      s.tier, s.profileWidth, s.profileHeight,
    );
    if (targetW !== builtForW || targetH !== builtForH) {
      builtForW = targetW;
      builtForH = targetH;
      s.enc.destroy();
      s.enc = buildEncoder(
        s.wasm, s.tier,
        s.profileWidth, s.profileHeight,
        s.profileQuality, s.encProfile, s.profileFps,
      );
      drawW = s.enc.width;
      drawH = s.enc.height;
      canvas = new OffscreenCanvas(drawW, drawH);
      ctx    = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
    }

    if (!ctx) { frame.close(); continue; }

    const encodeStartedAt = performance.now();

    /* Draw the VideoFrame into the (possibly downscaled) OffscreenCanvas. */
    ctx.drawImage(frame as unknown as ImageBitmap, 0, 0, drawW, drawH);
    frame.close();

    /* Rasterise to RGBA and convert to YUV420P. */
    let imageData: ImageData;
    try {
      imageData = ctx.getImageData(0, 0, drawW, drawH);
    } catch {
      continue;
    }
    const { y, u, v } = rgbaToYuv420(imageData.data, drawW, drawH);

    const periodicRecoveryKey = s.tier >= 2 && s.frameCount % Math.max(1, s.profileFps) === 0;
    const forceKey = s.forceKey || periodicRecoveryKey;
    s.forceKey = false;

    /* Encode via WASM. The keyframe flag is also driven internally by
     * KaguraVisEncoder.keyframeInterval — we only override via forceKey. */
    let encoded: Uint8Array;
    try {
      encoded = s.enc.encode(y, u, v, forceKey);
    } catch {
      continue;
    }
    if (!encoded.length) continue;

    const ftype: 'KEYFRAME' | 'FRAME' = encoded[0] === 0xFF ? 'KEYFRAME' : 'FRAME';
    if (s.tier >= 2 && ftype !== 'KEYFRAME') continue;

    /* Transfer the buffer to avoid a copy across the thread boundary.
     * Use the WindowPostMessageOptions overload so TypeScript accepts the
     * transfer list in a DOM-typed module context. */
    const transfer = encoded.buffer.slice(0) as ArrayBuffer;
    self.postMessage(
      {
        type: 'encoded',
        data: new Uint8Array(transfer),
        ftype,
        encodeMs: performance.now() - encodeStartedAt,
        frameBudgetMs: 1000 / Math.max(1, s.profileFps),
      },
      { transfer: [transfer] },
    );
  }

  /* Clean up on exit. */
  if (state?.enc) { state.enc.destroy(); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Message dispatcher
// ─────────────────────────────────────────────────────────────────────────────

self.onmessage = async (event: MessageEvent) => {
  const msg = event.data as {
    type: 'init' | 'tier' | 'keyreq' | 'stop';
    wasmUrl?: string;
    encWidth?: number;
    encHeight?: number;
    encQuality?: number;
    encProfile?: KaguraVisProfile;
    encFps?: number;
    track?: MediaStreamTrack;
    readable?: ReadableStream<VideoFrame>;
    tier?: NetworkQualityTier;
  };

  switch (msg.type) {
    case 'init': {
      if (state) {
        /* Already initialised — shouldn't happen but guard anyway. */
        self.postMessage({ type: 'error', msg: 'Worker already initialised' });
        return;
      }
      const {
        // Fallback only — a worker can't read import.meta.env, so the main
        // thread (MediaEngine) always resolves the base-aware URL (e.g.
        // '/darkbear/opcodec_wasm.js') and passes it in this init message.
        wasmUrl = '/opcodec_wasm.js',
        encWidth  = 1920,
        encHeight = 1080,
        encQuality = 70,
        encProfile = 'camera' as KaguraVisProfile,
        encFps    = 60,
        track,
        readable,
      } = msg;

      if (!track && !readable) {
        self.postMessage({ type: 'error', msg: 'No track or readable provided to worker' });
        return;
      }

      /* Load the WASM codec inside the worker (worker-safe path via importScripts
       * / fetch — see OpcodecWasm.loadInWorker). */
      let wasm: OpcodecWasm;
      try {
        wasm = await OpcodecWasm.loadInWorker(wasmUrl);
      } catch (err) {
        self.postMessage({ type: 'error', msg: `WASM load failed in worker: ${err}` });
        return;
      }

      const tier: NetworkQualityTier = 0;
      let enc: KaguraVisEncoder;
      try {
        enc = buildEncoder(wasm, tier, encWidth, encHeight, encQuality, encProfile, encFps);
      } catch (err) {
        self.postMessage({ type: 'error', msg: `Encoder init failed: ${err}` });
        return;
      }

      /* Obtain a VideoFrame stream. Either the main thread transferred a raw
       * MediaStreamTrack (wrap it in a MediaStreamTrackProcessor here) or it
       * already transferred a ReadableStream<VideoFrame> derived from one. */
      let frameStream: ReadableStream<VideoFrame>;
      if (readable) {
        frameStream = readable;
      } else {
        const processor = new (globalThis as any).MediaStreamTrackProcessor({ track });
        frameStream = processor.readable as ReadableStream<VideoFrame>;
      }
      const reader: ReadableStreamDefaultReader<VideoFrame> = frameStream.getReader();

      state = {
        wasm,
        enc,
        reader,
        profileWidth:  encWidth,
        profileHeight: encHeight,
        profileQuality: encQuality,
        profileFps:    encFps,
        encProfile,
        tier,
        forceKey: false,
        frameCount: 0,
        stopped:  false,
      };

      self.postMessage({ type: 'ready' });
      captureLoop(state).catch(err => {
        self.postMessage({ type: 'error', msg: `Capture loop error: ${err}` });
      });
      break;
    }

    case 'tier': {
      if (!state) return;
      const newTier = msg.tier ?? 0;
      if (newTier !== state.tier) {
        state.tier = newTier;
        /* Encoder and canvas are rebuilt lazily at the start of the next frame
         * inside captureLoop to avoid races. */
      }
      break;
    }

    case 'keyreq': {
      if (state) state.forceKey = true;
      break;
    }

    case 'stop': {
      if (state) {
        state.stopped = true;
        try { await state.reader.cancel(); } catch { /* ignore */ }
        state = null;
      }
      break;
    }
  }
};
