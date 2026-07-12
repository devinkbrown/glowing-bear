// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  UploadError,
  parseUploadResponse,
  resolveUploadUrl,
  uploadFile,
} from './upload';

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
});
