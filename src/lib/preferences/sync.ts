import type { NotifyMode } from '@/lib/notifyDecision';
import type { ThemeId } from '@/types';

/**
 * Versioned, account-scoped preference metadata.
 *
 * Orochi bounds each METADATA value to 512 bytes. Small preference families
 * live in the manifest; the two name-keyed collections are split into bounded,
 * generation-tagged parts so a partially observed publish is never applied.
 */
export const PREFERENCE_METADATA_PREFIX = 'darkbear.pref.v1';
export const PREFERENCE_MANIFEST_KEY = `${PREFERENCE_METADATA_PREFIX}.manifest`;
export const MAX_METADATA_VALUE_BYTES = 512;
export const MAX_COLLECTION_PARTS = 16;
export const MAX_COLLECTION_ENTRIES = 128;

const MAX_NAME_BYTES = 192;
const DEVICE_ID_RE = /^[a-f0-9]{32}$/;
const THEMES = new Set<ThemeId>([
  'darkbear', 'midnight', 'obsidian', 'nord', 'gruvbox', 'rose-pine',
  'abyss', 'ember', 'aurora', 'catppuccin', 'tokyo-night', 'dracula',
  'solarized', 'starfield', 'lightning', 'phoenix', 'retro', 'light', 'custom',
]);
const FONT_FAMILIES = new Set(['system', 'mono', 'serif']);

export interface PreferenceStamp {
  clock: number;
  updatedAt: number;
  deviceId: string;
}

export interface AppearancePreferences {
  theme: ThemeId;
}

export interface AccessibilityPreferences {
  fontFamily: 'system' | 'mono' | 'serif';
  fontSize: number;
  sceneMotion: 'auto' | 'reduced';
  readMarker: boolean;
}

export interface NotificationPreferences {
  enabled: boolean;
  sound: boolean;
  readOnFocus: boolean;
}

export interface BufferPreference {
  pinned: boolean;
  notify: NotifyMode;
}

export interface PreferenceValues {
  appearance: AppearancePreferences;
  accessibility: AccessibilityPreferences;
  notifications: NotificationPreferences;
  buffers: Record<string, BufferPreference>;
  read: Record<string, number>;
}

export interface StampedPreferenceSection<T> {
  stamp: PreferenceStamp;
  value: T;
}

export interface PreferenceDocument {
  version: 1;
  appearance: StampedPreferenceSection<AppearancePreferences>;
  accessibility: StampedPreferenceSection<AccessibilityPreferences>;
  notifications: StampedPreferenceSection<NotificationPreferences>;
  buffers: StampedPreferenceSection<Record<string, BufferPreference>>;
  read: StampedPreferenceSection<Record<string, number>>;
}

export interface PreferenceMetadataEntry {
  key: string;
  value: string;
}

type WireStamp = [clock: number, updatedAt: number, deviceId: string];
type WireManifest = {
  v: 1;
  a: [WireStamp, ThemeId];
  x: [WireStamp, AccessibilityPreferences['fontFamily'], number, 0 | 1, 0 | 1];
  n: [WireStamp, 0 | 1, 0 | 1, 0 | 1];
  b: [WireStamp, number];
  r: [WireStamp, number];
};
type BufferWire = [name: string, pinned: 0 | 1, notify: 0 | 1 | 2];
type ReadWire = [name: string, timestamp: number];

const encoder = new TextEncoder();

function byteLength(value: string): number {
  return encoder.encode(value).byteLength;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeCounter(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function validName(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && byteLength(value) <= MAX_NAME_BYTES &&
    !/[\u0000-\u001f\u007f]/.test(value);
}

function normalizeStamp(value: unknown): PreferenceStamp | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const [clock, updatedAt, deviceId] = value;
  if (!isSafeCounter(clock) || !isSafeCounter(updatedAt) ||
      typeof deviceId !== 'string' || !DEVICE_ID_RE.test(deviceId)) return null;
  return { clock, updatedAt, deviceId };
}

function wireStamp(stamp: PreferenceStamp): WireStamp {
  return [stamp.clock, stamp.updatedAt, stamp.deviceId];
}

function generation(stamp: PreferenceStamp): string {
  return `${stamp.clock.toString(36)}-${stamp.deviceId.slice(0, 8)}`;
}

function notifyCode(mode: NotifyMode): 0 | 1 | 2 {
  if (mode === 'all') return 1;
  if (mode === 'mute') return 2;
  if (mode === 'mentions') return 0;
  throw new Error('invalid notification preference');
}

function decodeNotify(code: unknown): NotifyMode | null {
  if (code === 0) return 'mentions';
  if (code === 1) return 'all';
  if (code === 2) return 'mute';
  return null;
}

function stableRecord<T>(input: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)));
}

