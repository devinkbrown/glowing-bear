export type UploadProgress = {
  loaded: number;
  total: number | null;
  percent: number | null;
};

export type UploadResult = {
  url: string;
  expiresAt?: string;
  metadataStripped?: boolean;
};

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_UPLOAD_RESPONSE_BYTES = 64 * 1024;
export const ALLOWED_UPLOAD_TYPES = [
  'image/jpeg', 'image/png', 'image/webp',
  'video/mp4', 'video/webm',
  'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav',
  'application/pdf', 'text/plain', 'application/zip',
] as const;

export type UploadPolicy = {
  maxBytes: number;
  allowedTypes: readonly string[];
};

export const DEFAULT_UPLOAD_POLICY: UploadPolicy = {
  maxBytes: MAX_UPLOAD_BYTES,
  allowedTypes: ALLOWED_UPLOAD_TYPES,
};

export type UploadOptions = {
  mediaUrl?: string;
  fieldName?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  onProgress?: (progress: UploadProgress) => void;
  policy?: UploadPolicy;
};

type UploadResponseShape = {
  url?: unknown;
  href?: unknown;
  path?: unknown;
  filename?: unknown;
  name?: unknown;
  expiresAt?: unknown;
  expires_at?: unknown;
  expires?: unknown;
  expiry?: unknown;
  ttl?: unknown;
  file?: {
    url?: unknown;
    path?: unknown;
    expiresAt?: unknown;
    expires_at?: unknown;
    expires?: unknown;
    expiry?: unknown;
    ttl?: unknown;
  };
};

export class UploadError extends Error {
  status: number | null;
  code: 'config' | 'policy' | 'cancelled' | 'network' | 'response';

