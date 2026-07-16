import { describe, expect, it } from 'vitest';
import type { WeeChatBuffer, WeeChatLine } from '@/lib/weechat/model';
import { archiveRecordFromCaption, archiveRecordFromLine, normalizeArchiveText } from './record';

const buffer = {
  id: '0x1', name: 'irc.orochi.#darkbear', fullName: 'irc.orochi.#darkbear', shortName: '#darkbear',
  title: '', number: 1, type: 0, nicksCount: 0, localVars: {}, notify: 1, hidden: false,
} satisfies WeeChatBuffer;

function line(over: Partial<WeeChatLine> = {}): WeeChatLine {
  return {
    id: 'line-1', buffer: '0x1', date: new Date(1_700_000_000_000), datePrinted: new Date(),
    displayed: true, highlight: false, tags: [], prefix: '', message: 'See https://files.test/report.pdf',
    nick: 'Alice', ircTags: new Map(), msgid: 'm1', replyTo: 'root', ...over,
  };
}

describe('archive record adapter', () => {
  it('normalizes indexed fields without storing relay pointers in the key', () => {
    const record = archiveRecordFromLine(buffer, line({ highlight: true }), true);

    expect(record).toMatchObject({
      key: 'irc.orochi.#darkbear\0line-1',
      bufferName: '#darkbear',
      sender: 'Alice',
      msgid: 'm1',
      replyParent: 'root',
      hasLink: true,
      hasFile: true,
      isMention: true,
      isUnread: true,
    });
    expect(record?.normalizedText).toContain('alice see https://files.test/report.pdf');
  });

  it('excludes optimistic, local-system, and hidden lines', () => {
    expect(archiveRecordFromLine(buffer, line({ id: '_opt_1' }), false)).toBeNull();
    expect(archiveRecordFromLine(buffer, line({ id: '_sys_1' }), false)).toBeNull();
    expect(archiveRecordFromLine(buffer, line({ displayed: false }), false)).toBeNull();
  });

  it('normalizes Unicode and whitespace for deterministic phrase matching', () => {
    expect(normalizeArchiveText('  ＤarkBear\n  READY ')).toBe('darkbear ready');
  });

  it('adapts captions into a distinct media archive scope', () => {
    const record = archiveRecordFromCaption({
      channel: '#DarkBear',
      nick: 'Alice',
      text: 'Caption with https://example.test/notes.txt',
      time: 1_700_000_000_000,
    }, 4);
    expect(record).toMatchObject({
      key: 'media:#darkbear\0caption-1700000000000-4',
      bufferKey: 'media:#darkbear',
      bufferName: '#DarkBear call transcript',
      sender: 'Alice',
      hasLink: true,
      hasFile: true,
      isMention: false,
      isUnread: false,
    });
  });
});