/** Return a canonical, bounded copy suitable for comparisons and persistence. */
export function normalizePreferenceValues(value: PreferenceValues): PreferenceValues {
  const buffers: Record<string, BufferPreference> = {};
  for (const [name, pref] of Object.entries(value.buffers).sort(([a], [b]) => a.localeCompare(b))) {
    if (!validName(name)) continue;
    if (!pref.pinned && pref.notify === 'mentions') continue;
    if (Object.keys(buffers).length >= MAX_COLLECTION_ENTRIES) {
      throw new Error('buffer preferences exceed metadata entry limit');
    }
    buffers[name] = { pinned: pref.pinned === true, notify: pref.notify };
  }
  const read: Record<string, number> = {};
  for (const [name, timestamp] of Object.entries(value.read).sort(([a], [b]) => a.localeCompare(b))) {
    if (!validName(name) || !isSafeCounter(timestamp)) continue;
    if (Object.keys(read).length >= MAX_COLLECTION_ENTRIES) {
      throw new Error('read preferences exceed metadata entry limit');
    }
    read[name] = timestamp;
  }
  return {
    appearance: { theme: value.appearance.theme },
    accessibility: { ...value.accessibility },
    notifications: { ...value.notifications },
    buffers,
    read,
  };
}

export function createPreferenceDocument(
  values: PreferenceValues,
  deviceId: string,
  updatedAt = 0,
  clock = 0,
): PreferenceDocument {
  if (!DEVICE_ID_RE.test(deviceId)) throw new Error('invalid preference-sync device id');
  const normalized = normalizePreferenceValues(values);
  const stamp = (): PreferenceStamp => ({ clock, updatedAt, deviceId });
  return {
    version: 1,
    appearance: { stamp: stamp(), value: normalized.appearance },
    accessibility: { stamp: stamp(), value: normalized.accessibility },
    notifications: { stamp: stamp(), value: normalized.notifications },
    buffers: { stamp: stamp(), value: normalized.buffers },
    read: { stamp: stamp(), value: normalized.read },
  };
}