  constructor(message: string, code: UploadError['code'], status: number | null = null) {
    super(message);
    this.name = 'UploadError';
    this.code = code;
    this.status = status;
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function baseOrigin(mediaUrl: string): string | null {
  try {
    return new URL(mediaUrl).origin;
  } catch {
    return null;
  }
}

/**
 * Media service base URL: the `VITE_MEDIA_URL` env override wins, otherwise
 * default to the same-origin '/upload' endpoint (nginx proxies it to the
 * upload service in production).
 */
export function defaultMediaUrl(): string {
  const env = (import.meta.env.VITE_MEDIA_URL as string | undefined)?.trim();
  return env || '/upload';
}

export function buildUploadEndpoint(mediaUrl: string | undefined): string {
  const base = mediaUrl?.trim();
  if (!base) {
    throw new UploadError('Media upload URL is not configured.', 'config');
  }

  const normalized = trimTrailingSlash(base);
  if (normalized.startsWith('//')) throw new UploadError('Media upload URL is not safe.', 'config');
  try {
    const absolute = new URL(normalized);
    if (absolute.protocol !== 'https:' && absolute.protocol !== 'http:') {
      throw new UploadError('Media upload URL is not safe.', 'config');
    }
    if (absolute.username || absolute.password) {
      throw new UploadError('Media upload URL cannot contain credentials.', 'config');
    }
  } catch (error) {
    if (error instanceof UploadError) throw error;
    if (/^[a-z][a-z\d+.-]*:/i.test(normalized)) throw new UploadError('Media upload URL is not safe.', 'config');
  }
  if (normalized.endsWith('/upload')) return normalized;
  return `${normalized}/upload`;
}

export function resolveUploadUrl(mediaUrl: string, returnedUrl: string): string {
  const raw = returnedUrl.trim();
  if (!raw) throw new UploadError('Upload response did not include a file URL.', 'response');

  try {
    const absolute = new URL(raw);
    if (absolute.protocol !== 'https:' && absolute.protocol !== 'http:') {
      throw new UploadError('Upload service returned an unsafe file URL.', 'response');
    }
    return absolute.toString();
  } catch (error) {
    if (error instanceof UploadError) throw error;
  }

  if (raw.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(raw)) {
    throw new UploadError('Upload service returned an unsafe file URL.', 'response');
  }

  const origin = baseOrigin(mediaUrl);
  if (!origin) return raw;
  if (raw.startsWith('/')) return new URL(raw, origin).toString();
  if (raw.startsWith('uploads/')) return new URL(`/${raw}`, origin).toString();
  return new URL(`/uploads/${raw.replace(/^\/+/, '')}`, origin).toString();
}

function responseUrlFromJson(json: UploadResponseShape): string | null {
  const candidates = [
    json.url,
    json.href,
    json.path,
    json.file?.url,
    json.file?.path,
    json.filename,
    json.name,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  return null;
}

function expiryFromJson(json: UploadResponseShape, now: number): string | undefined {
  const sources = [json.file, json];
  for (const source of sources) {
    if (!source) continue;
    const absolute = source.expiresAt ?? source.expires_at ?? source.expires ?? source.expiry;
    if (typeof absolute === 'string' && absolute.trim()) {
      const parsed = Date.parse(absolute);
      if (Number.isFinite(parsed) && parsed > now) return new Date(parsed).toISOString();
    }
    if (typeof absolute === 'number' && Number.isFinite(absolute)) {
      const millis = absolute < 10_000_000_000 ? absolute * 1000 : absolute;
      if (millis > now) return new Date(millis).toISOString();
    }
    if (typeof source.ttl === 'number' && Number.isFinite(source.ttl) && source.ttl > 0) {
      return new Date(now + Math.min(source.ttl, 31_536_000) * 1000).toISOString();
    }
  }
  return undefined;
}

export async function parseUploadResponse(
  mediaUrl: string,
  body: string,
  contentType: string | null,
  now = Date.now(),
): Promise<UploadResult> {
  if (body.length > MAX_UPLOAD_RESPONSE_BYTES) {
    throw new UploadError('Upload service response was too large.', 'response');
  }
  const isJson = contentType?.toLowerCase().includes('application/json') ?? false;

  if (isJson) {
    let parsed: UploadResponseShape;
    try {
      parsed = JSON.parse(body) as UploadResponseShape;
    } catch {
      throw new UploadError('Upload service returned invalid JSON.', 'response');
    }
    const url = responseUrlFromJson(parsed);
    if (!url) throw new UploadError('Upload response did not include a file URL.', 'response');
    const expiresAt = expiryFromJson(parsed, now);
    return { url: resolveUploadUrl(mediaUrl, url), ...(expiresAt ? { expiresAt } : {}) };
  }

  const text = body.trim();
  if (!text) throw new UploadError('Upload response did not include a file URL.', 'response');
  return { url: resolveUploadUrl(mediaUrl, text) };
}

const EXTENSION_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', m4a: 'audio/mp4',
  ogg: 'audio/ogg', wav: 'audio/wav', pdf: 'application/pdf', txt: 'text/plain',
  zip: 'application/zip',
};

export function effectiveUploadType(file: File): string {
  const type = file.type.trim().toLocaleLowerCase();
  if (type) return type;
  const extension = file.name.split('.').at(-1)?.toLocaleLowerCase() ?? '';
  return EXTENSION_TYPES[extension] ?? '';
}

export function validateUploadFile(file: File, policy: UploadPolicy = DEFAULT_UPLOAD_POLICY): void {
  if (file.size <= 0) throw new UploadError('Empty files cannot be uploaded.', 'policy');
  if (file.size > policy.maxBytes) {
    throw new UploadError(`File exceeds the ${(policy.maxBytes / 1024 / 1024).toFixed(0)} MiB upload limit.`, 'policy');
  }
  const type = effectiveUploadType(file);
  if (!type || !policy.allowedTypes.includes(type)) {
    throw new UploadError(`File type ${type || 'unknown'} is not allowed.`, 'policy');
  }
}

function sanitizeUploadName(name: string): string {
  const sanitized = name.replace(/[\\/\0-\x1f\x7f]+/g, '-').trim().slice(0, 120);
  return sanitized || 'upload';
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

function stripJpegMetadata(bytes: Uint8Array): { bytes: Uint8Array; stripped: boolean } {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return { bytes, stripped: false };
  const out = [bytes.slice(0, 2)];
  let offset = 2;
  let stripped = false;
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) { out.push(bytes.slice(offset)); break; }
    let markerOffset = offset + 1;
    while (bytes[markerOffset] === 0xff) markerOffset++;
    const marker = bytes[markerOffset];
    if (marker === undefined) break;
    if (marker === 0xda || marker === 0xd9) { out.push(bytes.slice(offset)); break; }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(bytes.slice(offset, markerOffset + 1));
      offset = markerOffset + 1;
      continue;
    }
    if (markerOffset + 2 >= bytes.length) return { bytes, stripped: false };
    const length = (bytes[markerOffset + 1]! << 8) | bytes[markerOffset + 2]!;
    const end = markerOffset + 1 + length;
    if (length < 2 || end > bytes.length) return { bytes, stripped: false };
    if (marker === 0xe1 || marker === 0xed || marker === 0xfe) stripped = true;
    else out.push(bytes.slice(offset, end));
    offset = end;
  }
  return { bytes: stripped ? concatBytes(out) : bytes, stripped };
}

