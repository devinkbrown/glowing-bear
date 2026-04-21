import type { RelaySettings } from '$lib/weechat/types.js';
import type { ZncSettings } from '$lib/znc/adapter.js';
import type { IrssiSettings } from '$lib/irssi/adapter.js';
export type { ZncSettings, IrssiSettings };

export type BackendType = 'weechat' | 'znc' | 'irssi';

export type ThemeName = 'darkbear' | 'obsidian' | 'nord' | 'gruvbox' | 'rose-pine' | 'abyss' | 'ember' | 'aurora' | 'catppuccin' | 'tokyo-night' | 'dracula' | 'solarized' | 'light' | 'custom';

export interface CustomThemeColors {
	gray950: string;  // deep bg / canvas
	gray900: string;  // header, sidebar bg
	gray800: string;  // panels, inputs
	gray700: string;  // hover states
	gray600: string;  // borders, dividers
	gray500: string;  // very muted / timestamps
	gray400: string;  // muted text / icons
	gray300: string;  // secondary text
	gray200: string;  // body text
	gray100: string;  // primary text
	gray50:  string;  // highlights / near-white
	accent:  string;  // accent (links, active, blue replacement)
}

export const DEFAULT_CUSTOM_COLORS: CustomThemeColors = {
	gray950: '#0c0d12',
	gray900: '#111318',
	gray800: '#15171d',
	gray700: '#1c1e25',
	gray600: '#25272e',
	gray500: '#484b5c',
	gray400: '#686c7e',
	gray300: '#9298aa',
	gray200: '#c4c8d8',
	gray100: '#e8ebf5',
	gray50:  '#f4f6ff',
	accent:  '#3b82f6',
};

export interface RelayProfile {
	name: string;
	relay: RelaySettings;
}

export interface AppSettings {
	relay: RelaySettings;
	profiles: RelayProfile[];
	nick: string;
	backendType: BackendType;
	znc: ZncSettings;
	irssi: IrssiSettings;
	theme: ThemeName;
	customColors: CustomThemeColors;
	fontFamily: string;  // 'system' | 'mono' | 'serif' or any installed font name
	watermarkOpacity: number; // 0–100, 0 = hidden
	bgImage: string;          // URL, empty = none
	bgOpacity: number;        // 0–100
	bgBlur: number;           // px blur, 0 = none
	bgTint: string;           // CSS colour, empty = none
	bgTintOpacity: number;    // 0–100
	enableVideoCalls: boolean;
	sidebarWidth: number;
	fontSize: number;
	timestampFormat: '12h' | '24h' | 'off' | 'relative';
	compactMode: boolean;
	inlineImages: boolean;
	notifications: boolean;
	notificationSound: boolean;
	readOnFocus: boolean;
	joinPartMsgs: boolean;
	colorNicks: boolean;
	showPrefixes: boolean;
	autoReconnect: boolean;
	readMarker: boolean;
	onlyUnread: boolean;
	customCSS: string;
	highlightWords: string[];
	inviteToken: string;
}

const STORAGE_KEY = 'darkbear_settings_v1';

const DEFAULT_RELAY: RelaySettings = {
	host: 'eshmaki.me',
	port: 9001,
	tls: true,
	password: '',
	compression: true
};

const DEFAULT_ZNC: ZncSettings = {
	host:     '',
	port:     6697,
	tls:      true,
	nick:     '',
	user:     '',
	password: '',
	network:  '',
	realname: 'DarkBear',
};

const DEFAULT_IRSSI: IrssiSettings = {
	host:     '',
	port:     2626,
	tls:      false,
	nick:     '',
	password: '',
	network:  '',
	realname: 'DarkBear',
};

