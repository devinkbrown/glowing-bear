export interface AlertPeerState {
  id: string;
  active: boolean;
  focused: boolean;
  lastSeen: number;
}

const CHANNEL_NAME = 'darkbear-alert-coordination-v1';
const PEER_TTL_MS = 15_000;
const HEARTBEAT_MS = 5_000;

/** Select exactly one live connected tab, preferring a focused tab. */
export function selectAlertOwner(
  peers: AlertPeerState[],
  now: number,
  ttlMs = PEER_TTL_MS,
): string | null {
  const live = peers.filter((peer) => (
    peer.active && now - peer.lastSeen >= 0 && now - peer.lastSeen <= ttlMs
  ));
  const focused = live.filter((peer) => peer.focused);
  const candidates = focused.length > 0 ? focused : live;
  let owner: string | null = null;
  for (const peer of candidates) {
    if (owner === null || peer.id < owner) owner = peer.id;
  }
  return owner;
}

type CoordinatorMessage =
  | { type: 'hello'; id: string }
  | { type: 'state'; id: string; active: boolean; focused: boolean }
  | { type: 'bye'; id: string };

function validPeerId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z\d-]{8,64}$/i.test(value);
}

function newTabId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `tab-${crypto.randomUUID()}`;
    }
  } catch {
    // A constrained WebView may expose crypto but reject randomUUID.
  }
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

class TabAlertCoordinator {
  private readonly id = newTabId();
  private readonly peers = new Map<string, AlertPeerState>();
  private channel: BroadcastChannel | null = null;
  private active = false;
  private focused = false;

  constructor() {
    if (typeof window === 'undefined' || typeof window.BroadcastChannel !== 'function') return;
    try {
      this.channel = new window.BroadcastChannel(CHANNEL_NAME);
    } catch {
      return;
    }
    this.focused = this.isFocused();
    this.channel.onmessage = (event: MessageEvent<unknown>) => this.receive(event.data);
    window.addEventListener('focus', this.refreshFocus);
    window.addEventListener('blur', this.refreshFocus);
    window.addEventListener('pageshow', this.handlePageShow);
    window.addEventListener('pagehide', this.handlePageHide);
    document.addEventListener('visibilitychange', this.refreshFocus);
    window.setInterval(() => this.heartbeat(), HEARTBEAT_MS);
    this.post({ type: 'hello', id: this.id });
    this.announce();
  }

  setActive(active: boolean): void {
    this.active = active;
    this.focused = this.isFocused();
    this.announce();
  }

  claim(): boolean {
    if (!this.channel) return true;
    this.focused = this.isFocused();
    const now = Date.now();
    this.prune(now);
    const owner = selectAlertOwner([
      ...this.peers.values(),
      { id: this.id, active: this.active, focused: this.focused, lastSeen: now },
    ], now);
    return owner === this.id;
  }

  private readonly refreshFocus = (): void => {
    const focused = this.isFocused();
    if (focused === this.focused) return;
    this.focused = focused;
    this.announce();
  };

  private readonly handlePageShow = (): void => {
    this.focused = this.isFocused();
    this.post({ type: 'hello', id: this.id });
    this.announce();
  };

  private readonly handlePageHide = (): void => {
    this.post({ type: 'bye', id: this.id });
  };

  private isFocused(): boolean {
    return document.visibilityState === 'visible' && document.hasFocus();
  }

  private announce(): void {
    this.post({ type: 'state', id: this.id, active: this.active, focused: this.focused });
  }

  private heartbeat(): void {
    if (!this.channel) return;
    this.focused = this.isFocused();
    this.prune(Date.now());
    this.announce();
  }

  private prune(now: number): void {
    for (const [id, peer] of this.peers) {
      if (now - peer.lastSeen > PEER_TTL_MS) this.peers.delete(id);
    }
  }

  private receive(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    const message = value as Partial<CoordinatorMessage>;
    if (!validPeerId(message.id) || message.id === this.id) return;
    if (message.type === 'bye') {
      this.peers.delete(message.id);
      return;
    }
    if (message.type === 'hello') {
      this.announce();
      return;
    }
    if (message.type !== 'state' || typeof message.active !== 'boolean' || typeof message.focused !== 'boolean') return;
    this.peers.set(message.id, {
      id: message.id,
      active: message.active,
      focused: message.focused,
      lastSeen: Date.now(),
    });
  }

  private post(message: CoordinatorMessage): void {
    try {
      this.channel?.postMessage(message);
    } catch {
      // Cross-tab coordination is an enhancement; local alerts remain usable.
    }
  }
}

const coordinator = new TabAlertCoordinator();

/** Mark this tab eligible only while its relay connection is live. */
export function setAlertCoordinatorActive(active: boolean): void {
  coordinator.setActive(active);
}

/** True for the one connected tab that owns sound/notification side effects. */
export function claimAlertDelivery(): boolean {
  return coordinator.claim();
}