function stripPngMetadata(bytes: Uint8Array): { bytes: Uint8Array; stripped: boolean } {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 20 || !signature.every((value, index) => bytes[index] === value)) return { bytes, stripped: false };
  const removed = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);
  const out = [bytes.slice(0, 8)];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let stripped = false;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) return { bytes, stripped: false };
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    if (removed.has(type)) stripped = true;
    else out.push(bytes.slice(offset, end));
    offset = end;
    if (type === 'IEND') break;
  }
  return { bytes: stripped ? concatBytes(out) : bytes, stripped };
}

function stripWebpMetadata(bytes: Uint8Array): { bytes: Uint8Array; stripped: boolean } {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes.length < 20 || ascii(0, 4) !== 'RIFF' || ascii(8, 12) !== 'WEBP') return { bytes, stripped: false };
  const chunks: Uint8Array[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let stripped = false;
  while (offset + 8 <= bytes.length) {
    const type = ascii(offset, offset + 4);
    const size = view.getUint32(offset + 4, true);
    const end = offset + 8 + size + (size % 2);
    if (end > bytes.length) return { bytes, stripped: false };
    if (type === 'EXIF' || type === 'XMP ') stripped = true;
    else {
      const chunk = bytes.slice(offset, end);
      if (type === 'VP8X' && chunk.length > 8) chunk[8] = chunk[8]! & ~0x0c;
      chunks.push(chunk);
    }
    offset = end;
  }
  if (!stripped) return { bytes, stripped: false };
  const body = concatBytes(chunks);
  const out = new Uint8Array(12 + body.length);
  out.set(bytes.slice(0, 12));
  new DataView(out.buffer).setUint32(4, out.length - 8, true);
  out.set(body, 12);
  return { bytes: out, stripped: true };
}

export async function prepareUploadFile(file: File, policy: UploadPolicy = DEFAULT_UPLOAD_POLICY): Promise<{ file: File; metadataStripped: boolean }> {
  validateUploadFile(file, policy);
  const type = effectiveUploadType(file);
  const source = new Uint8Array(await file.arrayBuffer());
  const signatureMatches = type === 'image/jpeg'
    ? source[0] === 0xff && source[1] === 0xd8
    : type === 'image/png'
      ? source.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => source[index] === value)
      : type === 'image/webp'
        ? source.length >= 12 && String.fromCharCode(...source.slice(0, 4)) === 'RIFF' && String.fromCharCode(...source.slice(8, 12)) === 'WEBP'
        : true;
  if (!signatureMatches) throw new UploadError('Image contents do not match the selected file type.', 'policy');
  const result = type === 'image/jpeg'
    ? stripJpegMetadata(source)
    : type === 'image/png'
      ? stripPngMetadata(source)
      : type === 'image/webp'
        ? stripWebpMetadata(source)
        : { bytes: source, stripped: false };
  const sanitizedBytes = new Uint8Array(result.bytes.length);
  sanitizedBytes.set(result.bytes);
  return {
    file: new File([sanitizedBytes.buffer], sanitizeUploadName(file.name), { type, lastModified: file.lastModified }),
    metadataStripped: result.stripped,
  };
}

