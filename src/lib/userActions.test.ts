import { describe, expect, it } from 'vitest';

import {
  MAX_USER_ACTION_COMMAND_LENGTH,
  SAFE_COMMANDS,
  expandSafeCommand,
  isSafeCommandId,
} from './userActions';

describe('safe user command actions', () => {
  it('contains only a fixed allowlist and no destructive/raw execution entry', () => {
    expect(SAFE_COMMANDS.map((command) => command.id)).toEqual([
      'join', 'query', 'whois', 'message', 'notice', 'me', 'away', 'nick', 'monitor-add', 'monitor-del',
    ]);
    expect(SAFE_COMMANDS.map((command) => command.id)).not.toEqual(expect.arrayContaining([
      'raw', 'quit', 'part', 'kick', 'ban', 'kill', 'exec',
    ]));
    expect(isSafeCommandId('join')).toBe(true);
    expect(isSafeCommandId('exec')).toBe(false);
  });

  it('normalizes channel names and expands the exact IRC command', () => {
    expect(expandSafeCommand('join', { channel: 'darkbear' }))
      .toEqual({ ok: true, command: '/join #darkbear' });
    expect(expandSafeCommand('message', { target: 'alice', message: 'hello there' }))
      .toEqual({ ok: true, command: '/msg alice hello there' });
    expect(expandSafeCommand('away', { message: '' }))
      .toEqual({ ok: true, command: '/away' });
  });

  it('removes line breaks from message text but rejects token injection', () => {
    expect(expandSafeCommand('message', { target: '#darkbear', message: 'hello\r\n/quit' }))
      .toEqual({ ok: true, command: '/msg #darkbear hello /quit' });
    expect(expandSafeCommand('join', { channel: '#safe\n/quit' }).ok).toBe(false);
    expect(expandSafeCommand('whois', { nick: 'alice bob' }).ok).toBe(false);
  });

  it('bounds expansion size before it reaches sendInput', () => {
    const expanded = expandSafeCommand('message', { target: 'alice', message: 'x'.repeat(10_000) });
    expect(expanded.ok).toBe(true);
    if (expanded.ok) expect(expanded.command.length).toBeLessThanOrEqual(MAX_USER_ACTION_COMMAND_LENGTH);
  });
});
