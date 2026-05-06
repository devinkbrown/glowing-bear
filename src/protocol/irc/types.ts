// IRC Types for DarkBear

export interface IrcMessage {
	tags: Map<string, string>;
	prefix: string | null;
	command: string;
	params: string[];
}

export interface IrcUser {
	nick: string;
	ident: string;
	host: string;
	modes: Set<string>;
	account?: string;
	away?: boolean;
	realname?: string;
}

export type IrcLineType =
	| 'message'
	| 'action'
	| 'notice'
	| 'join'
	| 'part'
	| 'quit'
	| 'kick'
	| 'nick'
	| 'topic'
	| 'mode'
	| 'info'
	| 'error'
	| 'server';

export interface IrcLine {
	id: string;
	ts: Date;
	type: IrcLineType;
	nick?: string;
	text: string;
	tags?: Map<string, string>;
	self?: boolean;
}

export type IrcBufferType = 'channel' | 'query' | 'server';

export interface IrcBuffer {
	id: string;
	type: IrcBufferType;
	name: string;
	messages: IrcLine[];
	users: Map<string, IrcUser>;
	topic?: string;
	topicSetBy?: string;
	topicSetAt?: Date;
	unread: number;
	mentioned: boolean;
	joined: boolean;
	modes: Set<string>;
}

export enum ConnectionState {
	DISCONNECTED = 'DISCONNECTED',
	CONNECTING = 'CONNECTING',
	REGISTERING = 'REGISTERING',
	CONNECTED = 'CONNECTED'
}

export interface SaslPlainConfig {
	user: string;
	pass: string;
}

export interface Settings {
	server: string;
	port: number;
	tls: boolean;
	nick: string;
	realname: string;
	ident: string;
	password?: string;
	saslPlain?: SaslPlainConfig;
	channels: string[];
	theme: 'dark' | 'light';
	notifications: boolean;
	sounds: boolean;
	timestampFormat: '12h' | '24h' | 'off';
	compactMode: boolean;
	inlineImages: boolean;
}

export interface ISupport {
	PREFIX: Map<string, string>; // mode char -> prefix char
	CHANTYPES: string[];
	CHANMODES: {
		listModes: string;
		paramAlways: string;
		paramOnSet: string;
		noParam: string;
	};
	NICKLEN: number;
	CASEMAPPING: string;
	NETWORK?: string;
	MAXCHANNELS?: number;
	TOPICLEN?: number;
	KICKLEN?: number;
	AWAYLEN?: number;
	MODES?: number;
}

export interface WhoisInfo {
	nick: string;
	ident?: string;
	host?: string;
	realname?: string;
	server?: string;
	serverInfo?: string;
	operator?: boolean;
	idle?: number;
	signon?: number;
	channels?: string[];
	account?: string;
	away?: string;
}
