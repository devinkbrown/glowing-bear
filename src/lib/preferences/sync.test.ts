import { describe, expect, it } from 'vitest';
import type { PreferenceDocument, PreferenceValues } from './sync';
import {
  MAX_METADATA_VALUE_BYTES,
  PREFERENCE_MANIFEST_KEY,
  createPreferenceDocument,
  decodePreferenceMetadata,
  encodePreferenceMetadata,
  isPreferenceMetadataKey,
  mergePreferenceDocuments,
  parsePreferenceDocument,
  preferenceDocumentsEqual,
  stalePreferenceMetadataKeys,
  updatePreferenceDocument,
} from './sync';

const DEVICE_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const DEVICE_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function values(overrides: Partial<PreferenceValues> = {}): PreferenceValues {
  return {
    appearance: { theme: 'retro' },
    accessibility: {
      fontFamily: 'system',
      fontSize: 14,
      sceneMotion: 'auto',
      readMarker: true,
    },
    notifications: { enabled: true, sound: false, readOnFocus: true },
    buffers: {},
    read: {},
    ...overrides,
  };
}

function entries(document: PreferenceDocument): Map<string, string> {
  return new Map(encodePreferenceMetadata(document).map((entry) => [entry.key, entry.value]));
}

describe('preference sync document', () => {
  it('starts from a neutral seed and stamps only changed families', () => {
    const initial = createPreferenceDocument(values(), DEVICE_A);
    expect(initial.appearance.stamp).toEqual({ clock: 0, updatedAt: 0, deviceId: DEVICE_A });

    const next = updatePreferenceDocument(initial, values({
      appearance: { theme: 'nord' },
      notifications: { enabled: false, sound: false, readOnFocus: true },
    }), DEVICE_A, 1000);

    expect(next.changed).toBe(true);
    expect(next.document.appearance.stamp.clock).toBe(1);
    expect(next.document.notifications.stamp.clock).toBe(2);
    expect(next.document.accessibility.stamp.clock).toBe(0);
    expect(next.document.appearance.value.theme).toBe('nord');
  });

  it('does not restamp an identical local snapshot', () => {
    const initial = createPreferenceDocument(values(), DEVICE_A);
    const next = updatePreferenceDocument(initial, values(), DEVICE_A, 1000);
    expect(next.changed).toBe(false);
    expect(preferenceDocumentsEqual(next.document, initial)).toBe(true);
  });

  it('merges families independently with a deterministic total order', () => {
    const seedA = createPreferenceDocument(values(), DEVICE_A);
    const seedB = createPreferenceDocument(values(), DEVICE_B);
    const a = updatePreferenceDocument(seedA, values({ appearance: { theme: 'nord' } }), DEVICE_A, 1000).document;
    const b = updatePreferenceDocument(seedB, values({
      notifications: { enabled: false, sound: true, readOnFocus: false },
    }), DEVICE_B, 1000).document;

    const ab = mergePreferenceDocuments(a, b);
    const ba = mergePreferenceDocuments(b, a);
    expect(ab).toEqual(ba);
    expect(ab.appearance.value.theme).toBe('nord');
    expect(ab.notifications.value).toEqual({ enabled: false, sound: true, readOnFocus: false });
  });

  it('uses device id as the final tie-break and never rewinds read positions', () => {
    const a = updatePreferenceDocument(
      createPreferenceDocument(values(), DEVICE_A),
      values({ appearance: { theme: 'nord' }, read: { '#one': 2000, '#two': 3000 } }),
      DEVICE_A,
      1000,
    ).document;
    const b = updatePreferenceDocument(
      createPreferenceDocument(values(), DEVICE_B),
      values({ appearance: { theme: 'gruvbox' }, read: { '#one': 1000, '#three': 4000 } }),
      DEVICE_B,
      1000,
    ).document;

    const merged = mergePreferenceDocuments(a, b);
    expect(merged.appearance.value.theme).toBe('gruvbox');
    expect(merged.read.value).toEqual({ '#one': 2000, '#three': 4000, '#two': 3000 });
  });
});

