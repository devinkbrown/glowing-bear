// Private local saved messages + bounded activity inbox.

import { createStore, produce } from 'solid-js/store';
import type { WeeChatLine, BufferEntry } from '@/types';
import type { ArchiveRetention } from '@/lib/archive/types';
import { closeThread, sanitizePreview } from './threads';

export type ActivityKind = 'mention' | 'reply' | 'dm' | 'call' | 'operator';

export interface MessageSource {
  bufferKey: string;
  bufferName: string;
  msgid: string;
  lineId: string;
  timestamp: number;
  sender: string;
  preview: string;
}

export interface SavedMessage extends MessageSource {
  id: string;
  note: string;
  savedAt: number;
}

export interface ActivityItem extends MessageSource {
  id: string;
  kind: ActivityKind;
  unread: boolean;
}

interface ActivityState {
  saved: SavedMessage[];
  items: ActivityItem[];
  panelOpen: boolean;
  tab: 'activity' | 'saved';
}

const SAVED_KEY = 'darkbear_saved_messages_v1';
const ACTIVITY_KEY = 'darkbear_activity_v1';
const MAX_ITEMS = 500;

function loadArray<T>(key: string): T[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value.slice(0, MAX_ITEMS) as T[] : [];
  } catch {
    return [];
  }
}

const [state, setState] = createStore<ActivityState>({
  saved: loadArray<SavedMessage>(SAVED_KEY),
  items: loadArray<ActivityItem>(ACTIVITY_KEY),
  panelOpen: false,
  tab: 'activity',
});

export { state as activityState };

function persist(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(SAVED_KEY, JSON.stringify(state.saved));
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(state.items));
}

export function sourceFromLine(entry: BufferEntry, line: WeeChatLine): MessageSource {
  return {
    bufferKey: entry.buffer.fullName || entry.buffer.name,
    bufferName: entry.buffer.shortName || entry.buffer.name,
    msgid: line.msgid ?? '',
    lineId: line.id,
    timestamp: line.date.getTime(),
    sender: line.nick ?? 'server',
    preview: sanitizePreview(line.message),
  };
}

export function savedId(source: MessageSource): string {
  return `${source.bufferKey}\0${source.msgid || source.lineId}`;
}

export function isMessageSaved(source: MessageSource): boolean {
  const id = savedId(source);
  return state.saved.some((item) => item.id === id);
}

export function toggleSavedMessage(source: MessageSource): boolean {
  const id = savedId(source);
  const existing = state.saved.findIndex((item) => item.id === id);
  setState(produce((draft) => {
    if (existing >= 0) draft.saved.splice(existing, 1);
    else draft.saved.unshift({ ...source, id, note: '', savedAt: Date.now() });
    if (draft.saved.length > MAX_ITEMS) draft.saved.length = MAX_ITEMS;
  }));
  persist();
  return existing < 0;
}

export function updateSavedNote(id: string, note: string): void {
  const index = state.saved.findIndex((item) => item.id === id);
  if (index < 0) return;
  setState('saved', index, 'note', sanitizePreview(note));
  persist();
}

export function removeSavedMessage(id: string): void {
  setState('saved', (items) => items.filter((item) => item.id !== id));
  persist();
}

export function clearSavedMessages(): void {
  setState('saved', []);
  persist();
}

export function removeSavedForBuffer(bufferKey: string): void {
  setState('saved', (items) => items.filter((item) => item.bufferKey !== bufferKey));
  persist();
}

export function syncSavedRetention(retention: ArchiveRetention, now = Date.now()): void {
  if (retention === 'off') {
    clearSavedMessages();
    return;
  }
  if (retention !== '7d' && retention !== '30d') return;
  const days = retention === '7d' ? 7 : 30;
  const cutoff = now - days * 86_400_000;
  setState('saved', (items) => items.filter((item) => item.timestamp >= cutoff));
  persist();
}

export function recordActivity(kind: ActivityKind, source: MessageSource, idSuffix = ''): void {
  const id = `${kind}\0${savedId(source)}\0${idSuffix}`;
  if (state.items.some((item) => item.id === id)) return;
  setState(produce((draft) => {
    draft.items.unshift({ ...source, id, kind, unread: true });
    if (draft.items.length > MAX_ITEMS) draft.items.length = MAX_ITEMS;
  }));
  persist();
}

export function recordLineActivity(entry: BufferEntry, line: WeeChatLine, operatorAlert = false): void {
  if (line.isSelf || line.isTagMsg || !line.displayed) return;
  const source = sourceFromLine(entry, line);
  if (operatorAlert) recordActivity('operator', source);
  else if (line.replyTo) recordActivity('reply', source);
  else if (entry.buffer.localVars['type'] === 'private' || line.isWhisper) recordActivity('dm', source);
  else if (line.highlight) recordActivity('mention', source);
}

export function recordCallActivity(label: string, peer: string, timestamp = Date.now()): void {
  recordActivity('call', {
    bufferKey: '', bufferName: 'Calls', msgid: '', lineId: `${timestamp}-${label}-${peer}`,
    timestamp, sender: peer || 'Orochi media', preview: sanitizePreview(label),
  });
}

export function activityUnreadCount(): number {
  return state.items.reduce((count, item) => count + (item.unread ? 1 : 0), 0);
}

export function markActivityRead(id?: string): void {
  if (id) {
    const index = state.items.findIndex((item) => item.id === id);
    if (index >= 0) setState('items', index, 'unread', false);
  } else {
    setState('items', (items) => items.map((item) => ({ ...item, unread: false })));
  }
  persist();
}

export function clearActivity(): void {
  setState('items', []);
  persist();
}

export function openActivityPanel(tab: 'activity' | 'saved' = 'activity'): void {
  closeThread();
  setState({ panelOpen: true, tab });
}

export function closeActivityPanel(): void {
  setState('panelOpen', false);
}

export function setActivityTab(tab: 'activity' | 'saved'): void {
  setState('tab', tab);
}

export function resetActivity(): void {
  setState({ saved: [], items: [], panelOpen: false, tab: 'activity' });
  persist();
}