const DEFAULTS: AppSettings = {
	relay: { ...DEFAULT_RELAY },
	profiles: [],
	nick: '',
	backendType: 'weechat',
	znc: { ...DEFAULT_ZNC },
	irssi: { ...DEFAULT_IRSSI },
	theme: 'darkbear',
	customColors: { ...DEFAULT_CUSTOM_COLORS },
	fontFamily: 'system',
	watermarkOpacity: 15,
	bgImage: '',
	bgOpacity: 40,
	bgBlur: 0,
	bgTint: '',
	bgTintOpacity: 30,
	enableVideoCalls: true,
	sidebarWidth: 240,
	fontSize: 14,
	timestampFormat: '24h',
	compactMode: false,
	inlineImages: true,
	notifications: true,
	notificationSound: false,
	readOnFocus: true,
	joinPartMsgs: true,
	colorNicks: true,
	showPrefixes: true,
	autoReconnect: true,
	readMarker: true,
	onlyUnread: false,
	customCSS: '',
	highlightWords: [],
	inviteToken: '',
};

class SettingsStore {
	relay = $state<RelaySettings>({ ...DEFAULT_RELAY });
	profiles = $state<RelayProfile[]>([]);
	nick = $state(DEFAULTS.nick);
	backendType = $state<BackendType>(DEFAULTS.backendType);
	znc   = $state<ZncSettings>({ ...DEFAULT_ZNC });
	irssi = $state<IrssiSettings>({ ...DEFAULT_IRSSI });
	theme = $state<ThemeName>(DEFAULTS.theme);
	customColors = $state<CustomThemeColors>({ ...DEFAULT_CUSTOM_COLORS });
	fontFamily = $state<string>(DEFAULTS.fontFamily);
	watermarkOpacity = $state(DEFAULTS.watermarkOpacity);
	bgImage       = $state(DEFAULTS.bgImage);
	bgOpacity     = $state(DEFAULTS.bgOpacity);
	bgBlur        = $state(DEFAULTS.bgBlur);
	bgTint        = $state(DEFAULTS.bgTint);
	bgTintOpacity = $state(DEFAULTS.bgTintOpacity);
	enableVideoCalls = $state(DEFAULTS.enableVideoCalls);
	sidebarWidth = $state(DEFAULTS.sidebarWidth);
	fontSize = $state(DEFAULTS.fontSize);
	timestampFormat = $state<'12h' | '24h' | 'off' | 'relative'>(DEFAULTS.timestampFormat);
	compactMode = $state(DEFAULTS.compactMode);
	inlineImages = $state(DEFAULTS.inlineImages);
	notifications = $state(DEFAULTS.notifications);
	notificationSound = $state(DEFAULTS.notificationSound);
	readOnFocus = $state(DEFAULTS.readOnFocus);
	joinPartMsgs = $state(DEFAULTS.joinPartMsgs);
	colorNicks = $state(DEFAULTS.colorNicks);
	showPrefixes = $state(DEFAULTS.showPrefixes);
	autoReconnect = $state(DEFAULTS.autoReconnect);
	readMarker = $state(DEFAULTS.readMarker);
	onlyUnread = $state(DEFAULTS.onlyUnread);
	customCSS = $state(DEFAULTS.customCSS);
	highlightWords = $state<string[]>(DEFAULTS.highlightWords);
	inviteToken = $state(DEFAULTS.inviteToken);

	private saveTimer: ReturnType<typeof setTimeout> | null = null;

	constructor() {
		this.load();
	}

	load(): void {
		if (typeof localStorage === 'undefined') return;
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) return;
			const data = JSON.parse(raw) as Partial<AppSettings>;

