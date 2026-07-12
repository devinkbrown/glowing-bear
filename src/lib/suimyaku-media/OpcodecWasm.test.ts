import { describe, expect, it, vi } from 'vitest';

import { normalizeModule, rgbaToYuv420, type RawEmModule, yuv420ToRgba } from './OpcodecWasm';

// These tests cover the cwrap→ccall normalization that fixes the
// "Codec unavailable" failures: the shipped opcodec Emscripten build exports
// `cwrap` but NOT `ccall`, yet the rest of OpcodecWasm.ts calls `m.ccall(...)`.

const heaps = () => ({
  HEAPU8:  new Uint8Array(8),
  HEAP16:  new Int16Array(8),
  HEAPF32: new Float32Array(8),
});

describe('normalizeModule', () => {
  it('returns the module unchanged when ccall already exists', () => {
    const ccall = vi.fn(() => 42);
    const raw: RawEmModule = { ...heaps(), ccall };
    const m = normalizeModule(raw);
    expect(m).toBe(raw);
    expect(m.ccall('foo', 'number', [], [])).toBe(42);
    expect(ccall).toHaveBeenCalledTimes(1);
  });

  it('synthesizes ccall from cwrap when ccall is missing', () => {
    const wrapped = vi.fn((a: number, b: number) => a + b);
    const cwrap = vi.fn(() => wrapped as unknown as (...args: unknown[]) => unknown);
    const raw: RawEmModule = { ...heaps(), cwrap };

    const m = normalizeModule(raw);
    expect(typeof m.ccall).toBe('function');

    const result = m.ccall('opvox_wasm_enc_create', 'number', ['number', 'number'], [48000, 2]);
    expect(result).toBe(48002);
    expect(cwrap).toHaveBeenCalledWith('opvox_wasm_enc_create', 'number', ['number', 'number']);
    expect(wrapped).toHaveBeenCalledWith(48000, 2);
  });

  it('memoizes wrapped functions per name+signature', () => {
    const cwrap = vi.fn(() => ((x: number) => x * 2) as unknown as (...args: unknown[]) => unknown);
    const m = normalizeModule({ ...heaps(), cwrap });

    m.ccall('opcodec_alloc_u8', 'number', ['number'], [10]);
    m.ccall('opcodec_alloc_u8', 'number', ['number'], [20]);
    // Same name+signature → cwrap invoked once, reused on the second call.
    expect(cwrap).toHaveBeenCalledTimes(1);

    // Different return/arg signature → a distinct wrapper is created.
    m.ccall('opcodec_alloc_u8', null, ['number', 'number'], [1, 2]);
    expect(cwrap).toHaveBeenCalledTimes(2);
  });

  it('passes null return types and void args through to cwrap', () => {
    const wrapped = vi.fn(() => undefined);
    const cwrap = vi.fn(() => wrapped as unknown as (...args: unknown[]) => unknown);
    const m = normalizeModule({ ...heaps(), cwrap });

    const r = m.ccall('opcodec_free', null, ['number'], [123]);
    expect(r).toBeUndefined();
    expect(cwrap).toHaveBeenCalledWith('opcodec_free', null, ['number']);
    expect(wrapped).toHaveBeenCalledWith(123);
  });

  it('throws when the module exposes neither ccall nor cwrap', () => {
    expect(() => normalizeModule(heaps() as RawEmModule)).toThrow(/neither ccall nor cwrap/);
  });
});

describe('YUV/RGBA conversion helpers', () => {
  it('converts neutral YUV420 luminance to grayscale RGBA with opaque alpha', () => {
    const out = new Uint8ClampedArray(2 * 2 * 4);

    yuv420ToRgba(
      new Uint8Array([10, 20, 30, 40]),
      new Uint8Array([128]),
      new Uint8Array([128]),
      2,
      2,
      out,
    );

    expect(Array.from(out)).toEqual([
      10, 10, 10, 255,
      20, 20, 20, 255,
      30, 30, 30, 255,
      40, 40, 40, 255,
    ]);
  });

  it('clamps hostile YUV chroma extremes into byte-range RGBA output', () => {
    const out = new Uint8ClampedArray(4);

    yuv420ToRgba(
      new Uint8Array([128]),
      new Uint8Array([255]),
      new Uint8Array([0]),
      1,
      1,
      out,
    );

    expect(Array.from(out)).toEqual([0, 176, 255, 255]);
  });

  it('does not throw on undersized YUV planes and produces initialized pixels', () => {
    const out = new Uint8ClampedArray([9, 9, 9, 9]);

    expect(() => yuv420ToRgba(new Uint8Array(), new Uint8Array(), new Uint8Array(), 1, 1, out))
      .not.toThrow();

    expect(Array.from(out)).toEqual([0, 0, 0, 255]);
  });

  it('samples RGBA into YUV420 planes at 2x2 boundaries', () => {
    const rgba = new Uint8ClampedArray([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
      255, 255, 255, 255,
    ]);

    const { y, u, v } = rgbaToYuv420(rgba, 2, 2);

    expect(Array.from(y)).toEqual([76, 149, 29, 255]);
    expect(Array.from(u)).toEqual([84]);
    expect(Array.from(v)).toEqual([255]);
  });

  it('zero-fills missing RGBA source bytes instead of leaking stale plane data', () => {
    const { y, u, v } = rgbaToYuv420(new Uint8ClampedArray([255]), 2, 2);

    expect(Array.from(y)).toEqual([0, 0, 0, 0]);
    expect(Array.from(u)).toEqual([0]);
    expect(Array.from(v)).toEqual([0]);
  });
});
