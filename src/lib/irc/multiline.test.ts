import { describe, it, expect } from 'vitest';

import {
  DEFAULT_MULTILINE_LIMITS,
  parseMultilineLimits,
  planMultilineBatches,
  buildMultilineLines,
  assembleMultilineText,
  nextBatchRef,
  type MultilineBatch,
} from './multiline';

const encoder = new TextEncoder();
const utf8Bytes = (text: string): number => encoder.encode(text).length;

describe('parseMultilineLimits', () => {
  it('parses the cap value Onyx Server advertises in the live capture', () => {
    // draft/multiline=max-bytes=4096,max-lines=24
    expect(parseMultilineLimits('max-bytes=4096,max-lines=24')).toEqual({
      maxBytes: 4096,
      maxLines: 24,
    });
  });

  it('falls back to defaults when the cap has no value', () => {
    expect(parseMultilineLimits(undefined)).toEqual(DEFAULT_MULTILINE_LIMITS);
    expect(parseMultilineLimits('')).toEqual(DEFAULT_MULTILINE_LIMITS);
  });

  it('keeps defaults for absent tokens', () => {
    expect(parseMultilineLimits('max-lines=8')).toEqual({
      maxBytes: DEFAULT_MULTILINE_LIMITS.maxBytes,
      maxLines: 8,
    });
  });

  it('ignores malformed, non-positive, and unknown tokens', () => {
    expect(parseMultilineLimits('max-bytes=abc,max-lines=-3,foo=9,bare')).toEqual(
      DEFAULT_MULTILINE_LIMITS,
    );
  });
});

describe('planMultilineBatches', () => {
  it('returns null for single-line text (caller sends normally)', () => {
    expect(planMultilineBatches('just one line')).toBeNull();
  });

  it('returns null when only one non-blank line remains after filtering', () => {
    expect(planMultilineBatches('hello\n\n   \n')).toBeNull();
  });

  it('groups a small message into one batch of plain (non-concat) parts', () => {
    const batches = planMultilineBatches('line one\nline two');

    expect(batches).toEqual([
      [
        { text: 'line one', concat: false },
        { text: 'line two', concat: false },
      ],
    ]);
  });

  it('splits into sequential batches when max-lines is exceeded', () => {
    const batches = planMultilineBatches('a\nb\nc\nd\ne', { maxBytes: 4096, maxLines: 2 });

    expect(batches).toHaveLength(3);
    expect(batches!.map((b) => b.map((p) => p.text))).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
  });

  it('splits into sequential batches when the byte budget is exceeded', () => {
    const batches = planMultilineBatches('aaaaa\nbbbbb\ncc', { maxBytes: 10, maxLines: 24 });

    expect(batches!.map((b) => b.map((p) => p.text))).toEqual([['aaaaa', 'bbbbb'], ['cc']]);
  });

  it('keeps every batch at or below max-bytes after splitting overlong lines', () => {
    // Arrange
    const limits = { maxBytes: 6, maxLines: 24 };

    // Act
    const batches = planMultilineBatches('abcdefghi\njklmn\nop', limits)!;

    // Assert
    for (const batch of batches) {
      const batchBytes = batch.reduce((sum, part) => sum + utf8Bytes(part.text), 0);
      expect(batchBytes).toBeLessThanOrEqual(limits.maxBytes);
    }
    expect(batches.map((batch) => batch.map((part) => part.text))).toEqual([
      ['abcdef'],
      ['ghi'],
      ['jklmn'],
      ['op'],
    ]);
  });

  it('explodes an overlong line into byte-limited fragments', () => {
    const batches = planMultilineBatches('abcdefgh\nz', { maxBytes: 5, maxLines: 24 });

    const texts = batches!.flat().map((p) => p.text);
    expect(texts).toEqual(['abcde', 'fgh', 'z']);
  });

  it('degrades a concat fragment that opens a new batch to a standalone line', () => {
    // 'abcde' fills the first batch, so the continuation fragment 'fgh' must
    // start batch 2 — where its concat flag is dropped by design (the split
    // point behaves like a newline across batches).
    const batches = planMultilineBatches('abcdefgh\nz', { maxBytes: 5, maxLines: 24 });

    expect(batches![1]![0]).toEqual({ text: 'fgh', concat: false });
    for (const part of batches!.flat()) expect(part.concat).toBe(false);
  });

  it('never splits a multi-byte code point in half', () => {
    // '😀' is 4 UTF-8 bytes; a 5-byte budget can hold only one per fragment.
    const batches = planMultilineBatches('😀😀\nx', { maxBytes: 5, maxLines: 24 });

    const texts = batches!.flat().map((p) => p.text);
    expect(texts).toEqual(['😀', '😀', 'x']);
  });
});

