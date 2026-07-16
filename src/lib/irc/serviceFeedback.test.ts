import { describe, expect, it } from 'vitest';
import { parseOrochiServiceFeedback } from './serviceFeedback';

describe('parseOrochiServiceFeedback', () => {
  it('maps standard FAIL replies and capability fallback notices', () => {
    expect(parseOrochiServiceFeedback(
      'FAIL REGISTER ACCOUNT_EXISTS kain :Account already exists',
      ['irc_fail'],
    )).toEqual({
      kind: 'error',
      command: 'REGISTER',
      code: 'ACCOUNT_EXISTS',
      message: 'Account already exists',
    });
    expect(parseOrochiServiceFeedback(
      'FAIL CHANNEL ACCESS_DENIED: Founder access required',
      ['irc_notice'],
    )).toEqual({
      kind: 'error',
      command: 'CHANNEL',
      code: 'ACCESS_DENIED',
      message: 'Founder access required',
    });
  });

  it('maps tagged NOTE and WARN lines without duplicating the command kind', () => {
    expect(parseOrochiServiceFeedback('TOTP UPDATED :Two-factor state changed', ['irc_note'])).toEqual({
      kind: 'success',
      command: 'TOTP',
      code: 'UPDATED',
      message: 'Two-factor state changed',
    });
    expect(parseOrochiServiceFeedback('VHOST RETRY_LATER :Approval is pending', ['irc_warn'])).toEqual({
      kind: 'warning',
      command: 'VHOST',
      code: 'RETRY_LATER',
      message: 'Approval is pending',
    });
  });

  it('maps command-shaped registration success and known service notices', () => {
    expect(parseOrochiServiceFeedback('REGISTER SUCCESS kain :Account registered', ['irc_register'])).toEqual({
      kind: 'success',
      command: 'REGISTER',
      code: 'SUCCESS',
      message: 'Account registered',
    });
    expect(parseOrochiServiceFeedback('You are now identified as kain', ['irc_notice'])).toEqual({
      kind: 'success',
      command: 'IDENTIFY',
      code: 'NOTICE',
      message: 'You are now identified as kain',
    });
    expect(parseOrochiServiceFeedback('TOTP: two-factor authentication is disabled', ['irc_notice'])?.command).toBe('TOTP');
  });

  it('rejects unrelated notices, non-service replies, and SASL bearer credentials', () => {
    expect(parseOrochiServiceFeedback('End of MOTD', ['irc_notice'])).toBeNull();
    expect(parseOrochiServiceFeedback('FAIL PRIVMSG INVALID_UTF8 :Invalid body', ['irc_fail'])).toBeNull();
    expect(parseOrochiServiceFeedback(
      'SESSIONTOKEN kain sst_0123456789abcdef0123456789abcdef expires=1784217600',
      ['irc_notice'],
    )).toBeNull();
  });
});
