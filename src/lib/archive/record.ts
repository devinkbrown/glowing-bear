import type { WeeChatBuffer, WeeChatLine } from '@/lib/weechat/model';
import type { ArchiveRecord } from './types';
import type { SuimyakuTranscriptEntry } from '@/lib/suimyaku-media/types';

const LINK_RE = /https?:\/\/[^\s<>()]+/i;
const FILE_RE = /(?:https?:\/\/[^\s<>()]+|\b[^\s<>()]+)\.(?:7z|avi|csv|docx?|gif|gz|jpe?g|mkv|mov|mp3|mp4|pdf|png|rar|tar|txt|webm|webp|xlsx?|zip)(?:[?#][^\s<>()]*)?\b/i;

export function normalizeArchiveText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

export function archiveRecordFromLine(
  buffer: WeeChatBuffer,
  line: WeeChatLine,
  isUnread: boolean,
): ArchiveRecord | null {
  if (!line.displayed || line.id.startsWith('_opt_') || line.id.startsWith('_sys_')) return null;
  const bufferKey = buffer.fullName || buffer.name;
  if (!bufferKey || !line.id) return null;
  const bufferName = buffer.shortName || buffer.name;
  const sender = line.nick ?? '';
  const text = line.message;
  const normalizedText = normalizeArchiveText(`${sender} ${text}`);
  const sizeBytes = new TextEncoder().encode(`${bufferKey}\0${sender}\0${text}`).byteLength;
  return {
    key: `${bufferKey}\0${line.id}`,
    bufferKey,
    bufferName,
    lineId: line.id,
    timestamp: line.date.getTime(),
    sender,
    text,
    normalizedText,
    msgid: line.msgid ?? '',
    replyParent: line.replyTo ?? '',
    hasLink: LINK_RE.test(text),
    hasFile: FILE_RE.test(text),
    isMention: line.highlight,
    isUnread,
    sizeBytes,
  };
}

/** Convert an Event Spine caption into the same opt-in local archive schema. */
export function archiveRecordFromCaption(
  entry: SuimyakuTranscriptEntry,
  sequence: number,
): ArchiveRecord {
  const scope = entry.channel.toLowerCase();
  const bufferKey = `media:${scope}`;
  const lineId = `caption-${entry.time}-${sequence}`;
  const normalizedText = normalizeArchiveText(`${entry.nick} ${entry.text}`);
  const sizeBytes = new TextEncoder()
    .encode(`${bufferKey}\0${entry.nick}\0${entry.text}`)
    .byteLength;
  return {
    key: `${bufferKey}\0${lineId}`,
    bufferKey,
    bufferName: `${entry.channel} call transcript`,
    lineId,
    timestamp: entry.time,
    sender: entry.nick,
    text: entry.text,
    normalizedText,
    msgid: '',
    replyParent: '',
    hasLink: LINK_RE.test(entry.text),
    hasFile: FILE_RE.test(entry.text),
    isMention: false,
    isUnread: false,
    sizeBytes,
  };
}