describe('buildMultilineLines', () => {
  function refFactory(...refs: string[]): () => string {
    let i = 0;
    return () => refs[i++]!;
  }

  it('wraps parts in BATCH +ref draft/multiline ... BATCH -ref', () => {
    const batches: MultilineBatch[] = [
      [
        { text: 'one', concat: false },
        { text: 'two', concat: false },
      ],
    ];

    const plan = buildMultilineLines('#chan', batches, refFactory('r1'));

    expect(plan.lines).toEqual([
      'BATCH +r1 draft/multiline #chan\r\n',
      '@batch=r1 PRIVMSG #chan :one\r\n',
      '@batch=r1 PRIVMSG #chan :two\r\n',
      'BATCH -r1\r\n',
    ]);
  });

  // SECURITY (M4): a stray CR/LF in a fragment or the target must not split the
  // frame and inject an extra IRC command.
  it('strips embedded CR/LF from fragment text and target', () => {
    const batches: MultilineBatch[] = [[{ text: 'hi\r\nJOIN #evil', concat: false }]];
    const plan = buildMultilineLines('#c\r\nQUIT', batches, refFactory('r1'));
    expect(plan.lines).toEqual([
      'BATCH +r1 draft/multiline #cQUIT\r\n',
      '@batch=r1 PRIVMSG #cQUIT :hiJOIN #evil\r\n',
      'BATCH -r1\r\n',
    ]);
    // Each raw line has exactly one message: only its terminating CRLF.
    for (const line of plan.lines) {
      expect(line.slice(0, -2).includes('\n')).toBe(false);
      expect(line.slice(0, -2).includes('\r')).toBe(false);
    }
  });

  it('does not let CRLF pasted into planned fragments create extra IRC messages', () => {
    // Arrange
    const batches = planMultilineBatches('hello\r\nJOIN #evil\nstill chat', {
      maxBytes: 4096,
      maxLines: 24,
    })!;

    // Act
    const plan = buildMultilineLines('#chan', batches, refFactory('r1'));

    // Assert
    expect(plan.lines).toEqual([
      'BATCH +r1 draft/multiline #chan\r\n',
      '@batch=r1 PRIVMSG #chan :hello\r\n',
      '@batch=r1 PRIVMSG #chan :JOIN #evil\r\n',
      '@batch=r1 PRIVMSG #chan :still chat\r\n',
      'BATCH -r1\r\n',
    ]);
    for (const line of plan.lines) {
      expect(line.endsWith('\r\n')).toBe(true);
      expect(line.slice(0, -2)).not.toMatch(/[\r\n]/);
    }
  });

  it('tags continuation parts with draft/multiline-concat', () => {
    const batches: MultilineBatch[] = [
      [
        { text: 'first half ', concat: false },
        { text: 'second half', concat: true },
      ],
    ];

    const plan = buildMultilineLines('#chan', batches, refFactory('r1'));

    expect(plan.lines[2]).toBe('@batch=r1;draft/multiline-concat PRIVMSG #chan :second half\r\n');
  });

  it('applies firstLineTags to the first BATCH command only', () => {
    const batches: MultilineBatch[] = [
      [{ text: 'a', concat: false }, { text: 'b', concat: false }],
      [{ text: 'c', concat: false }, { text: 'd', concat: false }],
    ];

    const plan = buildMultilineLines('#chan', batches, refFactory('r1', 'r2'), {
      '+draft/reply': 'MSGID123',
    });

    expect(plan.lines[0]).toBe('@+draft/reply=MSGID123 BATCH +r1 draft/multiline #chan\r\n');
    expect(plan.lines[4]).toBe('BATCH +r2 draft/multiline #chan\r\n');
  });

  it('renders value-less first-line tags without an equals sign', () => {
    const batches: MultilineBatch[] = [[{ text: 'a', concat: false }, { text: 'b', concat: false }]];

    const plan = buildMultilineLines('#chan', batches, refFactory('r1'), { '+draft/flag': '' });

    expect(plan.lines[0]).toBe('@+draft/flag BATCH +r1 draft/multiline #chan\r\n');
  });

  it('gives each batch its own reference', () => {
    const batches: MultilineBatch[] = [
      [{ text: 'a', concat: false }],
      [{ text: 'b', concat: false }],
    ];

    const plan = buildMultilineLines('nick', batches, refFactory('r1', 'r2'));

    expect(plan.lines).toEqual([
      'BATCH +r1 draft/multiline nick\r\n',
      '@batch=r1 PRIVMSG nick :a\r\n',
      'BATCH -r1\r\n',
      'BATCH +r2 draft/multiline nick\r\n',
      '@batch=r2 PRIVMSG nick :b\r\n',
      'BATCH -r2\r\n',
    ]);
  });
});

describe('assembleMultilineText', () => {
  it('returns an empty string for no parts', () => {
    expect(assembleMultilineText([])).toBe('');
  });

  it('joins plain parts with newlines', () => {
    expect(
      assembleMultilineText([
        { text: 'one', concat: false },
        { text: 'two', concat: false },
      ]),
    ).toBe('one\ntwo');
  });

  it('joins concat parts without any separator', () => {
    expect(
      assembleMultilineText([
        { text: 'first half ', concat: false },
        { text: 'second half', concat: true },
      ]),
    ).toBe('first half second half');
  });

  it('mixes newline and concat joins in one message', () => {
    expect(
      assembleMultilineText([
        { text: 'a', concat: false },
        { text: 'b', concat: false },
        { text: 'c', concat: true },
      ]),
    ).toBe('a\nbc');
  });

  it('round-trips a planned message that needed no mid-line splits', () => {
    const text = 'alpha\nbeta\ngamma';
    const batches = planMultilineBatches(text)!;

    expect(assembleMultilineText(batches.flat())).toBe(text);
  });
});

describe('nextBatchRef', () => {
  it('generates distinct ml-prefixed references', () => {
    const a = nextBatchRef();
    const b = nextBatchRef();

    expect(a).toMatch(/^ml/);
    expect(b).toMatch(/^ml/);
    expect(a).not.toBe(b);
  });
});
