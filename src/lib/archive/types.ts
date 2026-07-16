export type ArchiveRetention = 'off' | '7d' | '30d' | 'custom';

export interface ArchivePolicy {
  retention: ArchiveRetention;
  maxMiB: number;
}

export interface ArchiveRecord {
  /** Stable across relay reconnects: full buffer name + relay line id. */
  key: string;
  bufferKey: string;
  bufferName: string;
  lineId: string;
  timestamp: number;
  sender: string;
  text: string;
  normalizedText: string;
  msgid: string;
  replyParent: string;
  hasLink: boolean;
  hasFile: boolean;
  isMention: boolean;
  isUnread: boolean;
  sizeBytes: number;
}

export interface ArchiveSearchRequest {
  query: string;
  limit?: number;
  now?: number;
}

export interface ArchiveSearchHit {
  key: string;
  bufferKey: string;
  bufferName: string;
  lineId: string;
  timestamp: number;
  sender: string;
  text: string;
  msgid: string;
  replyParent: string;
  snippet: string;
}

export interface ArchiveStats {
  messages: number;
  bytes: number;
  buffers: ArchiveBufferStats[];
}

export interface ArchiveBufferStats {
  bufferKey: string;
  bufferName: string;
  messages: number;
  bytes: number;
}

export type ArchiveWorkerRequest =
  | { id: number; type: 'put'; records: ArchiveRecord[]; policy: ArchivePolicy }
  | { id: number; type: 'search'; request: ArchiveSearchRequest }
  | { id: number; type: 'cancel-search'; targetId: number }
  | { id: number; type: 'delete-buffer'; bufferKey: string }
  | { id: number; type: 'wipe' }
  | { id: number; type: 'configure'; policy: ArchivePolicy }
  | { id: number; type: 'stats' };

export type ArchiveWorkerResult = ArchiveSearchHit[] | ArchiveStats | null;

export type ArchiveWorkerResponse =
  | { id: number; ok: true; result: ArchiveWorkerResult }
  | { id: number; ok: false; error: 'unavailable' | 'storage' | 'invalid-request' | 'cancelled' };
