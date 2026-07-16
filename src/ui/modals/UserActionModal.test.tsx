import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@solidjs/testing-library';

import {
  activeUserAction,
  beginUserAction,
  clearUserActions,
  createUserAction,
  resetSettings,
  settings,
} from '@/state';
import * as connection from '@/state/connection';
import UserActionModal from './UserActionModal';

describe('UserActionModal', () => {
  beforeEach(() => {
    globalThis.localStorage?.clear();
    resetSettings();
    clearUserActions();
    vi.spyOn(connection, 'sendInput').mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    clearUserActions();
    vi.restoreAllMocks();
  });

  it('generates argument prompts, exact preview, and first-use confirmation', () => {
    const action = createUserAction('Message teammate', 'message')!;
    beginUserAction(action.id);
    const { getByLabelText, getByRole, getByText } = render(() => <UserActionModal />);
    const run = getByRole('button', { name: 'Confirm and run' });
    expect(run).toBeDisabled();
    expect(getByText(/First use: review the exact command/)).toBeInTheDocument();

    fireEvent.input(getByLabelText('Target'), { target: { value: 'alice' } });
    fireEvent.input(getByLabelText('Message'), { target: { value: 'hello there' } });

    expect(getByText('/msg alice hello there')).toBeInTheDocument();
    expect(run).toBeEnabled();
    fireEvent.click(run);

    expect(activeUserAction()).toBeNull();
    expect(settings.userActions[0]?.confirmed).toBe(true);
  });

  it('keeps invalid token arguments from becoming runnable', () => {
    const action = createUserAction('Whois', 'whois')!;
    beginUserAction(action.id);
    const { getByLabelText, getByRole, getByText } = render(() => <UserActionModal />);

    fireEvent.input(getByLabelText('Nick'), { target: { value: 'alice /quit' } });

    expect(getByText('/whois {nick}')).toBeInTheDocument();
    expect(getByRole('button', { name: 'Confirm and run' })).toBeDisabled();
  });

  it('keeps authored values and first-use confirmation open after relay rejection', () => {
    vi.mocked(connection.sendInput).mockReturnValueOnce(false);
    const action = createUserAction('Message teammate', 'message')!;
    beginUserAction(action.id);
    const { getByLabelText, getByRole } = render(() => <UserActionModal />);
    const target = getByLabelText('Target') as HTMLInputElement;
    const message = getByLabelText('Message') as HTMLTextAreaElement;
    fireEvent.input(target, { target: { value: 'alice' } });
    fireEvent.input(message, { target: { value: 'keep this' } });

    fireEvent.click(getByRole('button', { name: 'Confirm and run' }));

    expect(getByRole('alert')).toHaveTextContent('remains open for retry');
    expect(target).toHaveValue('alice');
    expect(message).toHaveValue('keep this');
    expect(activeUserAction()?.id).toBe(action.id);
    expect(settings.userActions[0]?.confirmed).toBe(false);
  });
});
