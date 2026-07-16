import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./connection', () => ({ sendInput: vi.fn() }));

import { sendInput } from './connection';
import {
  resetSettings,
  saveProfile,
  settings,
  updateRelay,
} from './settings';
import {
  activeUserAction,
  beginUserAction,
  clearUserActions,
  createUserAction,
  deleteUserAction,
  runUserAction,
  visibleUserActions,
} from './userActions';

describe('user command action state', () => {
  beforeEach(() => {
    globalThis.localStorage?.clear();
    resetSettings();
    clearUserActions();
    vi.clearAllMocks();
    vi.mocked(sendInput).mockReturnValue(true);
  });

  it('creates bounded allowlisted actions and deletes them', () => {
    const action = createUserAction('Join team', 'join');
    expect(action).toMatchObject({ name: 'Join team', commandId: 'join', scope: 'global', confirmed: false });
    expect(settings.userActions).toHaveLength(1);
    expect(createUserAction('Unsafe', 'exec' as never)).toBeNull();
    deleteUserAction(action!.id);
    expect(settings.userActions).toEqual([]);
  });

  it('shows profile-scoped actions only on a matching saved endpoint', () => {
    updateRelay({ host: 'one.example', port: 9001, tls: true });
    saveProfile('one');
    updateRelay({ host: 'two.example', port: 9001, tls: true });
    const scoped = createUserAction('One whois', 'whois', 'profile:one');
    const global = createUserAction('Global whois', 'whois');

    expect(visibleUserActions()).toEqual([global]);
    updateRelay({ host: 'one.example' });
    expect(visibleUserActions()).toEqual([scoped, global]);
  });

  it('opens, expands, runs, and records first-use confirmation', () => {
    const action = createUserAction('Message Alice', 'message')!;
    beginUserAction(action.id);
    expect(activeUserAction()?.id).toBe(action.id);

    expect(runUserAction(action.id, { target: 'alice', message: 'hello' }))
      .toEqual({ ok: true, command: '/msg alice hello' });
    expect(sendInput).toHaveBeenCalledWith('/msg alice hello');
    expect(settings.userActions[0]?.confirmed).toBe(true);
    expect(activeUserAction()).toBeNull();
  });

  it('does not run a scoped action after the active endpoint changes', () => {
    updateRelay({ host: 'one.example' });
    saveProfile('one');
    const action = createUserAction('Scoped join', 'join', 'profile:one')!;
    updateRelay({ host: 'two.example' });

    expect(runUserAction(action.id, { channel: '#darkbear' })).toEqual({
      ok: false,
      reason: 'This action is not available for the current profile.',
    });
    expect(sendInput).not.toHaveBeenCalled();
  });

  it('keeps a rejected action open and unconfirmed for retry', () => {
    const action = createUserAction('Message Alice', 'message')!;
    beginUserAction(action.id);
    vi.mocked(sendInput).mockReturnValueOnce(false);

    expect(runUserAction(action.id, { target: 'alice', message: 'keep this' })).toEqual({
      ok: false,
      reason: 'Relay is not connected. Your action remains open for retry.',
    });
    expect(settings.userActions[0]?.confirmed).toBe(false);
    expect(activeUserAction()?.id).toBe(action.id);
  });
});