describe('Onyx Server metadata codec', () => {
  it('round-trips chunked collections and emits the manifest last', () => {
    const buffers = Object.fromEntries(Array.from({ length: 72 }, (_, index) => [
      `irc.example.channel-${index.toString().padStart(3, '0')}`,
      { pinned: index % 2 === 0, notify: index % 3 === 0 ? 'mute' as const : 'all' as const },
    ]));
    const read = Object.fromEntries(Array.from({ length: 72 }, (_, index) => [
      `irc.example.channel-${index.toString().padStart(3, '0')}`,
      1_700_000_000_000 + index,
    ]));
    const document = createPreferenceDocument(values({ buffers, read }), DEVICE_A, 1000, 1);
    const encoded = encodePreferenceMetadata(document);

    expect(encoded.at(-1)?.key).toBe(PREFERENCE_MANIFEST_KEY);
    expect(encoded.every((entry) => new TextEncoder().encode(entry.value).byteLength <= MAX_METADATA_VALUE_BYTES)).toBe(true);
    expect(decodePreferenceMetadata(new Map(encoded.map((entry) => [entry.key, entry.value])))).toEqual(document);
  });

  it('fails closed on incomplete or mixed-generation parts', () => {
    const document = createPreferenceDocument(values({
      buffers: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [
        `irc.example.channel-${i}`, { pinned: true, notify: 'mentions' as const },
      ])),
    }), DEVICE_A, 1000, 1);
    const snapshot = entries(document);
    const partKey = [...snapshot.keys()].find((key) => key.includes('.b.'))!;
    snapshot.delete(partKey);
    expect(decodePreferenceMetadata(snapshot)).toBeNull();

    const mixed = entries(document);
    const raw = JSON.parse(mixed.get(partKey)!) as { g: string; d: unknown[] };
    raw.g = 'stale-generation';
    mixed.set(partKey, JSON.stringify(raw));
    expect(decodePreferenceMetadata(mixed)).toBeNull();
  });

  it('rejects malformed manifests, stamps, values, and persisted documents', () => {
    const snapshot = entries(createPreferenceDocument(values(), DEVICE_A));
    snapshot.set(PREFERENCE_MANIFEST_KEY, '{bad json');
    expect(decodePreferenceMetadata(snapshot)).toBeNull();
    expect(parsePreferenceDocument('{}')).toBeNull();
    expect(parsePreferenceDocument('not json')).toBeNull();

    const invalid = createPreferenceDocument(values(), DEVICE_A) as PreferenceDocument;
    invalid.accessibility.value.fontSize = 999;
    expect(parsePreferenceDocument(JSON.stringify(invalid))).toBeNull();
  });

  it('allowlists fields so credentials, endpoints, CSS, history, and media choices cannot enter the wire payload', () => {
    const untrusted = values() as PreferenceValues & Record<string, unknown>;
    untrusted.password = 'secret-password';
    untrusted.wsUrl = 'wss://private.example';
    untrusted.customCSS = 'body{display:none}';
    untrusted.localHistory = ['private message'];
    untrusted.microphoneId = 'device-123';
    const wire = encodePreferenceMetadata(createPreferenceDocument(untrusted, DEVICE_A))
      .map((entry) => entry.value).join('');

    expect(wire).not.toContain('secret-password');
    expect(wire).not.toContain('private.example');
    expect(wire).not.toContain('display:none');
    expect(wire).not.toContain('private message');
    expect(wire).not.toContain('device-123');
  });

  it('bounds collection growth and identifies only owned metadata keys', () => {
    const huge = Object.fromEntries(Array.from({ length: 128 }, (_, index) => [
      `${'x'.repeat(170)}-${index}`, { pinned: true, notify: 'mute' as const },
    ]));
    expect(() => encodePreferenceMetadata(createPreferenceDocument(values({ buffers: huge }), DEVICE_A)))
      .toThrow(/entry limit|part limit/);

    expect(isPreferenceMetadataKey(PREFERENCE_MANIFEST_KEY)).toBe(true);
    expect(isPreferenceMetadataKey('darkbear.pref.v1.b.0')).toBe(true);
    expect(isPreferenceMetadataKey('unrelated.key')).toBe(false);
    expect(stalePreferenceMetadataKeys(4, 2, 'b')).toEqual([
      'darkbear.pref.v1.b.2', 'darkbear.pref.v1.b.3',
    ]);
  });
});
