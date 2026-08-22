/**
 * First-party CAP REQ filter.
 *
 * Source of truth: onyx-server `docs/reference/client-interop-halloy.md` and
 * `docs/reference/protocol/caps.md`. CAP REQ is atomic — an unknown or
 * unavailable token NAKs the whole request. Only REQ tokens seen in CAP LS 302.
 *
 * DarkBear requests the Onyx web set (including vendor `onyx/*` and the
 * Halloy-missing server-only caps) when advertised. Skip STS (NAK risk unless
 * we implement it), STARTTLS/`tls`, Halloy-only soju/filehost/whoami tokens,
 * and caps we deliberately do not implement (`bot`, `no-implicit-names`,
 * `draft/file-upload`).
 */

export const ONYX_WEBSOCKET_PROTOCOLS = ['onyx.irc-media.v1', 'text.ircv3.net'] as const;

/** Tokens we never REQ, even when advertised. */
export const WANTED_CAP_SKIP = new Set([
  'tls',
  'sts',
  'no-implicit-names',
  'draft/no-implicit-names',
  'draft/file-upload',
  'bot',
  'soju.im/bouncer-networks',
  'soju.im/filehost',
  'draft/whoami',
]);

/**
 * First-party Onyx web set. Intersection with CAP LS is the REQ list.
 * Vendor caps and Halloy-missing server-only caps are included so DarkBear
 * owns them when the server advertises them.
 */
export const ONYX_WEB_CAPS = [
  'server-time',
  'message-tags',
  'echo-message',
  'sasl',
  'multi-prefix',
  'userhost-in-names',
  'away-notify',
  'setname',
  'extended-join',
  'invite-notify',
  'account-tag',
  'account-notify',
  'chghost',
  'batch',
  'labeled-response',
  'cap-notify',
  'standard-replies',
  'extended-monitor',
  'draft/chathistory',
  'draft/event-playback',
  'draft/search',
  'draft/message-redaction',
  'draft/message-editing',
  'draft/read-marker',
  'draft/typing',
  'draft/react',
  'draft/reply',
  'draft/channel-rename',
  'draft/account-registration',
  'draft/metadata-2',
  'draft/pre-away',
  'draft/channel-context',
  'draft/multiline',
  'draft/netsplit',
  'draft/netjoin',
  'account-extban',
  'utf8-only',
  'onyx/session-sync',
  'onyx/bouncer',
  'onyx/topics',
  'onyx/e2ee',
] as const;

export const ONYX_WEB_CAP_SET = new Set<string>(ONYX_WEB_CAPS);

export interface WantedCapsOptions {
  hasSaslCredentials: boolean;
}

/**
 * Filter advertised CAP names down to the first-party Onyx web set.
 */
export function wantedCaps(advertised: readonly string[], opts: WantedCapsOptions): string[] {
  return [...new Set(advertised)].filter((cap) => {
    if (WANTED_CAP_SKIP.has(cap)) return false;
    if (!ONYX_WEB_CAP_SET.has(cap)) return false;
    if (cap === 'sasl') return opts.hasSaslCredentials;
    return true;
  });
}
