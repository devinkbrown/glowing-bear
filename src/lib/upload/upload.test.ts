// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  UploadError,
  buildUploadEndpoint,
  prepareUploadFile,
  parseUploadResponse,
  resolveUploadUrl,
  uploadFile,
  validateUploadFile,
} from './upload';

describe('buildUploadEndpoint', () => {
  it('normalizes configured media URLs to a single /upload endpoint', () => {
    expect(buildUploadEndpoint(' https://media.example.test/api/ ')).toBe('https://media.example.test/api/upload');
    expect(buildUploadEndpoint('https://media.example.test/api/upload///')).toBe(
      'https://media.example.test/api/upload',
    );
  });

  it('fails closed when the media URL is missing or blank', () => {
    expect(() => buildUploadEndpoint(undefined)).toThrow(UploadError);
    expect(() => buildUploadEndpoint('   ')).toThrow(UploadError);
    expect(() => buildUploadEndpoint('javascript:alert(1)')).toThrow('not safe');
    expect(() => buildUploadEndpoint('//evil.example/upload')).toThrow('not safe');
    expect(() => buildUploadEndpoint('https://user:secret@media.example/upload')).toThrow('cannot contain credentials');
  });
});

describe('resolveUploadUrl', () => {
  it('resolves rooted and upload-relative response paths against the media origin', () => {
    // Arrange
    const mediaUrl = 'https://media.example.test/media/upload';

    // Act
    const rooted = resolveUploadUrl(mediaUrl, '/files/cat.png');
    const uploadRelative = resolveUploadUrl(mediaUrl, 'uploads/dog.png');
    const bareName = resolveUploadUrl(mediaUrl, 'bird.png');

    // Assert
    expect(rooted).toBe('https://media.example.test/files/cat.png');
    expect(uploadRelative).toBe('https://media.example.test/uploads/dog.png');
    expect(bareName).toBe('https://media.example.test/uploads/bird.png');
  });

  it('keeps relative response paths raw when the media URL has no origin', () => {
    // Arrange
    const mediaUrl = '/upload';

    // Act
    const url = resolveUploadUrl(mediaUrl, 'bird.png');

    // Assert
    expect(url).toBe('bird.png');
  });

  it('trusts an arbitrary absolute response URL exactly as returned', () => {
    // Arrange
    const mediaUrl = 'https://media.example.test/upload';

    // Act
    // Known LOW security finding: resolveUploadUrl currently trusts arbitrary
    // absolute URLs returned by the upload service. This test preserves that behavior.
    const url = resolveUploadUrl(mediaUrl, 'https://cdn.evil.example/file.png');

    // Assert
    expect(url).toBe('https://cdn.evil.example/file.png');
  });

  it('rejects executable, data, and protocol-relative response URLs', () => {
    expect(() => resolveUploadUrl('/upload', 'javascript:alert(1)')).toThrow('unsafe file URL');
    expect(() => resolveUploadUrl('/upload', 'data:text/html,hello')).toThrow('unsafe file URL');
    expect(() => resolveUploadUrl('/upload', '//evil.example/file')).toThrow('unsafe file URL');
  });
});

