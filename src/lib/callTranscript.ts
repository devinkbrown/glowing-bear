import type { CadenceTranscriptEntry } from '@/lib/cadence-media/types';

function safeFilenamePart(value: string): string {
  const cleaned = value.normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '');
  return cleaned.slice(0, 64) || 'call';
}

export function formatCallTranscript(
  entries: readonly CadenceTranscriptEntry[],
  locale?: string,
): string {
  return entries.map((entry) => {
    const time = new Date(entry.time).toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    return `[${time}] ${entry.nick}: ${entry.text.replace(/[\r\n]+/g, ' ')}`;
  }).join('\n');
}

export function transcriptFilename(scope: string, now = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return `darkbear-${safeFilenamePart(scope)}-${stamp}.txt`;
}

/** User-initiated, current-call export. No background file or cloud write occurs. */
export function downloadCallTranscript(
  entries: readonly CadenceTranscriptEntry[],
  scope: string,
): boolean {
  if (entries.length === 0 || typeof document === 'undefined' || typeof URL === 'undefined') return false;
  const url = URL.createObjectURL(new Blob([`${formatCallTranscript(entries)}\n`], {
    type: 'text/plain;charset=utf-8',
  }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = transcriptFilename(scope);
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}