function maxClock(document: PreferenceDocument): number {
  return Math.max(
    document.appearance.stamp.clock,
    document.accessibility.stamp.clock,
    document.notifications.stamp.clock,
    document.buffers.stamp.clock,
    document.read.stamp.clock,
  );
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Stamp only locally changed families. A single Lamport clock is advanced for
 * every changed family so a later edit always dominates everything observed.
 */
export function updatePreferenceDocument(
  current: PreferenceDocument,
  values: PreferenceValues,
  deviceId: string,
  updatedAt: number,
): { document: PreferenceDocument; changed: boolean } {
  if (!DEVICE_ID_RE.test(deviceId) || !isSafeCounter(updatedAt)) {
    throw new Error('invalid local preference update identity or timestamp');
  }
  const normalized = normalizePreferenceValues(values);
  let clock = maxClock(current);
  let changed = false;
  const next = structuredClone(current);
  for (const section of ['appearance', 'accessibility', 'notifications', 'buffers', 'read'] as const) {
    if (sameValue(current[section].value, normalized[section])) continue;
    clock += 1;
    changed = true;
    (next[section] as StampedPreferenceSection<unknown>) = {
      stamp: { clock, updatedAt, deviceId },
      value: normalized[section],
    };
  }
  return { document: next, changed };
}

function compareStamp(a: PreferenceStamp, b: PreferenceStamp): number {
  if (a.clock !== b.clock) return a.clock < b.clock ? -1 : 1;
  if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? -1 : 1;
  return a.deviceId.localeCompare(b.deviceId);
}

function pickSection<T>(a: StampedPreferenceSection<T>, b: StampedPreferenceSection<T>): StampedPreferenceSection<T> {
  const order = compareStamp(a.stamp, b.stamp);
  if (order !== 0) return structuredClone(order > 0 ? a : b);
  return structuredClone(JSON.stringify(a.value) >= JSON.stringify(b.value) ? a : b);
}

/** Deterministic, commutative merge. Read positions additionally never rewind. */
export function mergePreferenceDocuments(a: PreferenceDocument, b: PreferenceDocument): PreferenceDocument {
  const readWinner = pickSection(a.read, b.read);
  const read: Record<string, number> = { ...a.read.value };
  for (const [name, timestamp] of Object.entries(b.read.value)) {
    read[name] = Math.max(read[name] ?? 0, timestamp);
  }
  return {
    version: 1,
    appearance: pickSection(a.appearance, b.appearance),
    accessibility: pickSection(a.accessibility, b.accessibility),
    notifications: pickSection(a.notifications, b.notifications),
    buffers: pickSection(a.buffers, b.buffers),
    read: { stamp: readWinner.stamp, value: stableRecord(read) },
  };
}

function partKey(kind: 'b' | 'r', index: number): string {
  return `${PREFERENCE_METADATA_PREFIX}.${kind}.${index.toString(36)}`;
}

function partition<T>(kind: 'b' | 'r', generationId: string, items: T[]): PreferenceMetadataEntry[] {
  if (items.length === 0) return [];
  const parts: T[][] = [];
  let current: T[] = [];
  for (const item of items) {
    const candidate = [...current, item];
    if (byteLength(JSON.stringify({ g: generationId, d: candidate })) <= MAX_METADATA_VALUE_BYTES) {
      current = candidate;
      continue;
    }
    if (current.length === 0) throw new Error('preference entry exceeds Orochi metadata limit');
    parts.push(current);
    current = [item];
    if (byteLength(JSON.stringify({ g: generationId, d: current })) > MAX_METADATA_VALUE_BYTES) {
      throw new Error('preference entry exceeds Orochi metadata limit');
    }
  }
  if (current.length > 0) parts.push(current);
  if (parts.length > MAX_COLLECTION_PARTS) throw new Error('preference collection exceeds metadata part limit');
  return parts.map((data, index) => ({
    key: partKey(kind, index),
    value: JSON.stringify({ g: generationId, d: data }),
  }));
}

/** Encode one complete document; the manifest is intentionally emitted last. */
export function encodePreferenceMetadata(document: PreferenceDocument): PreferenceMetadataEntry[] {
  const bufferItems: BufferWire[] = Object.entries(document.buffers.value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, pref]) => [name, pref.pinned ? 1 : 0, notifyCode(pref.notify)]);
  const readItems: ReadWire[] = Object.entries(document.read.value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, timestamp]) => [name, timestamp]);
  const bufferParts = partition('b', generation(document.buffers.stamp), bufferItems);
  const readParts = partition('r', generation(document.read.stamp), readItems);
  const manifest: WireManifest = {
    v: 1,
    a: [wireStamp(document.appearance.stamp), document.appearance.value.theme],
    x: [
      wireStamp(document.accessibility.stamp),
      document.accessibility.value.fontFamily,
      document.accessibility.value.fontSize,
      document.accessibility.value.sceneMotion === 'reduced' ? 1 : 0,
      document.accessibility.value.readMarker ? 1 : 0,
    ],
    n: [
      wireStamp(document.notifications.stamp),
      document.notifications.value.enabled ? 1 : 0,
      document.notifications.value.sound ? 1 : 0,
      document.notifications.value.readOnFocus ? 1 : 0,
    ],
    b: [wireStamp(document.buffers.stamp), bufferParts.length],
    r: [wireStamp(document.read.stamp), readParts.length],
  };
  const manifestValue = JSON.stringify(manifest);
  if (byteLength(manifestValue) > MAX_METADATA_VALUE_BYTES) {
    throw new Error('preference manifest exceeds Orochi metadata limit');
  }
  return [...bufferParts, ...readParts, { key: PREFERENCE_MANIFEST_KEY, value: manifestValue }];
}

function parsePart<T>(
  entries: ReadonlyMap<string, string>,
  kind: 'b' | 'r',
  count: number,
  expectedGeneration: string,
): T[] | null {
  if (!Number.isInteger(count) || count < 0 || count > MAX_COLLECTION_PARTS) return null;
  const all: T[] = [];
  for (let index = 0; index < count; index += 1) {
    const raw = entries.get(partKey(kind, index));
    if (!raw || byteLength(raw) > MAX_METADATA_VALUE_BYTES) return null;
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return null; }
    if (!isPlainObject(parsed) || parsed.g !== expectedGeneration || !Array.isArray(parsed.d)) return null;
    all.push(...parsed.d as T[]);
    if (all.length > MAX_COLLECTION_ENTRIES) return null;
  }
  return all;
}