describe('parseUploadResponse', () => {
  it('parses JSON responses by content type and resolves nested file paths', async () => {
    // Arrange
    const mediaUrl = 'https://media.example.test/upload';
    const body = JSON.stringify({ file: { path: 'uploads/note.txt' } });

    // Act
    const result = await parseUploadResponse(mediaUrl, body, 'application/json; charset=utf-8');

    // Assert
    expect(result).toEqual({ url: 'https://media.example.test/uploads/note.txt' });
  });

  it('uses the first non-empty JSON URL candidate and ignores malformed fallback fields', async () => {
    // Arrange
    const mediaUrl = 'https://media.example.test/upload';
    const body = JSON.stringify({
      url: ' ',
      href: 123,
      path: null,
      file: { url: ' uploads/photo.png ' },
      filename: 'ignored.txt',
    });

    // Act
    const result = await parseUploadResponse(mediaUrl, body, 'Application/JSON');

    // Assert
    expect(result).toEqual({ url: 'https://media.example.test/uploads/photo.png' });
  });

  it('treats non-JSON responses as a text URL', async () => {
    // Arrange
    const mediaUrl = 'https://media.example.test/upload';

    // Act
    const result = await parseUploadResponse(mediaUrl, '  /files/note.txt  ', 'text/plain');

    // Assert
    expect(result).toEqual({ url: 'https://media.example.test/files/note.txt' });
  });

  it('reports invalid or missing response URLs as response errors', async () => {
    // Arrange
    const mediaUrl = 'https://media.example.test/upload';

    // Act / Assert
    await expect(parseUploadResponse(mediaUrl, '{', 'application/json')).rejects.toMatchObject({
      code: 'response',
      message: 'Upload service returned invalid JSON.',
    });
    await expect(parseUploadResponse(mediaUrl, '{}', 'application/json')).rejects.toMatchObject({
      code: 'response',
      message: 'Upload response did not include a file URL.',
    });
    expect(() => resolveUploadUrl(mediaUrl, '   ')).toThrow(UploadError);
    await expect(parseUploadResponse(mediaUrl, 'x'.repeat(65_537), 'text/plain')).rejects.toThrow('too large');
  });

  it('normalizes absolute and TTL service expiry metadata', async () => {
    const now = Date.parse('2026-07-16T12:00:00Z');
    await expect(parseUploadResponse(
      'https://media.example.test/upload',
      JSON.stringify({ path: 'note.txt', expires_at: '2026-07-17T12:00:00Z' }),
      'application/json',
      now,
    )).resolves.toEqual({
      url: 'https://media.example.test/uploads/note.txt',
      expiresAt: '2026-07-17T12:00:00.000Z',
    });
    await expect(parseUploadResponse(
      'https://media.example.test/upload',
      JSON.stringify({ file: { path: 'note.txt', ttl: 3600 } }),
      'application/json',
      now,
    )).resolves.toEqual({
      url: 'https://media.example.test/uploads/note.txt',
      expiresAt: '2026-07-16T13:00:00.000Z',
    });
  });
});

describe('upload policy and image sanitation', () => {
  it('enforces non-empty bounded allowlisted files', () => {
    expect(() => validateUploadFile(new File([], 'empty.txt', { type: 'text/plain' }))).toThrow('Empty files');
    expect(() => validateUploadFile(new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }))).toThrow('not allowed');
    expect(() => validateUploadFile(
      new File(['12345'], 'large.txt', { type: 'text/plain' }),
      { maxBytes: 4, allowedTypes: ['text/plain'] },
    )).toThrow('upload limit');
  });

  it('removes JPEG metadata segments before FormData upload', async () => {
    const jpeg = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xe1, 0x00, 0x06, 0x45, 0x78, 0x69, 0x66,
      0xff, 0xdb, 0x00, 0x04, 0x01, 0x02,
      0xff, 0xda, 0x00, 0x02, 0x03, 0x04,
    ]);
    const prepared = await prepareUploadFile(new File([jpeg], '../photo.jpg', { type: 'image/jpeg' }));
    const bytes = new Uint8Array(await prepared.file.arrayBuffer());
    expect(prepared.metadataStripped).toBe(true);
    expect(prepared.file.name).not.toContain('/');
    expect([...bytes]).not.toEqual(expect.arrayContaining([0x45, 0x78, 0x69, 0x66]));
    expect([...bytes.slice(0, 2)]).toEqual([0xff, 0xd8]);
  });

  it('removes PNG textual metadata chunks while retaining image chunks', async () => {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    const chunk = (type: string, data: number[]) => [
      0, 0, 0, data.length,
      ...type.split('').map((char) => char.charCodeAt(0)),
      ...data,
      0, 0, 0, 0,
    ];
    const png = new Uint8Array([
      ...signature,
      ...chunk('tEXt', [1]),
      ...chunk('IDAT', [2]),
      ...chunk('IEND', []),
    ]);
    const prepared = await prepareUploadFile(new File([png], 'photo.png', { type: 'image/png' }));
    const text = String.fromCharCode(...new Uint8Array(await prepared.file.arrayBuffer()));
    expect(prepared.metadataStripped).toBe(true);
    expect(text).not.toContain('tEXt');
    expect(text).toContain('IDAT');
    expect(text).toContain('IEND');
  });

  it('removes WebP EXIF/XMP chunks and clears their VP8X feature bits', async () => {
    const four = (value: string) => value.split('').map((char) => char.charCodeAt(0));
    const le32 = (value: number) => [value, 0, 0, 0];
    const chunk = (type: string, data: number[]) => [...four(type), ...le32(data.length), ...data, ...(data.length % 2 ? [0] : [])];
    const body = [
      ...chunk('VP8X', [0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      ...chunk('EXIF', [1, 2, 3, 4]),
      ...chunk('VP8 ', [5, 6]),
    ];
    const webp = new Uint8Array([...four('RIFF'), ...le32(body.length + 4), ...four('WEBP'), ...body]);
    const prepared = await prepareUploadFile(new File([webp], 'photo.webp', { type: 'image/webp' }));
    const bytes = new Uint8Array(await prepared.file.arrayBuffer());
    const text = String.fromCharCode(...bytes);
    expect(prepared.metadataStripped).toBe(true);
    expect(text).not.toContain('EXIF');
    expect(bytes[20]! & 0x0c).toBe(0);
  });

  it('rejects spoofed image MIME types before upload', async () => {
    await expect(prepareUploadFile(new File(['not an image'], 'fake.jpg', { type: 'image/jpeg' })))
      .rejects.toMatchObject({ code: 'policy' });
  });
});

