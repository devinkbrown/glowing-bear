import {
  buildSessionResumeLine,
  parseCHANLIMIT,
  parseIRCMessage,
  formatIRCLine,
  parsePREFIX,
  selectSaslMechanism,
  type SaslMechanism,
} from './parser';
import { ONYX_WEBSOCKET_PROTOCOLS, wantedCaps } from './wantedCaps';
import type { IRCMessage, ISupport } from './types';

export type IRCEventHandler = (msg: IRCMessage) => void;
export type RawHandler = (line: string, direction: 'in' | 'out') => void;

/** One row of a LIST reply (numeric 322). */
export interface ChannelListRow {
  channel: string;
  users: number;
  topic: string;
}

export interface IRCClientOptions {
  url: string;           // e.g. wss://eshmaki.me:8080
  nick: string;
  /** SASL authcid when the account differs from the visible registration nick. */
  account?: string;
  realname?: string;
  username?: string;
  password?: string;     // SASL PLAIN password
  saslSessionToken?: string; // Onyx Server sst_ account re-entry credential
  sessionToken?: string; // Onyx Server SESSION RESUME token (local node)
  meshToken?: string;    // Onyx Server mesh-sealed reclaim token (any node)
  hasClientCert?: boolean;
  /** called for every parsed message */
  onMessage: IRCEventHandler;
  /** called for every inbound binary WebSocket frame (browser media datagrams) */
  onBinary?: (data: Uint8Array) => void;
  onRaw?: RawHandler;
  /** Called on registration with the exact server-authored 001 welcome. */
  onConnected?: (welcome: IRCMessage) => void;
  onDisconnected?: (reason: string) => void;
  onError?: (err: string) => void;
  /** Called only when Onyx Server rejects the token; true means password fallback starts. */
  onSaslSessionTokenRejected?: (willRetryWithPassword: boolean) => void;
  onNickChanged?: (newNick: string) => void;
  /**
   * Called for an inbound IRCv3 `draft/read-marker` MARKREAD. `timestamp` is the
   * validated server-time string, or null when the server reports no marker
   * (`MARKREAD <target> *`) or a malformed one. The bridge folds this into the
   * threads store's per-buffer read-marker position.
   */
  onReadMarker?: (target: string, timestamp: string | null) => void;
}

const RECONNECT_BASE = 2000;

/**
 * IRCv3 `draft/read-marker` timestamp: `YYYY-MM-DDThh:mm:ss[.fff]Z`, always UTC.
 * Validated on the send path so a crafted/malformed marker fails closed rather
 * than emitting a bad MARKREAD. (formatIRCLine additionally strips any CR/LF, so
 * this is defence-in-depth against injection, not the only guard.)
 */
const MARKREAD_TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

/**
 * Length-independent, data-independent string compare for SCRAM server-signature
 * verification. Avoids the early-exit timing of `===` so a near-miss signature
 * cannot be probed byte-by-byte. Unequal lengths still fold every char into the
 * accumulator before returning false.
 */
function constantTimeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** Escape a tag value per IRCv3 spec (inverse of parser's unescapeTagValue). */
function escapeTagValue(val: string): string {
  return val
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\:')
    .replace(/ /g, '\\s')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

export class IRCClient {
  private ws: WebSocket | null = null;
  private opts: IRCClientOptions;
  /** Registration nick before any collision fallback. */
  private readonly _canonicalNick: string;
  /** Account-bound SASL authcid; may intentionally differ from the nick. */
  private readonly _authcid: string;
  private reconnectDelay = RECONNECT_BASE;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setTimeout> | null = null;
  private pongTimeout: ReturnType<typeof setTimeout> | null = null;
  private _destroyed = false;
  private _registered = false;
  /** True once SASL has succeeded (903). Gates the post-001 SESSION commands. */
  private _loggedIn = false;
  private _saslPending = false;
  private _capNegotiating = true;
  private _capReqPending = 0;
  private _capReqPendingNames = new Set<string>();
  private _buffer = '';
  /** Accumulated caps across multiline CAP LS responses */
  private _capAvailable: string[] = [];
  /** Available SASL mechanisms parsed from sasl cap value */
  private _saslMechs: string[] = [];
  /** Which SASL mechanism we're using */
  private _saslMech: SaslMechanism | null = null;
  /** SCRAM state between challenge/response steps */
  private _scramState: { clientFirstMsgBare: string; nonce: string; hash: 'SHA-256'; bits: number } | null = null;
  /**
   * Base64 ServerSignature the client computed at client-final time. Non-null
   * once we've sent the client proof and are awaiting the server-final `v=`.
   * Its presence also routes the next AUTHENTICATE to the verification step
   * (mutual auth), distinct from the earlier server-first challenge.
   */
  private _scramServerSig: string | null = null;
  /** How many times we've appended _ to nick during registration */
  private _nickRetries = 0;
  /** SASL auth timeout guard */
  private _saslTimer: ReturnType<typeof setTimeout> | null = null;
  /** In-flight LIST collection (see list()). */
  private _listPending: {
    rows: ChannelListRow[];
    resolve: (rows: ChannelListRow[]) => void;
    promise: Promise<ChannelListRow[]>;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;

  /** Caps that were ACKed by the server — readable by the store */
  public negotiatedCaps = new Set<string>();
  /** Cap values advertised via CAP LS / CAP NEW (key=value form). Empty string if no value. */
  public capValues = new Map<string, string>();
  /** Optional listener notified whenever capValues / negotiatedCaps change (CAP ACK/NEW/DEL). */
  public onCapChange: (() => void) | null = null;
  /**
   * Auxiliary message subscribers fired in addition to the primary
   * `opts.onMessage` handler. Used by feature hooks (e.g. whiteboard)
   * that need to observe inbound IRC messages without owning the
   * primary store handler.
   */
  public extraMessageHandlers: Set<IRCEventHandler> = new Set();
  /**
   * Auxiliary binary-frame subscribers, fired in addition to `opts.onBinary`.
   * The media engine registers here to receive browser media datagrams without
   * owning the primary `onBinary` option.
   */
  public binaryHandlers: Set<(data: Uint8Array) => void> = new Set();

  isupport: ISupport = {
    // Defaults mirror Onyx Server's ISUPPORT PREFIX=(YQqov)*!.@+ (founder Q/'!',
    // owner q/'.', op o/'@', voice v/'+', plus the render-only oper Y/'*').
    // Overwritten verbatim from 005 PREFIX on connect.
    PREFIX: { Y: '*', Q: '!', q: '.', o: '@', v: '+' },
    PREFIX_MODES: { '*': 'Y', '!': 'Q', '.': 'q', '@': 'o', '+': 'v' },
    // Onyx Server defaults (overwritten from 005 on connect):
    //   CHANMODES=beIZ,k,lfj,imnstCTNMSgWOA, CHANTYPES=#&, CASEMAPPING=ascii,
    //   NICKLEN=64, TOPICLEN=390, CHANLIMIT=#&:50, MONITOR=128, SILENCE=32.
    CHANMODES: ['beIZ', 'k', 'lfj', 'imnstCTNMSgWOA'],
    CHANTYPES: '#&',
    CHANLIMITS: {},
    NETWORK: 'Onyx',
    CASEMAPPING: 'ascii',
    MODES: 4,
    MAXCHANNELS: 50,
    NICKLEN: 64,
    TOPICLEN: 390,
    IRCX: false,
    SILENCE: 0,          // SILENCE=20 — max entries in server-side silence list
    VAPID: '',           // VAPID=<key> — Web Push server key (empty = push off)
  };

  /** Map prefix char → mode letter, e.g. '@' → 'o'. Onyx Server: (YQqov)*!.@+ */
  prefixToMode: Record<string, string> = { '*': 'Y', '!': 'Q', '.': 'q', '@': 'o', '+': 'v' };
  /** Map mode letter → prefix char (used for display). Onyx Server: (YQqov)*!.@+ */
  modeToPrefix: Record<string, string> = { Y: '*', Q: '!', q: '.', o: '@', v: '+' };

  constructor(opts: IRCClientOptions) {
    this.opts = opts;
    // Save before any nick mutations (433 collision appends '_'). Authentication
    // uses the explicit account when supplied; reconnect still retries the
    // user's original display nick rather than overwriting it with the authcid.
    this._canonicalNick = opts.nick;
    this._authcid = opts.account?.trim() || opts.nick;
  }

  connect() {
    if (this._destroyed) return;
    // Never run two sockets in parallel. Tear down any prior socket first, and
    // detach its handlers so its close event can't trigger another reconnect.
    if (this.ws) {
      try {
        this.ws.onclose = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.close();
      } catch { /* already closing */ }
      this.ws = null;
    }
    // Re-attempt the canonical nick on every fresh connection. A prior 433
    // fallback mutates opts.nick to an alias (e.g. "kain_"); without this reset
    // each reconnect would re-register under the alias forever and never
    // reclaim the real nick.
    this.opts.nick = this._canonicalNick;
    this._registered = false;
    this._loggedIn = false;
    this._saslPending = false;
    this._capNegotiating = true;
    this._capReqPending = 0;
    this._capReqPendingNames = new Set();
    this._buffer = '';
    this._capAvailable = [];
    this._saslMechs = [];
    this._saslMech = null;
    this._scramState = null;
    this._scramServerSig = null;
    this._nickRetries = 0;
    this.negotiatedCaps = new Set();
    this.capValues = new Map();
    // Resolve any LIST left hanging by the previous connection.
    this._finishList();
    if (this._saslTimer) { clearTimeout(this._saslTimer); this._saslTimer = null; }
    // Clear ping timers from any prior connection before opening a new socket.
    // Without this, a stale pongTimeout fires on the brand-new WebSocket.
    this._clearPingTimers();

    try {
      this.ws = new WebSocket(this.opts.url, [...ONYX_WEBSOCKET_PROTOCOLS]);
      // Browser media datagrams ride binary frames on this same socket; deliver
      // them as ArrayBuffers (not Blobs) so onBinary gets bytes synchronously.
      this.ws.binaryType = 'arraybuffer';
      this.ws.onopen = this._onOpen.bind(this);
      this.ws.onmessage = this._onMessage.bind(this);
      this.ws.onclose = this._onClose.bind(this);
      this.ws.onerror = this._onError.bind(this);
    } catch (e) {
      this.opts.onError?.(`WebSocket error: ${e}`);
    }
  }

  destroy() {
    this._destroyed = true;
    this._clearTimers();
    if (this.ws) {
      // Null handlers first so _onClose cannot fire onDisconnected after destroy.
      this.ws.onclose = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
  }

  send(line: string): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(line);
      this.opts.onRaw?.(line.replace(/\r\n$/, ''), 'out');
      return true;
    } catch {
      // WebSocket state raced — let _onClose handle the disconnect. Reporting
      // false lets composers retain text instead of treating the no-op as sent.
      return false;
    }
  }

  sendRaw(command: string, ...params: string[]): boolean {
    return this.send(formatIRCLine(command, ...params));
  }

  /**
   * Force-close the socket through the NORMAL close path, so onDisconnected
   * fires and the store's reconnect machinery takes over. Used when the OS
   * reports the network gone (window 'offline') — the TCP stack can take
   * minutes to notice on its own, and messages composed in that window would
   * silently vanish instead of queueing to the offline outbox.
   */
  dropConnection(reason = 'network offline') {
    try {
      this.ws?.close(4002, reason);
    } catch {
      /* already closing/closed */
    }
  }

  /** The effective current nick (registration nick, or the post-433 alias). */
  get currentNick(): string {
    return this.opts.nick;
  }

  /** True only after SASL success; account-scoped features must gate on this. */
  get loggedIn(): boolean {
    return this._loggedIn;
  }

  /** Use a freshly issued Onyx Server re-entry credential on the next reconnect. */
  setSaslSessionToken(token: string | undefined): void {
    this.opts.saslSessionToken = token;
  }

  /** Send a media datagram as a binary WebSocket frame (browser media plane). */
  sendBinary(bytes: Uint8Array) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    try {
      // Copy into a fresh ArrayBuffer-backed view so a pooled/odd-offset source
      // buffer isn't sent with stale trailing bytes.
      this.ws.send(bytes.slice());
    } catch {
      // WebSocket state raced — let _onClose handle the disconnect.
    }
  }

  // ── Public IRC command helpers ──────────────────────────────────────────

  join(channel: string, key?: string) {
    this.sendRaw('JOIN', channel, ...(key ? [key] : []));
  }

  tagmsg(target: string, tags: Record<string, string>): boolean {
    // escapeTagValue already encodes CR/LF in values as \r/\n escapes; the
    // target is interpolated raw, so strip any embedded newline to keep this
    // one frame = one IRC message (no injected second command).
    const safeTarget = target.replace(/[\r\n]/g, '');
    const tagStr = Object.entries(tags).map(([k, v]) => v ? `${k}=${escapeTagValue(v)}` : k).join(';');
    return this.send(`@${tagStr} TAGMSG ${safeTarget}\r\n`);
  }

  part(channel: string, reason = 'Leaving') {
    this.sendRaw('PART', channel, reason);
  }

  privmsg(target: string, text: string): boolean {
    return this.sendRaw('PRIVMSG', target, text);
  }

  notice(target: string, text: string) {
    this.sendRaw('NOTICE', target, text);
  }

  nick(newNick: string) {
    this.sendRaw('NICK', newNick);
  }

  quit(reason = 'Goodbye') {
    this.sendRaw('QUIT', reason);
  }

  topic(channel: string, text?: string) {
    if (text !== undefined) {
      this.sendRaw('TOPIC', channel, text);
    } else {
      this.sendRaw('TOPIC', channel);
    }
  }

  mode(target: string, modes?: string, ...params: string[]) {
    this.sendRaw('MODE', target, ...(modes ? [modes, ...params] : []));
  }

  kick(channel: string, nick: string, reason = '') {
    this.sendRaw('KICK', channel, nick, reason);
  }

  whois(nick: string) {
    this.sendRaw('WHOIS', nick);
  }

  /**
   * Send an IRCv3 `draft/read-marker` MARKREAD for `target` at `isoTimestamp`
   * (server-time `YYYY-MM-DDThh:mm:ss[.fff]Z`). Fails closed — returns false and
   * sends nothing — unless the cap was negotiated and both target and timestamp
   * are well-formed, so we never emit an unknown command, a malformed marker, or
   * (via a CR/LF-bearing target) a smuggled second command.
   */
  setReadMarker(target: string, isoTimestamp: string): boolean {
    if (!this.negotiatedCaps.has('draft/read-marker')) return false;
    if (!target || /[\r\n\x00 ]/.test(target)) return false;
    if (!MARKREAD_TS_RE.test(isoTimestamp)) return false;
    this.sendRaw('MARKREAD', target, `timestamp=${isoTimestamp}`);
    return true;
  }

  /**
   * Query the server's current read marker for `target` (draft/read-marker).
   * The reply arrives as an inbound MARKREAD (see onReadMarker). Fails closed
   * when the cap is not negotiated or the target is malformed.
   */
  queryReadMarker(target: string): boolean {
    if (!this.negotiatedCaps.has('draft/read-marker')) return false;
    if (!target || /[\r\n\x00 ]/.test(target)) return false;
    this.sendRaw('MARKREAD', target);
    return true;
  }

  /**
   * Run a server LIST and collect the reply into rows.
   *
   * Sends `LIST`, accumulates 322 RPL_LIST rows until 323 RPL_LISTEND, then
   * resolves. Onyx Server merges mesh-wide results server-side, so a single LIST
   * yields the whole network. A timeout guard resolves with whatever has been
   * collected if the end numeric never arrives (e.g. disconnect mid-reply).
   * Concurrent callers share the same in-flight request.
   */
  list(timeoutMs = 15_000): Promise<ChannelListRow[]> {
    if (this._listPending) return this._listPending.promise;

    let resolve!: (rows: ChannelListRow[]) => void;
    const promise = new Promise<ChannelListRow[]>((r) => { resolve = r; });
    const timer = setTimeout(() => this._finishList(), timeoutMs);
    this._listPending = { rows: [], resolve, promise, timer };
    this.sendRaw('LIST');
    return promise;
  }

  private _finishList() {
    const pending = this._listPending;
    if (!pending) return;
    this._listPending = null;
    clearTimeout(pending.timer);
    pending.resolve(pending.rows);
  }

  /**
   * True when the server ACKed `onyx/session-sync`. When active, the server
   * drives session reclaim (auto JOIN + NAMES/topic + CHATHISTORY replay) on
   * (re)connect, so the client must suppress its own blind autojoin storm.
   */
  get sessionSyncActive(): boolean {
    return this.negotiatedCaps.has('onyx/session-sync');
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private _onOpen() {
    this.reconnectDelay = RECONNECT_BASE;

    // Begin CAP negotiation
    this.sendRaw('CAP', 'LS', '302');
    // Send NICK / USER early so server knows who we are
    this.sendRaw('NICK', this.opts.nick);
    this.sendRaw('USER',
      'webchat',
      '0',
      '*',
      this.opts.realname ?? `${this.opts.nick} (webchat)`
    );

    this._schedulePing();
  }

  private _onMessage(ev: MessageEvent) {
    // Binary frames carry browser media datagrams, not IRC lines.
    if (ev.data instanceof ArrayBuffer) {
      this._dispatchBinary(new Uint8Array(ev.data));
      return;
    }
    // Some WebSocket shims and older WebKit builds still surface a Blob even
    // after binaryType='arraybuffer'. Convert it without ever treating bytes as
    // an IRC line; preserve the connection generation across the async read.
    if (typeof Blob !== 'undefined' && ev.data instanceof Blob) {
      const source = this.ws;
      void ev.data.arrayBuffer()
        .then((buffer) => {
          if (this.ws === source) this._dispatchBinary(new Uint8Array(buffer));
        })
        .catch(() => { /* malformed/closed binary message is one dropped media datagram */ });
      return;
    }
    const data = typeof ev.data === 'string' ? ev.data : '';
    if (!data) return;

    // Onyx Server follows the IRCv3 WebSocket sub-protocol: each frame carries a
    // complete IRC message and the trailing CRLF is OPTIONAL — Onyx Server omits it
    // entirely (e.g. ":eshmaki.me CAP * LS :..." with no newline). The browser
    // reassembles continuation frames, so every onmessage delivers whole
    // message(s), never a partial line. We split on optional CR/LF and process
    // every non-empty segment.
    //
    // We must NOT retain a trailing remainder across frames: the previous
    // `split('\n')` + `buffer = lines.pop()` stashed the CRLF-less final line
    // forever, so CAP LS was never handled and registration hung — surfacing
    // as a "WebSocket error" that made the client appear unable to connect.
    // A single frame may still legitimately batch several CRLF-separated lines.
    this._buffer += data;
    const lines = this._buffer.split(/\r?\n/);
    this._buffer = '';

    for (const line of lines) {
      if (!line) continue;
      this.opts.onRaw?.(line, 'in');
      try {
        const msg = parseIRCMessage(line);
        this._handleMessage(msg);
      } catch (e) {
        // A malformed line must not abort processing of the rest of the frame.
        console.warn('[onyx] failed to handle IRC line:', line, e);
      }
    }
  }

  private _dispatchBinary(bytes: Uint8Array): void {
    if (!bytes.byteLength) return;
    this.opts.onBinary?.(bytes);
    for (const handler of this.binaryHandlers) {
      try { handler(bytes); } catch { /* a subscriber must not break the socket */ }
    }
  }

  private _onClose(ev: CloseEvent) {
    this._clearPingTimers();
    const reason = ev.reason || `code ${ev.code}`;
    console.warn('[onyx] ws closed — code:', ev.code, 'reason:', ev.reason || '(none)', 'wasClean:', ev.wasClean);
    this.opts.onDisconnected?.(reason);
    // Reconnect is owned exclusively by the store (bounded attempts, gated on
    // autoReconnect, with the UI countdown). The client must NOT also schedule
    // its own reconnect — doing both spawned duplicate parallel connections,
    // which is what produced ghost sessions and the "nick_" fallback pile-up.
  }

  private _onError(ev: Event) {
    console.error('[onyx] ws error:', ev);
    this.opts.onError?.('WebSocket error');
  }

  private _handleMessage(msg: IRCMessage) {
    // Internal protocol handling before passing to store handler
    switch (msg.command) {
      case 'PING':
        this.sendRaw('PONG', msg.params[0] ?? '');
        break;

      case 'CAP': {
        const subCmd = (msg.params[1] ?? '').toUpperCase();
        switch (subCmd) {
          case 'LS': {
            const isMultiline = msg.params[2] === '*';
            const capsStr = isMultiline ? msg.params[3] : msg.params[2];
            // Accumulate caps; track sasl mechanisms separately
            for (const token of (capsStr ?? '').split(' ').filter(Boolean)) {
              const eqIdx = token.indexOf('=');
              const capName = eqIdx === -1 ? token : token.slice(0, eqIdx);
              const capVal = eqIdx === -1 ? '' : token.slice(eqIdx + 1);
              this._capAvailable.push(capName);
              this.capValues.set(capName, capVal);
              if (capName === 'sasl' && capVal) {
                this._saslMechs = capVal.split(',');
              }
            }

            if (!isMultiline) {
              // All CAP LS data is in — now build our request
              const want = this._wantedCaps(this._capAvailable);

              if (want.length > 0) {
                this._requestCaps(want);
              } else {
                this._finishCap();
              }
            }
            break;
          }

          case 'ACK': {
            const caps = (msg.params[2] ?? '').split(' ').filter(Boolean);
            for (const c of caps) {
              this.negotiatedCaps.add(c);
              this._capReqPendingNames.delete(c);
            }
            if (caps.length > 0) this.onCapChange?.();
            if (this._capReqPending > 0) this._capReqPending--;
            if (caps.includes('sasl') && (
              this.opts.saslSessionToken || this.opts.password || this.opts.hasClientCert
            )) {
              const mech = selectSaslMechanism(this._saslMechs, {
                hasPassword: Boolean(this.opts.password),
                hasClientCert: Boolean(this.opts.hasClientCert),
                hasSessionToken: Boolean(this.opts.saslSessionToken),
              });
              if (mech) {
                this._startSasl(mech);
              } else {
                this.opts.onError?.(`No supported SASL mechanism offered (${this._saslMechs.join(', ') || 'none'})`);
                this.ws?.close(4003, 'Unsupported SASL mechanism');
                return;
              }
            } else {
              this._finishCapIfReady();
            }
            break;
          }

          case 'NAK':
            for (const c of (msg.params[2] ?? '').split(' ').filter(Boolean)) {
              this._capReqPendingNames.delete(c);
            }
            if (this._capReqPending > 0) this._capReqPending--;
            this._finishCapIfReady();
            break;

          case 'NEW': {
            // Server advertises new caps — request any we want
            const newCapsStr = msg.params[2] ?? '';
            const newAvailable: string[] = [];
            const newSaslMechs: string[] = [];
            for (const token of newCapsStr.split(' ').filter(Boolean)) {
              const eqIdx = token.indexOf('=');
              const capName = eqIdx === -1 ? token : token.slice(0, eqIdx);
              const capVal = eqIdx === -1 ? '' : token.slice(eqIdx + 1);
              newAvailable.push(capName);
              this.capValues.set(capName, capVal);
              if (capName === 'sasl' && capVal) newSaslMechs.push(...capVal.split(','));
            }
            this._capAvailable.push(...newAvailable);
            if (newAvailable.length > 0) this.onCapChange?.();
            if (newSaslMechs.length) this._saslMechs = newSaslMechs;
            const wantNew = this._wantedCaps(newAvailable);
            if (wantNew.length > 0) this._requestCaps(wantNew);
            break;
          }

          case 'DEL': {
            const delCaps = (msg.params[2] ?? '').split(' ').filter(Boolean);
            for (const c of delCaps) {
              this.negotiatedCaps.delete(c);
              this.capValues.delete(c);
            }
            if (delCaps.length > 0) this.onCapChange?.();
            break;
          }
        }
        break;
      }

      case 'AUTHENTICATE': {
        const param = msg.params[0] ?? '';
        if (this._saslMech === 'SESSION-TOKEN') {
          if (param === '+' && this.opts.saslSessionToken) {
            this.sendRaw('AUTHENTICATE', btoa(`${this._authcid}\0${this.opts.saslSessionToken}`));
          }
        } else if (this._saslMech === 'PLAIN') {
          if (param === '+') {
            // Use the stable account identity, not a post-433 nick alias.
            const nick = this._authcid;
            const pass = this.opts.password ?? '';
            const plain = btoa(`\0${nick}\0${pass}`);
            this.sendRaw('AUTHENTICATE', plain);
          }
        } else if (this._saslMech === 'EXTERNAL') {
          if (param === '+') this.sendRaw('AUTHENTICATE', '+');
        } else if (this._saslMech === 'SCRAM-SHA-256') {
          if (this._scramServerSig !== null) {
            // We already sent the client proof — this is the server-final
            // message carrying `v=ServerSignature`. Verify it (mutual auth).
            this._verifyScramServerFinal(param);
          } else if (param === '+') {
            // Server ready — send client-first-message
            this._scramClientFirst();
          } else {
            // Server-first challenge — compute + send the client proof.
            this._scramClientFinal(param).catch(e => {
              this.opts.onError?.(`SCRAM error: ${e}`);
              this._saslPending = false;
              this._finishCap();
            });
          }
        }
        break;
      }

      // NOTE: 903/904/905 are reused by Onyx Server's IRCX layer post-registration
      // (903=ERR_BADLEVEL, 904=ERR_BADTAG, 905=ERR_BADPROPERTY). Only treat them
      // as the SASL result numerics while a SASL exchange is actually in flight
      // (pre-registration). Otherwise they must pass through to the store as
      // ordinary IRCX errors.
      case '903': // RPL_SASLSUCCESS (during SASL only)
        if (this._saslPending || this._saslMech) {
          if (this._saslTimer) { clearTimeout(this._saslTimer); this._saslTimer = null; }
          this._saslPending = false;
          this._loggedIn = true;
          this._saslMech = null;
          this._scramState = null;
          this._scramServerSig = null;
          // NOTE: SESSION RESUME / SESSION TOKEN are deliberately NOT sent here.
          // Onyx Server's SESSION command requires a registered connection (it checks
          // session.account() and lives in the post-registration command path),
          // so it is issued after 001 (see the '001' case below). Sending it
          // during CAP/SASL would be rejected as a pre-registration command.
          this._finishCapIfReady();
        }
        break;

      case '904': // ERR_SASLFAIL (during SASL only)
      case '905':
        if (this._saslPending || this._saslMech) {
          if (this._saslTimer) { clearTimeout(this._saslTimer); this._saslTimer = null; }
          const rejectedSessionToken = this._saslMech === 'SESSION-TOKEN';
          if (this._retryAfterSaslSessionTokenFailure(true)) break;
          this._saslPending = false;
          this._saslMech = null;
          this._scramState = null;
          this._scramServerSig = null;
          if (rejectedSessionToken) {
            this.opts.onError?.('Onyx Server session token was rejected; enter the account password to reconnect.');
            this.ws?.close(4003, 'SASL session token rejected');
            break;
          }
          this._finishCapIfReady();
        }
        break;

      case '433': // Nickname in use
      case '432': // Erroneous nickname
      case '437': // Nick/channel unavailable
        if (!this._registered && this._nickRetries < 4) {
          this._nickRetries++;
          const newNick = this.opts.nick + '_';
          this.opts.nick = newNick;
          this.sendRaw('NICK', newNick);
          this.opts.onNickChanged?.(newNick);
          return; // handled internally; don't forward to store
        }
        break;

      // ── LIST collection (see list()) ─────────────────────────────────────
      case '321': // RPL_LISTSTART — reset any partial rows
        if (this._listPending) this._listPending.rows = [];
        break;

      case '322': { // RPL_LIST: :server 322 me #channel <users> :<topic>
        const pending = this._listPending;
        if (pending) {
          const channel = msg.params[1] ?? '';
          const users = Number.parseInt(msg.params[2] ?? '0', 10);
          const topic = msg.params[3] ?? '';
          if (channel) {
            pending.rows.push({ channel, users: Number.isFinite(users) ? users : 0, topic });
          }
        }
        break;
      }

      case '323': // RPL_LISTEND — resolve the pending list()
        this._finishList();
        break;

      case '001':
        this._registered = true;
        // Send IRCX before notifying the store (which will trigger JOIN)
        this.sendRaw('IRCX');
        // Now that the connection is registered, the post-registration SESSION
        // command is valid. Reclaim a prior detached session if we hold a token,
        // then request a fresh token for this session (arrives as
        // NOTE SESSION TOKEN, plus NOTE SESSION MTOKEN on mesh deployments).
        // Both are no-ops server-side unless logged in.
        //
        // Prefer the mesh-sealed token for RESUME: a reconnect may land on a
        // different mesh node, where the local 16-byte token is meaningless but
        // the mesh token still reclaims/redirects (server.zig handleMeshReclaim).
        // Fall back to the local token when no mesh token is held.
        if (this._loggedIn) {
          const resumeToken = this.opts.meshToken || this.opts.sessionToken;
          if (resumeToken) {
            this.send(buildSessionResumeLine(resumeToken));
          }
          this.sendRaw('SESSION', 'TOKEN');
        }
        this.opts.onConnected?.(msg);
        break;

      case '005':
        this._parseISUPPORT(msg.params);
        break;

      case 'PONG':
        this._clearPongTimeout();
        this._schedulePing();
        break;

      case 'MARKREAD': {
        // IRCv3 draft/read-marker:
        //   :server MARKREAD <target> timestamp=<server-time>   (marker set)
        //   :server MARKREAD <target> *                          (no marker)
        // Surface the parsed marker; the store still receives the raw message
        // below via onMessage. A malformed timestamp is reported as null (no
        // marker) rather than trusted.
        const target = msg.params[0];
        if (target) {
          const raw = msg.params[1] ?? '';
          const ts = raw.startsWith('timestamp=') ? raw.slice('timestamp='.length) : '';
          this.opts.onReadMarker?.(target, MARKREAD_TS_RE.test(ts) ? ts : null);
        }
        break;
      }

      case 'ERROR':
        this.opts.onError?.(msg.params[0] ?? 'Server error');
        break;
    }

    // Always forward to store handler
    this.opts.onMessage(msg);

    // Fan out to auxiliary subscribers (feature hooks etc.)
    if (this.extraMessageHandlers.size > 0) {
      for (const h of this.extraMessageHandlers) {
        try { h(msg); } catch { /* keep other subscribers alive */ }
      }
    }
  }

  private _finishCap() {
    if (this._capNegotiating) {
      this._capNegotiating = false;
      this.sendRaw('CAP', 'END');
    }
  }

  private _finishCapIfReady() {
    if (this._capReqPending === 0 && !this._saslPending) {
      this._finishCap();
    }
  }

  private _startSasl(mechanism: SaslMechanism): void {
    if (this._saslTimer) clearTimeout(this._saslTimer);
    this._saslPending = true;
    this._saslMech = mechanism;
    this._scramState = null;
    this._scramServerSig = null;
    this.sendRaw('AUTHENTICATE', mechanism);
    this._saslTimer = setTimeout(() => {
      this._saslTimer = null;
      const sessionTokenAttempt = this._saslMech === 'SESSION-TOKEN';
      // A stalled token exchange may be a transient server problem, so retry
      // with the password for this connection without deleting the token.
      if (this._retryAfterSaslSessionTokenFailure(false)) return;
      this.opts.onError?.('SASL authentication timed out');
      this._saslPending = false;
      this._saslMech = null;
      if (sessionTokenAttempt) {
        this.ws?.close(4003, 'SASL session token timed out');
        return;
      }
      this._finishCap();
    }, 15_000);
  }

  private _retryAfterSaslSessionTokenFailure(clearStoredToken: boolean): boolean {
    if (this._saslMech !== 'SESSION-TOKEN') return false;
    const fallback = selectSaslMechanism(this._saslMechs, {
      hasPassword: Boolean(this.opts.password),
      hasClientCert: Boolean(this.opts.hasClientCert),
      hasSessionToken: false,
    });
    if (clearStoredToken) {
      this.opts.saslSessionToken = undefined;
      try { this.opts.onSaslSessionTokenRejected?.(fallback !== null); } catch { /* storage callback */ }
    }
    if (!fallback) return false;
    this._startSasl(fallback);
    return true;
  }

  private _requestCaps(caps: string[]) {
    const uniqueCaps = [...new Set(caps)]
      .filter(c => !this.negotiatedCaps.has(c))
      .filter(c => !this._capReqPendingNames.has(c));
    if (uniqueCaps.length === 0) return;

    const chunks: string[][] = [];
    let current: string[] = [];
    let currentLen = 0;

    for (const cap of uniqueCaps) {
      const nextLen = currentLen + (current.length > 0 ? 1 : 0) + cap.length;
      if (current.length > 0 && nextLen > 380) {
        chunks.push(current);
        current = [];
        currentLen = 0;
      }
      current.push(cap);
      currentLen += (currentLen > 0 ? 1 : 0) + cap.length;
    }
    if (current.length > 0) chunks.push(current);

    this._capReqPending += chunks.length;
    for (const cap of uniqueCaps) this._capReqPendingNames.add(cap);
    for (const chunk of chunks) {
      this.sendRaw('CAP', 'REQ', chunk.join(' '));
    }
  }

  private _wantedCaps(caps: string[]) {
    return wantedCaps(caps, {
      hasSaslCredentials: Boolean(this.opts.saslSessionToken || this.opts.password || this.opts.hasClientCert),
    });
  }

  private _scramClientFirst() {
    const hash = 'SHA-256';
    const bits = 256;
    const arr = new Uint8Array(18);
    crypto.getRandomValues(arr);
    const nonce = btoa(String.fromCharCode(...arr)).replace(/[+/=]/g, c =>
      c === '+' ? '-' : c === '/' ? '_' : ''
    );
    const clientFirstMsgBare = `n=${this._authcid},r=${nonce}`;
    this._scramState = { clientFirstMsgBare, nonce, hash, bits };
    const msg = `n,,${clientFirstMsgBare}`;
    this.sendRaw('AUTHENTICATE', btoa(msg));
  }

  private async _scramClientFinal(challengeB64: string) {
    const state = this._scramState;
    if (!state) return;

    let serverFirst: string;
    try {
      serverFirst = atob(challengeB64);
    } catch {
      this.opts.onError?.('SCRAM: invalid challenge encoding');
      return;
    }

    // Parse server-first-message
    const parts: Record<string, string> = {};
    for (const p of serverFirst.split(',')) {
      parts[p[0]!] = p.slice(2);
    }
    const serverNonce = parts['r'] ?? '';
    const saltB64 = parts['s'] ?? '';
    const iterations = parseInt(parts['i'] ?? '4096', 10);

    if (!serverNonce.startsWith(state.nonce)) {
      this.opts.onError?.('SCRAM: server nonce mismatch');
      return;
    }

    const enc = new TextEncoder();
    const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));

    // SaltedPassword = PBKDF2(password, salt, iterations, selected SCRAM hash)
    const rawKey = await crypto.subtle.importKey(
      'raw', enc.encode(this.opts.password ?? ''),
      'PBKDF2', false, ['deriveBits']
    );
    const saltedBits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: state.hash, salt, iterations },
      rawKey, state.bits
    );
    const saltedPass = new Uint8Array(saltedBits);

    const hmac = async (keyData: Uint8Array, data: Uint8Array) => {
      const k = await crypto.subtle.importKey(
        'raw', keyData.buffer as ArrayBuffer, { name: 'HMAC', hash: state.hash }, false, ['sign']
      );
      return new Uint8Array(await crypto.subtle.sign('HMAC', k, data.buffer as ArrayBuffer));
    };

    const clientKey = await hmac(saltedPass, enc.encode('Client Key'));
    const storedKeyBuf = await crypto.subtle.digest(state.hash, clientKey);
    const storedKey = new Uint8Array(storedKeyBuf);

    // c=biws is base64("n,,") — channel binding not supported
    const clientFinalWithoutProof = `c=biws,r=${serverNonce}`;
    const authMessage = `${state.clientFirstMsgBare},${serverFirst},${clientFinalWithoutProof}`;

    const clientSig = await hmac(storedKey, enc.encode(authMessage));
    const clientProof = clientKey.map((b, i) => b ^ clientSig[i]!);

    // Precompute the ServerSignature we expect in the server-final `v=`:
    //   ServerKey       = HMAC(SaltedPassword, "Server Key")
    //   ServerSignature = HMAC(ServerKey, AuthMessage)
    // Storing it now (before nulling _scramState) lets the next AUTHENTICATE be
    // verified for mutual auth — the whole point of SCRAM.
    const serverKey = await hmac(saltedPass, enc.encode('Server Key'));
    const serverSig = await hmac(serverKey, enc.encode(authMessage));
    this._scramServerSig = btoa(String.fromCharCode(...serverSig));

    const proofB64 = btoa(String.fromCharCode(...clientProof));
    const clientFinal = `${clientFinalWithoutProof},p=${proofB64}`;
    this.sendRaw('AUTHENTICATE', btoa(clientFinal));
    this._scramState = null;
  }

  /**
   * Verify the server-final `AUTHENTICATE <base64(v=ServerSignature)>` against
   * the ServerSignature we precomputed at client-final time. On match we send
   * the trailing `AUTHENTICATE +` and let 903 complete login; on mismatch the
   * server does not hold the stored key (an impostor) — abort SASL and drop the
   * connection rather than trust the TLS endpoint alone.
   */
  private _verifyScramServerFinal(param: string) {
    const expected = this._scramServerSig;
    this._scramServerSig = null;
    if (expected === null) return;

    let serverFinal: string;
    try {
      serverFinal = atob(param);
    } catch {
      this._abortScram('SCRAM: invalid server-final encoding');
      return;
    }

    // server-final-message = "v=<base64 ServerSignature>" (may carry extras).
    let received: string | null = null;
    for (const seg of serverFinal.split(',')) {
      if (seg.startsWith('v=')) { received = seg.slice(2); break; }
      if (seg.startsWith('e=')) { // server signalled an error
        this._abortScram(`SCRAM: server error: ${seg.slice(2)}`);
        return;
      }
    }
    if (received === null || !constantTimeEqual(received, expected)) {
      this._abortScram('SCRAM: server signature mismatch');
      return;
    }

    // Mutual auth confirmed — acknowledge and await 903.
    this.sendRaw('AUTHENTICATE', '+');
  }

  /** Tear down an in-flight SCRAM exchange after a fatal verification failure. */
  private _abortScram(reason: string) {
    this.opts.onError?.(reason);
    if (this._saslTimer) { clearTimeout(this._saslTimer); this._saslTimer = null; }
    this._saslPending = false;
    this._saslMech = null;
    this._scramState = null;
    this._scramServerSig = null;
    // A failed mutual auth means the peer may be impersonating the server;
    // refuse the connection. The store owns the (bounded) reconnect decision.
    try { this.ws?.close(4003, 'SCRAM mutual authentication failed'); } catch { /* closing */ }
  }

  private _parseISUPPORT(params: string[]) {
    // params[0] = ournick, params[last] = "are supported by this server" — skip both.
    for (const token of params.slice(1, -1)) {
      const eqIdx = token.indexOf('=');
      const key = eqIdx === -1 ? token : token.slice(0, eqIdx);
      const val = eqIdx === -1 ? '' : token.slice(eqIdx + 1);

      switch (key) {
        case 'PREFIX': {
          const { modeToPrefix, prefixToMode } = parsePREFIX(val);
          this.modeToPrefix = modeToPrefix;
          this.prefixToMode = prefixToMode;
          this.isupport.PREFIX = modeToPrefix;
          this.isupport.PREFIX_MODES = prefixToMode;
          break;
        }
        case 'NETWORK':
          this.isupport.NETWORK = val;
          break;
        case 'CHANTYPES':
          this.isupport.CHANTYPES = val;
          break;
        case 'CASEMAPPING':
          this.isupport.CASEMAPPING = val;
          break;
        case 'NICKLEN':
          this.isupport.NICKLEN = parseInt(val, 10);
          break;
        case 'TOPICLEN':
          this.isupport.TOPICLEN = parseInt(val, 10);
          break;
        case 'CHANLIMIT':
          this.isupport.CHANLIMITS = parseCHANLIMIT(val);
          this.isupport.MAXCHANNELS = Object.values(this.isupport.CHANLIMITS)[0] ?? this.isupport.MAXCHANNELS;
          break;
        case 'MAXCHANNELS':
          this.isupport.MAXCHANNELS = parseInt(val, 10);
          break;
        case 'MODES':
          this.isupport.MODES = parseInt(val, 10);
          break;
        case 'CHANMODES':
          this.isupport.CHANMODES = val.split(',');
          break;
        case 'IRCX':
          this.isupport.IRCX = true;
          break;
        case 'SILENCE':
          this.isupport.SILENCE = parseInt(val, 10) || 20;
          break;
        case 'VAPID':
          this.isupport.VAPID = val;
          break;
      }
    }
  }

  // ── Ping keepalive ──────────────────────────────────────────────────────

  private _schedulePing() {
    this._clearPingTimers();
    this.pingTimer = setTimeout(() => {
      this.sendRaw('PING', 'keepalive');
      this.pongTimeout = setTimeout(() => {
        this.ws?.close(4001, 'Ping timeout');
      }, 15_000);
    }, 25_000);
  }

  private _clearPingTimers() {
    if (this.pingTimer) { clearTimeout(this.pingTimer); this.pingTimer = null; }
    this._clearPongTimeout();
  }

  private _clearPongTimeout() {
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
  }

  // ── Reconnect ──────────────────────────────────────────────────────────
  // Reconnect scheduling lives in the store (single owner). See _onClose.

  private _clearTimers() {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this._saslTimer) { clearTimeout(this._saslTimer); this._saslTimer = null; }
    this._finishList(); // never leave a list() caller hanging
    this._clearPingTimers();
  }
}
