import { parseIRCMessage, parseStandardReply } from './parser';

export type OrochiServiceFeedbackKind = 'success' | 'error' | 'warning' | 'info';

export interface OrochiServiceFeedback {
  kind: OrochiServiceFeedbackKind;
  command: string;
  code: string;
  message: string;
}

const SERVICE_COMMANDS = new Set([
  'ACCOUNT',
  'ACCOUNTINFO',
  'ACCOUNTSET',
  'CERTADD',
  'CERTDEL',
  'CERTLIST',
  'CHANNEL',
  'DROP',
  'GHOST',
  'GROUP',
  'IDENTIFY',
  'LOGOUT',
  'MEMO',
  'RECOVER',
  'REGISTER',
  'RELEASE',
  'SASLINFO',
  'TEGAMI',
  'TOTP',
  'VERIFY',
  'VHOST',
]);

function feedbackKind(kind: 'FAIL' | 'WARN' | 'NOTE', code: string): OrochiServiceFeedbackKind {
  if (kind === 'FAIL') return 'error';
  if (kind === 'WARN') return 'warning';
  return /^(?:COMPLETE|OK|STORED|SUCCESS|UPDATED|VERIFIED)$/i.test(code) ? 'success' : 'info';
}

function parseStandardReplyText(text: string, tags: string[]): OrochiServiceFeedback | null {
  const taggedKind = tags.includes('irc_fail')
    ? 'FAIL'
    : tags.includes('irc_warn')
      ? 'WARN'
      : tags.includes('irc_note')
        ? 'NOTE'
        : null;
  const hasKind = /^(?:FAIL|WARN|NOTE)\s/i.test(text);
  if (!hasKind && !taggedKind) return null;
  const source = hasKind ? text : `${taggedKind} ${text}`;

  // Without the standard-replies capability Orochi falls back to a NOTICE in
  // the form `FAIL REGISTER ACCOUNT_EXISTS: Registration failed`. Normalise
  // that colon before handing the line to the ordinary IRC parser.
  const fallback = /^(FAIL|WARN|NOTE)\s+(\S+)\s+([A-Z\d_-]+):\s*(.*)$/i.exec(source);
  if (fallback?.[1] && fallback[2] && fallback[3]) {
    const command = fallback[2].toUpperCase();
    if (!SERVICE_COMMANDS.has(command)) return null;
    const kind = fallback[1].toUpperCase() as 'FAIL' | 'WARN' | 'NOTE';
    const code = fallback[3].toUpperCase();
    return {
      kind: feedbackKind(kind, code),
      command,
      code,
      message: fallback[4]?.trim() || code.replaceAll('_', ' ').toLowerCase(),
    };
  }

  const reply = parseStandardReply(parseIRCMessage(source));
  if (!reply || !SERVICE_COMMANDS.has(reply.command)) return null;
  const detail = reply.description || [...reply.context, reply.code].filter(Boolean).join(' ');
  return {
    kind: feedbackKind(reply.kind, reply.code),
    command: reply.command,
    code: reply.code,
    message: detail,
  };
}

function noticeKind(text: string): OrochiServiceFeedbackKind {
  if (/\b(?:could not|denied|failed|invalid|no such|not available|not enabled|unknown)\b|^Usage:/i.test(text)) {
    return 'warning';
  }
  if (/\b(?:active|applied|cleared|confirmed|disabled|dropped|identified|logged out|registered|stored|updated|verified)\b/i.test(text)) {
    return 'success';
  }
  return 'info';
}

function parseServiceNotice(text: string, tags: string[]): OrochiServiceFeedback | null {
  if (!tags.includes('irc_notice')) return null;

  let command = '';
  if (/^You are now identified as\b/i.test(text)) command = 'IDENTIFY';
  else if (/^You are now logged out\b/i.test(text)) command = 'LOGOUT';
  else if (/^Account\s+\S+\s+dropped\b/i.test(text)) command = 'DROP';
  else if (/^Account\s+\S+\s+updated\b/i.test(text)) command = 'ACCOUNTSET';
  else if (/^account=\S+\s+flags=/i.test(text)) command = 'ACCOUNTINFO';
  else if (/^Your host is now\b/i.test(text)) command = 'VHOST';
  else if (/^(?:A verification code was emailed|Email\s+\S+\s+recorded)\b/i.test(text)) command = 'REGISTER';
  else {
    const prefixed = /^(ACCOUNT|ACCOUNTINFO|ACCOUNTSET|CERTADD|CERTDEL|CERTLIST|CHANNEL|GHOST|GROUP|RECOVER|REGISTER|RELEASE|SASLINFO|TEGAMI|TOTP|VERIFY|VHOST)(?::|\s)/i.exec(text);
    const usage = /^Usage:\s+(ACCOUNT|ACCOUNTINFO|ACCOUNTSET|CERTADD|CERTDEL|CERTLIST|CHANNEL|GHOST|GROUP|RECOVER|REGISTER|RELEASE|SASLINFO|TEGAMI|TOTP|VERIFY|VHOST)\b/i.exec(text);
    command = (prefixed?.[1] ?? usage?.[1] ?? '').toUpperCase();
  }
  if (!command || !SERVICE_COMMANDS.has(command)) return null;

  return {
    kind: noticeKind(text),
    command,
    code: 'NOTICE',
    message: text,
  };
}

/**
 * Convert a rendered WeeChat server-buffer line into safe, typed services UI
 * feedback. Recognition is intentionally narrow: unrelated server notices and
 * `SESSIONTOKEN` credentials never enter the feedback store.
 */
export function parseOrochiServiceFeedback(message: string, tags: string[]): OrochiServiceFeedback | null {
  const text = message.trim();
  if (!text) return null;

  const standard = parseStandardReplyText(text, tags);
  if (standard) return standard;

  // REGISTER success is a command-shaped Orochi reply rather than NOTE.
  const registerSource = tags.includes('irc_register') && !/^REGISTER\s/i.test(text)
    ? `REGISTER ${text}`
    : text;
  if (/^REGISTER\s/i.test(registerSource)) {
    const parsed = parseIRCMessage(registerSource);
    const code = (parsed.params[0] ?? '').toUpperCase();
    if (code === 'SUCCESS' || code === 'VERIFICATION_REQUIRED') {
      return {
        kind: code === 'SUCCESS' ? 'success' : 'info',
        command: 'REGISTER',
        code,
        message: parsed.params.at(-1) || code.replaceAll('_', ' ').toLowerCase(),
      };
    }
  }

  return parseServiceNotice(text, tags);
}