describe('uploadFile', () => {
  it('posts a FormData upload request with the configured field, size, type, and signal', async () => {
    // Arrange
    const file = new File(['hello'], 'note.txt', { type: 'text/plain' });
    const signal = new AbortController().signal;
    const fetchCalls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      fetchCalls.push([input, init]);
      return new Response(JSON.stringify({ path: 'uploads/note.txt' }), {
        headers: { 'content-type': 'application/json' },
      });
    };

    // Act
    const result = await uploadFile(file, {
      mediaUrl: 'https://media.example.test/api',
      fieldName: 'payload',
      fetchImpl,
      signal,
    });

    // Assert
    expect(result).toEqual({ url: 'https://media.example.test/uploads/note.txt' });
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]![0]).toBe('https://media.example.test/api/upload');
    expect(fetchCalls[0]![1]?.method).toBe('POST');
    expect(fetchCalls[0]![1]?.signal).toBe(signal);
    expect(fetchCalls[0]![1]?.body).toBeInstanceOf(FormData);

    const form = fetchCalls[0]![1]!.body as FormData;
    const entry = form.get('payload');
    expect(entry).toBeInstanceOf(File);
    const uploaded = entry as File;
    expect(uploaded.name).toBe('note.txt');
    expect(uploaded.size).toBe(5);
    expect(uploaded.type).toBe('text/plain');
  });

  it('uses a media URL that already ends with /upload without appending another segment', async () => {
    // Arrange
    const file = new File(['hello'], 'note.txt', { type: 'text/plain' });
    const fetchCalls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      fetchCalls.push([input, init]);
      return new Response('/files/note.txt', { headers: { 'content-type': 'text/plain' } });
    };

    // Act
    const result = await uploadFile(file, {
      mediaUrl: 'https://media.example.test/api/upload/',
      fetchImpl,
    });

    // Assert
    expect(result).toEqual({ url: 'https://media.example.test/files/note.txt' });
    expect(fetchCalls[0]![0]).toBe('https://media.example.test/api/upload');
  });

  it('wraps fetch failures and non-OK responses as UploadError values', async () => {
    // Arrange
    const file = new File(['hello'], 'note.txt', { type: 'text/plain' });
    const networkFetch: typeof fetch = async () => {
      throw new TypeError('socket closed');
    };
    const responseFetch: typeof fetch = async () => new Response('too large', { status: 413 });

    // Act / Assert
    await expect(uploadFile(file, { mediaUrl: 'https://media.example.test/upload', fetchImpl: networkFetch }))
      .rejects.toMatchObject({ code: 'network', message: 'Upload failed before the server responded.' });
    await expect(uploadFile(file, { mediaUrl: 'https://media.example.test/upload', fetchImpl: responseFetch }))
      .rejects.toMatchObject({ code: 'response', status: 413, message: 'too large' });
  });

  it('cancels a chunked upload response as soon as it exceeds the response budget', async () => {
    const file = new File(['hello'], 'note.txt', { type: 'text/plain' });
    let pulls = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(40 * 1024).fill(0x61));
      },
      cancel() {
        cancelled = true;
      },
    }, { highWaterMark: 0 });
    const fetchImpl: typeof fetch = async () => new Response(body, {
      headers: { 'content-type': 'text/plain' },
    });

    await expect(uploadFile(file, {
      mediaUrl: 'https://media.example.test/upload',
      fetchImpl,
    })).rejects.toMatchObject({
      code: 'response',
      message: 'Upload service response was too large.',
      status: 200,
    });
    expect(cancelled).toBe(true);
    expect(pulls).toBe(2);
  });
});