function progressFromEvent(event: ProgressEvent): UploadProgress {
  const total = event.lengthComputable ? event.total : null;
  return {
    loaded: event.loaded,
    total,
    percent: total && total > 0 ? Math.round((event.loaded / total) * 100) : null,
  };
}

async function readBoundedResponseBody(response: Response): Promise<string> {
  const tooLarge = () => new UploadError(
    'Upload service response was too large.',
    'response',
    response.status,
  );
  if (!response.body) {
    const body = await response.text();
    if (new TextEncoder().encode(body).byteLength > MAX_UPLOAD_RESPONSE_BYTES) throw tooLarge();
    return body;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let body = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      received += chunk.value.byteLength;
      if (received > MAX_UPLOAD_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw tooLarge();
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
    return body;
  } finally {
    reader.releaseLock();
  }
}

function uploadWithXhr(file: File, endpoint: string, mediaUrl: string, options: UploadOptions, metadataStripped: boolean): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append(options.fieldName ?? 'file', file);

    xhr.open('POST', endpoint);
    xhr.upload.onprogress = (event) => {
      options.onProgress?.(progressFromEvent(event));
    };
    let responseTooLarge = false;
    xhr.onerror = () => reject(new UploadError('Upload failed before the server responded.', 'network'));
    xhr.onabort = () => reject(responseTooLarge
      ? new UploadError('Upload service response was too large.', 'response', xhr.status || null)
      : new UploadError('Upload was cancelled.', 'cancelled'));
    xhr.onprogress = () => {
      if (new TextEncoder().encode(xhr.responseText).byteLength <= MAX_UPLOAD_RESPONSE_BYTES) return;
      responseTooLarge = true;
      xhr.abort();
    };
    xhr.onload = () => {
      if (xhr.responseText.length > MAX_UPLOAD_RESPONSE_BYTES) {
        reject(new UploadError('Upload service response was too large.', 'response', xhr.status || null));
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        const message = xhr.responseText.trim().slice(0, 240) || `Upload failed with HTTP ${xhr.status}.`;
        reject(new UploadError(message, 'response', xhr.status));
        return;
      }
      void parseUploadResponse(mediaUrl, xhr.responseText, xhr.getResponseHeader('content-type'))
        .then((result) => resolve({ ...result, ...(metadataStripped ? { metadataStripped: true } : {}) }), reject);
    };

    if (options.signal) {
      if (options.signal.aborted) {
        xhr.abort();
        return;
      }
      options.signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }

    xhr.send(form);
  });
}

export async function uploadFile(file: File, options: UploadOptions = {}): Promise<UploadResult> {
  const mediaUrl = options.mediaUrl?.trim() || defaultMediaUrl();
  const endpoint = buildUploadEndpoint(mediaUrl);
  const prepared = await prepareUploadFile(file, options.policy ?? DEFAULT_UPLOAD_POLICY);

  if (options.onProgress && typeof XMLHttpRequest !== 'undefined') {
    return uploadWithXhr(prepared.file, endpoint, mediaUrl, options, prepared.metadataStripped);
  }

  const form = new FormData();
  form.append(options.fieldName ?? 'file', prepared.file);
  const fetcher = options.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetcher(endpoint, {
      method: 'POST',
      body: form,
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof UploadError) throw error;
    if (options.signal?.aborted) throw new UploadError('Upload was cancelled.', 'cancelled');
    throw new UploadError('Upload failed before the server responded.', 'network');
  }

  const contentLength = Number.parseInt(response.headers.get('content-length') ?? '0', 10);
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new UploadError('Upload service response was too large.', 'response', response.status);
  }
  const body = await readBoundedResponseBody(response);
  if (!response.ok) {
    const message = body.trim() || `Upload failed with HTTP ${response.status}.`;
    throw new UploadError(message, 'response', response.status);
  }

  return {
    ...await parseUploadResponse(mediaUrl, body, response.headers.get('content-type')),
    ...(prepared.metadataStripped ? { metadataStripped: true } : {}),
  };
}