/** Decode a complete LIST snapshot. Unknown keys are ignored; malformed data fails closed. */
export function decodePreferenceMetadata(entries: ReadonlyMap<string, string>): PreferenceDocument | null {
  const rawManifest = entries.get(PREFERENCE_MANIFEST_KEY);
  if (!rawManifest || byteLength(rawManifest) > MAX_METADATA_VALUE_BYTES) return null;
  let raw: unknown;
  try { raw = JSON.parse(rawManifest); } catch { return null; }
  if (!isPlainObject(raw) || raw.v !== 1 || !Array.isArray(raw.a) || !Array.isArray(raw.x) ||
      !Array.isArray(raw.n) || !Array.isArray(raw.b) || !Array.isArray(raw.r)) return null;
  const a = raw.a as unknown[];
  const x = raw.x as unknown[];
  const n = raw.n as unknown[];
  const b = raw.b as unknown[];
  const r = raw.r as unknown[];
  const appearanceStamp = normalizeStamp(a[0]);
  const accessibilityStamp = normalizeStamp(x[0]);
  const notificationStamp = normalizeStamp(n[0]);
  const bufferStamp = normalizeStamp(b[0]);
  const readStamp = normalizeStamp(r[0]);
  if (!appearanceStamp || !accessibilityStamp || !notificationStamp || !bufferStamp || !readStamp ||
      a.length !== 2 || x.length !== 5 || n.length !== 4 || b.length !== 2 || r.length !== 2 ||
      typeof a[1] !== 'string' || !THEMES.has(a[1] as ThemeId) ||
      typeof x[1] !== 'string' || !FONT_FAMILIES.has(x[1]) ||
      typeof x[2] !== 'number' || !Number.isInteger(x[2]) || x[2] < 12 || x[2] > 20 ||
      (x[3] !== 0 && x[3] !== 1) || (x[4] !== 0 && x[4] !== 1) ||
      (n[1] !== 0 && n[1] !== 1) || (n[2] !== 0 && n[2] !== 1) || (n[3] !== 0 && n[3] !== 1) ||
      !Number.isInteger(b[1]) || !Number.isInteger(r[1])) return null;
  const bufferItems = parsePart<unknown>(entries, 'b', b[1] as number, generation(bufferStamp));
  const readItems = parsePart<unknown>(entries, 'r', r[1] as number, generation(readStamp));
  if (!bufferItems || !readItems) return null;
  const buffers: Record<string, BufferPreference> = {};
  for (const item of bufferItems) {
    if (!Array.isArray(item) || item.length !== 3 || !validName(item[0]) ||
        (item[1] !== 0 && item[1] !== 1)) return null;
    const notify = decodeNotify(item[2]);
    if (!notify || buffers[item[0]]) return null;
    buffers[item[0]] = { pinned: item[1] === 1, notify };
  }
  const read: Record<string, number> = {};
  for (const item of readItems) {
    if (!Array.isArray(item) || item.length !== 2 || !validName(item[0]) ||
        !isSafeCounter(item[1]) || read[item[0]] !== undefined) return null;
    read[item[0]] = item[1];
  }
  return {
    version: 1,
    appearance: { stamp: appearanceStamp, value: { theme: a[1] as ThemeId } },
    accessibility: {
      stamp: accessibilityStamp,
      value: {
        fontFamily: x[1] as AccessibilityPreferences['fontFamily'],
        fontSize: x[2] as number,
        sceneMotion: x[3] === 1 ? 'reduced' : 'auto',
        readMarker: x[4] === 1,
      },
    },
    notifications: {
      stamp: notificationStamp,
      value: { enabled: n[1] === 1, sound: n[2] === 1, readOnFocus: n[3] === 1 },
    },
    buffers: { stamp: bufferStamp, value: stableRecord(buffers) },
    read: { stamp: readStamp, value: stableRecord(read) },
  };
}

/** Strictly validate a local persisted document through the wire codec itself. */
export function parsePreferenceDocument(raw: string): PreferenceDocument | null {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!isPlainObject(parsed) || parsed.version !== 1) return null;
  try {
    const document = parsed as unknown as PreferenceDocument;
    const encoded = encodePreferenceMetadata(document);
    return decodePreferenceMetadata(new Map(encoded.map((entry) => [entry.key, entry.value])));
  } catch {
    return null;
  }
}

export function preferenceDocumentsEqual(a: PreferenceDocument, b: PreferenceDocument): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function isPreferenceMetadataKey(key: string): boolean {
  return key === PREFERENCE_MANIFEST_KEY || key.startsWith(`${PREFERENCE_METADATA_PREFIX}.b.`) ||
    key.startsWith(`${PREFERENCE_METADATA_PREFIX}.r.`);
}

/** Keys left behind when a collection shrinks; clear them to avoid consuming quota. */
export function stalePreferenceMetadataKeys(previous: number, next: number, kind: 'b' | 'r'): string[] {
  const start = Math.max(0, Math.min(MAX_COLLECTION_PARTS, next));
  const end = Math.max(start, Math.min(MAX_COLLECTION_PARTS, previous));
  return Array.from({ length: end - start }, (_, index) => partKey(kind, start + index));
}
