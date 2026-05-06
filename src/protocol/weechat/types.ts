// WeeChat relay protocol types
// Domain types (Buffer, Line, Nick, etc.) are re-exported from @/types
export type {
  WeeChatBuffer,
  WeeChatLine,
  WeeChatNick,
  WeeChatHotlist,
  RelaySettings,
} from '@/types';
export { ConnectionState } from '@/types';

export type WeeChatType = 'chr' | 'int' | 'lon' | 'str' | 'buf' | 'ptr' | 'tim' | 'htb' | 'hda' | 'inf' | 'inl' | 'arr';

export interface WeeChatMessage {
	length: number;
	compression: number;
	id: string;
	objects: WeeChatObject[];
}

export interface WeeChatObject {
	type: WeeChatType;
	value: unknown;
}

export interface HdataResult {
	hpath: string;
	keys: Record<string, WeeChatType>;
	count: number;
	items: HdataItem[];
}

export interface HdataItem {
	pointers: string[];
	objects: Record<string, unknown>;
}
