import { describe, expect, it } from 'vitest';
import { formatCallTranscript, transcriptFilename } from './callTranscript';

describe('call transcript export', () => {
  it('formats speaker-labelled one-line entries in chronological input order', () => {
    const output = formatCallTranscript([
      { channel: '#room', nick: 'Alice', text: 'first\nline', time: Date.UTC(2026, 0, 1, 12, 0, 1) },
      { channel: '#room', nick: 'Bob', text: 'second', time: Date.UTC(2026, 0, 1, 12, 0, 2) },
    ], 'en-GB');
    expect(output).toMatch(/^\[\d{2}:00:01\] Alice: first line\n\[\d{2}:00:02\] Bob: second$/);
  });

  it('creates a portable filename without path/control characters', () => {
    expect(transcriptFilename('#room / ../ unsafe', new Date('2026-01-02T03:04:05.006Z')))
      .toBe('darkbear-room-..-unsafe-2026-01-02T03-04-05-006Z.txt');
  });
});