			if (data.relay) {
				this.relay = {
					host: data.relay.host ?? DEFAULT_RELAY.host,
					port: data.relay.port ?? DEFAULT_RELAY.port,
					tls: data.relay.tls ?? DEFAULT_RELAY.tls,
					password: data.relay.password ?? DEFAULT_RELAY.password,
					compression: data.relay.compression ?? DEFAULT_RELAY.compression
				};
			}
			if (data.profiles !== undefined) this.profiles = data.profiles;
			if (data.nick !== undefined) this.nick = data.nick;
			if (data.backendType !== undefined) this.backendType = data.backendType;
			if (data.znc   !== undefined) this.znc   = { ...DEFAULT_ZNC,   ...data.znc   };
			if (data.irssi !== undefined) this.irssi = { ...DEFAULT_IRSSI, ...data.irssi };
			if (data.theme !== undefined) {
				// Migrate old theme name
				this.theme = (data.theme as string) === 'midnight' ? 'darkbear' : data.theme;
			}
			if (data.customColors !== undefined) {
				this.customColors = { ...DEFAULT_CUSTOM_COLORS, ...data.customColors };
			}
			if (data.fontFamily !== undefined) this.fontFamily = data.fontFamily;
			if (data.enableVideoCalls !== undefined) this.enableVideoCalls = data.enableVideoCalls;
			if (data.watermarkOpacity !== undefined) {
				const v = Number(data.watermarkOpacity);
				this.watermarkOpacity = v >= 0 && v <= 100 ? v : DEFAULTS.watermarkOpacity;
			}
			if (data.sidebarWidth !== undefined) {
				const w = Number(data.sidebarWidth);
				this.sidebarWidth = w >= 120 && w <= 400 ? w : DEFAULTS.sidebarWidth;
			}
			if (data.fontSize !== undefined) {
				const sz = Number(data.fontSize);
				this.fontSize = sz >= 12 && sz <= 20 ? sz : DEFAULTS.fontSize;
			}
			if (data.timestampFormat !== undefined) this.timestampFormat = data.timestampFormat;
			if (data.compactMode !== undefined) this.compactMode = data.compactMode;
			if (data.inlineImages !== undefined) this.inlineImages = data.inlineImages;
			if (data.notifications !== undefined) this.notifications = data.notifications;
			if (data.notificationSound !== undefined) this.notificationSound = data.notificationSound;
			if (data.readOnFocus !== undefined) this.readOnFocus = data.readOnFocus;
			if (data.joinPartMsgs !== undefined) this.joinPartMsgs = data.joinPartMsgs;
			if (data.colorNicks !== undefined) this.colorNicks = data.colorNicks;
			if (data.showPrefixes !== undefined) this.showPrefixes = data.showPrefixes;
			if (data.autoReconnect !== undefined) this.autoReconnect = data.autoReconnect;
			if (data.readMarker !== undefined) this.readMarker = data.readMarker;
			if (data.onlyUnread !== undefined) this.onlyUnread = data.onlyUnread;
			if (data.customCSS !== undefined) this.customCSS = data.customCSS;
			if (data.highlightWords !== undefined && Array.isArray(data.highlightWords)) this.highlightWords = data.highlightWords;
			if (data.inviteToken !== undefined) this.inviteToken = data.inviteToken;
			if (data.bgImage   !== undefined) this.bgImage   = data.bgImage;
			if (data.bgOpacity !== undefined) {
				const v = Number(data.bgOpacity);
				this.bgOpacity = v >= 0 && v <= 100 ? v : DEFAULTS.bgOpacity;
			}
			if (data.bgBlur !== undefined) {
				const v = Number(data.bgBlur);
				this.bgBlur = v >= 0 && v <= 20 ? v : DEFAULTS.bgBlur;
			}
			if (data.bgTint        !== undefined) this.bgTint        = data.bgTint;
			if (data.bgTintOpacity !== undefined) {
				const v = Number(data.bgTintOpacity);
				this.bgTintOpacity = v >= 0 && v <= 100 ? v : DEFAULTS.bgTintOpacity;
			}
		} catch (_) {
			// Ignore parse errors
		}
	}

	save(): void {
		if (typeof localStorage === 'undefined') return;
		const data: AppSettings = {
			relay: { ...this.relay },
			profiles: this.profiles,
			nick: this.nick,
			backendType: this.backendType,
			znc:   { ...this.znc   },
			irssi: { ...this.irssi },
			theme: this.theme,
			customColors: { ...this.customColors },
			fontFamily: this.fontFamily,
			enableVideoCalls: this.enableVideoCalls,
			watermarkOpacity: this.watermarkOpacity,
			sidebarWidth: this.sidebarWidth,
			fontSize: this.fontSize,
			timestampFormat: this.timestampFormat,
			compactMode: this.compactMode,
			inlineImages: this.inlineImages,
			notifications: this.notifications,
			notificationSound: this.notificationSound,
			readOnFocus: this.readOnFocus,
			joinPartMsgs: this.joinPartMsgs,
			colorNicks: this.colorNicks,
			showPrefixes: this.showPrefixes,
			autoReconnect: this.autoReconnect,
			readMarker: this.readMarker,
			onlyUnread: this.onlyUnread,
			customCSS: this.customCSS,
			highlightWords: this.highlightWords,
			inviteToken: this.inviteToken,
			bgImage: this.bgImage,
			bgOpacity: this.bgOpacity,
			bgBlur: this.bgBlur,
			bgTint: this.bgTint,
			bgTintOpacity: this.bgTintOpacity,
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
	}

	// Debounced save — coalesces rapid changes into a single write
	scheduleSave(): void {
		if (this.saveTimer !== null) clearTimeout(this.saveTimer);
		this.saveTimer = setTimeout(() => {
			this.saveTimer = null;
			this.save();
		}, 500);
	}

	reset(): void {
		this.relay = { ...DEFAULT_RELAY };
		this.nick = DEFAULTS.nick;
		this.theme = DEFAULTS.theme;
		this.customColors = { ...DEFAULT_CUSTOM_COLORS };
		this.fontFamily = DEFAULTS.fontFamily;
		this.enableVideoCalls = DEFAULTS.enableVideoCalls;
		this.watermarkOpacity = DEFAULTS.watermarkOpacity;
		this.sidebarWidth = DEFAULTS.sidebarWidth;
		this.fontSize = DEFAULTS.fontSize;
		this.timestampFormat = DEFAULTS.timestampFormat;
		this.compactMode = DEFAULTS.compactMode;
		this.inlineImages = DEFAULTS.inlineImages;
		this.notifications = DEFAULTS.notifications;
		this.notificationSound = DEFAULTS.notificationSound;
		this.readOnFocus = DEFAULTS.readOnFocus;
		this.joinPartMsgs = DEFAULTS.joinPartMsgs;
		this.colorNicks = DEFAULTS.colorNicks;
		this.showPrefixes = DEFAULTS.showPrefixes;
		this.autoReconnect = DEFAULTS.autoReconnect;
		this.readMarker = DEFAULTS.readMarker;
		this.onlyUnread = DEFAULTS.onlyUnread;
		this.customCSS = DEFAULTS.customCSS;
		this.bgImage       = DEFAULTS.bgImage;
		this.bgOpacity     = DEFAULTS.bgOpacity;
		this.bgBlur        = DEFAULTS.bgBlur;
		this.bgTint        = DEFAULTS.bgTint;
		this.bgTintOpacity = DEFAULTS.bgTintOpacity;
		this.save();
	}

	exportJSON(): string {
		return localStorage.getItem(STORAGE_KEY) ?? '{}';
	}

	importJSON(json: string): void {
		try {
			JSON.parse(json); // validate
			localStorage.setItem(STORAGE_KEY, json);
			this.load();
		} catch (_) {
			throw new Error('Invalid settings JSON');
		}
	}

	saveProfile(name: string): void {
		const existing = this.profiles.findIndex(p => p.name === name);
		const profile: RelayProfile = { name, relay: { ...this.relay } };
		if (existing >= 0) {
			this.profiles = this.profiles.map((p, i) => i === existing ? profile : p);
		} else {
			this.profiles = [...this.profiles, profile];
		}
		this.scheduleSave();
	}

	deleteProfile(name: string): void {
		this.profiles = this.profiles.filter(p => p.name !== name);
		this.scheduleSave();
	}

	loadProfile(name: string): void {
		const p = this.profiles.find(p => p.name === name);
		if (p) { this.relay = { ...p.relay }; this.scheduleSave(); }
	}
}

export const settings = new SettingsStore();
