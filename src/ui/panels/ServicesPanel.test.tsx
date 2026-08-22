// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@solidjs/testing-library';

const state = vi.hoisted(() => ({
  buffersState: {
    activeBuffer: 'chan' as string | null,
    buffers: {
      server: {
        buffer: {
          id: 'server',
          localVars: { type: 'server', server: 'onyx', network: 'onyx' },
        },
      },
      chan: {
        buffer: {
          id: 'chan',
          localVars: { type: 'channel', channel: '#darkbear', server: 'onyx' },
        },
      },
    },
  },
  ircxState: {
    servicesPanel: 'nick' as 'nick' | 'chan' | 'memo' | null,
    serviceFeedback: [] as Array<{
      serverName: string;
      receivedAt: number;
      kind: 'success' | 'error' | 'warning' | 'info';
      command: string;
      code: string;
      message: string;
    }>,
  },
  sendTo: vi.fn(),
  clearServiceFeedback: vi.fn(),
  recordServiceFeedback: vi.fn(),
}));

vi.mock('@/state', () => state);

import ServicesPanel from './ServicesPanel';
import { applyLocalePreference } from '@/lib/i18n';

describe('ServicesPanel', () => {
  beforeEach(() => {
    applyLocalePreference('en');
    state.buffersState.activeBuffer = 'chan';
    state.ircxState.servicesPanel = 'nick';
    state.ircxState.serviceFeedback = [];
    state.sendTo.mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    applyLocalePreference('en');
    vi.clearAllMocks();
  });

  it('renders account service command controls and dispatches register through the server buffer', () => {
    const { getAllByPlaceholderText, getByPlaceholderText, getByRole, getByText } = render(() => (
      <ServicesPanel open onClose={vi.fn()} />
    ));

    expect(getByText('Services')).toBeInTheDocument();
    expect(getByRole('heading', { name: 'Register' })).toBeInTheDocument();
    expect(getByRole('heading', { name: 'Identify' })).toBeInTheDocument();
    expect(getByRole('heading', { name: 'Nick Tools' })).toBeInTheDocument();

    fireEvent.input(getByPlaceholderText('Account name'), { target: { value: 'darkbear' } });
    fireEvent.input(getByPlaceholderText('Email (blank = none)'), { target: { value: 'ops@example.test' } });
    fireEvent.input(getAllByPlaceholderText('Password')[0]!, { target: { value: 'correct horse' } });
    fireEvent.click(getByRole('button', { name: 'Register' }));

    expect(state.sendTo).toHaveBeenCalledWith('server', '/quote REGISTER darkbear ops@example.test correct horse');
    expect(getAllByPlaceholderText('Password')[0]).toHaveValue('');
    expect(getAllByPlaceholderText('Password')[0]).toHaveAttribute('autocomplete', 'new-password');
  });

  it('renders associated tabs and panels with roving LTR keyboard navigation', async () => {
    const { getAllByPlaceholderText, getByPlaceholderText, getByRole, getByText } = render(() => <ServicesPanel open onClose={vi.fn()} />);

    const account = getByRole('tab', { name: 'Account' });
    const channel = getByRole('tab', { name: 'Channel' });
    const memo = getByRole('tab', { name: 'Memo' });
    expect(getByRole('tablist', { name: 'Services' })).toBeInTheDocument();
    expect(account).toHaveAttribute('aria-selected', 'true');
    expect(account).toHaveAttribute('tabindex', '0');
    expect(channel).toHaveAttribute('tabindex', '-1');
    expect(getByRole('tabpanel')).toHaveAttribute('aria-labelledby', account.id);
    for (const control of [account, channel, memo]) {
      const controlledId = control.getAttribute('aria-controls');
      expect(controlledId).toBeTruthy();
      expect(document.getElementById(controlledId!)).toBeInTheDocument();
    }

    account.focus();
    fireEvent.keyDown(account, { key: 'ArrowRight' });
    await Promise.resolve();
    expect(channel).toHaveFocus();
    expect(channel).toHaveAttribute('aria-selected', 'true');
    expect(getByRole('tabpanel')).toHaveAttribute('aria-labelledby', channel.id);

    expect(getByText('Register Channel')).toBeInTheDocument();
    expect(getAllByPlaceholderText('#channel')).toHaveLength(3);
    expect(getByText('Raw CHANNEL Command')).toBeInTheDocument();

    fireEvent.keyDown(channel, { key: 'End' });
    await Promise.resolve();
    expect(memo).toHaveFocus();
    expect(getByText('Send Memo')).toBeInTheDocument();
    expect(getByPlaceholderText('Recipient account')).toBeInTheDocument();
    expect(getByText('Inbox')).toBeInTheDocument();

    fireEvent.keyDown(memo, { key: 'Home' });
    await Promise.resolve();
    expect(account).toHaveFocus();
    expect(account).toHaveAttribute('aria-selected', 'true');
  });

  it('maps horizontal arrow keys to the visual direction in RTL', async () => {
    applyLocalePreference('ar');
    const { getByRole } = render(() => <ServicesPanel open onClose={vi.fn()} />);
    const account = getByRole('tab', { name: 'الحساب' });
    const channel = getByRole('tab', { name: 'القناة' });

    account.focus();
    fireEvent.keyDown(account, { key: 'ArrowLeft' });
    await Promise.resolve();
    expect(channel).toHaveFocus();
    expect(channel).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(channel, { key: 'ArrowRight' });
    await Promise.resolve();
    expect(account).toHaveFocus();
    expect(account).toHaveAttribute('aria-selected', 'true');
  });

  it('shows server-scoped service feedback and clears that server only', () => {
    state.ircxState.serviceFeedback = [
      {
        serverName: 'other',
        receivedAt: 1,
        kind: 'info',
        command: 'CHANNEL',
        code: 'NOTICE',
        message: 'Wrong server',
      },
      {
        serverName: 'onyx',
        receivedAt: 2,
        kind: 'error',
        command: 'REGISTER',
        code: 'ACCOUNT_EXISTS',
        message: 'Account already exists',
      },
    ];

    const { getByRole, getByText, queryByText } = render(() => <ServicesPanel open onClose={vi.fn()} />);

    expect(getByRole('log', { name: 'Recent service replies' })).toBeInTheDocument();
    expect(getByText('Account already exists')).toBeInTheDocument();
    expect(queryByText('Wrong server')).not.toBeInTheDocument();

    fireEvent.click(getByRole('button', { name: 'Clear' }));
    expect(state.clearServiceFeedback).toHaveBeenCalledWith('onyx');
  });

  it('flattens memo line breaks before dispatch and clears only after routing', () => {
    const { getByPlaceholderText, getByRole, getByText } = render(() => <ServicesPanel open onClose={vi.fn()} />);
    fireEvent.click(getByText('Memo'));
    fireEvent.input(getByPlaceholderText('Recipient account'), { target: { value: 'alice' } });
    const message = getByPlaceholderText('Message...');
    fireEvent.input(message, { target: { value: 'first line\n/quote DROP alice\tsecond line' } });
    fireEvent.click(getByRole('button', { name: 'Send' }));

    expect(state.sendTo).toHaveBeenCalledWith(
      'server',
      '/quote TEGAMI SEND alice :first line /quote DROP alice second line',
    );
    expect(message).toHaveValue('');
  });

  it('rejects oversized commands without reflecting their contents', () => {
    const { getByPlaceholderText, getByRole, getByText } = render(() => <ServicesPanel open onClose={vi.fn()} />);
    fireEvent.click(getByText('Memo'));
    fireEvent.input(getByPlaceholderText('Recipient account'), { target: { value: 'alice' } });
    const secret = `sensitive-${'x'.repeat(2_100)}`;
    fireEvent.input(getByPlaceholderText('Message...'), { target: { value: secret } });
    fireEvent.click(getByRole('button', { name: 'Send' }));

    expect(state.sendTo).not.toHaveBeenCalled();
    expect(state.recordServiceFeedback).toHaveBeenCalledWith('onyx', {
      kind: 'error',
      command: 'TEGAMI',
      code: 'CLIENT_INVALID_INPUT',
      message: 'Service command exceeds 2,048 characters.',
    });
    expect(JSON.stringify(state.recordServiceFeedback.mock.calls)).not.toContain(secret);
    expect(getByPlaceholderText('Message...')).toHaveValue(secret);
  });

  it('keeps a credential in the form when no server route accepted it', () => {
    state.buffersState.activeBuffer = null;
    const { getAllByPlaceholderText, getByPlaceholderText, getByRole } = render(() => (
      <ServicesPanel open onClose={vi.fn()} />
    ));
    fireEvent.input(getByPlaceholderText('Account name'), { target: { value: 'darkbear' } });
    const password = getAllByPlaceholderText('Password')[0]!;
    fireEvent.input(password, { target: { value: 'keep-until-routed' } });
    fireEvent.click(getByRole('button', { name: 'Register' }));

    expect(state.sendTo).not.toHaveBeenCalled();
    expect(password).toHaveValue('keep-until-routed');
  });

  it('keeps credentials and reports a content-free error when the relay socket rejects dispatch', () => {
    state.sendTo.mockReturnValue(false);
    const { getAllByPlaceholderText, getByPlaceholderText, getByRole } = render(() => (
      <ServicesPanel open onClose={vi.fn()} />
    ));
    fireEvent.input(getByPlaceholderText('Account name'), { target: { value: 'darkbear' } });
    const password = getAllByPlaceholderText('Password')[0]!;
    fireEvent.input(password, { target: { value: 'do-not-reflect-this-secret' } });
    fireEvent.click(getByRole('button', { name: 'Register' }));

    expect(password).toHaveValue('do-not-reflect-this-secret');
    expect(state.recordServiceFeedback).toHaveBeenCalledWith('onyx', {
      kind: 'error',
      command: 'REGISTER',
      code: 'CLIENT_NOT_CONNECTED',
      message: 'Relay is not connected. Your input was kept for retry.',
    });
    expect(JSON.stringify(state.recordServiceFeedback.mock.calls)).not.toContain('do-not-reflect-this-secret');
  });

  it('retains action fields and confirmations across every rejected relay dispatch', () => {
    state.sendTo.mockReturnValue(false);
    const view = render(() => <ServicesPanel open onClose={vi.fn()} />);

    fireEvent.click(view.getByRole('button', { name: 'Recover' }));
    const recover = view.getByPlaceholderText('Nick to recover');
    fireEvent.input(recover, { target: { value: 'recover-me' } });
    fireEvent.click(view.getAllByRole('button', { name: 'Recover' }).at(-1)!);
    expect(recover).toHaveValue('recover-me');

    const fingerprint = view.getByPlaceholderText('Fingerprint to remove');
    fireEvent.input(fingerprint, { target: { value: 'AA:BB:CC' } });
    fireEvent.click(fingerprint.parentElement!.querySelector('button')!);
    expect(fingerprint).toHaveValue('AA:BB:CC');

    fireEvent.click(view.getByRole('button', { name: 'Disable' }));
    const disablePrompt = view.getByText('Disable two-factor authentication?');
    fireEvent.click(disablePrompt.parentElement!.querySelector('button')!);
    expect(disablePrompt).toBeInTheDocument();

    fireEvent.click(view.getByRole('tab', { name: 'Channel' }));
    const raw = view.getByPlaceholderText('SET MLOCK #chan +nt');
    fireEvent.input(raw, { target: { value: 'SET MLOCK #darkbear +nt' } });
    fireEvent.click(raw.parentElement!.querySelector('button')!);
    expect(raw).toHaveValue('SET MLOCK #darkbear +nt');

    fireEvent.click(view.getByRole('button', { name: 'Drop Channel' }));
    const drop = view.getByPlaceholderText('#channel to drop');
    fireEvent.input(drop, { target: { value: '#darkbear' } });
    const dropPrompt = view.getByText('Drop registration for #darkbear?');
    fireEvent.click(dropPrompt.parentElement!.querySelector('button')!);
    expect(drop).toHaveValue('#darkbear');
    expect(dropPrompt).toBeInTheDocument();

    fireEvent.click(view.getByRole('tab', { name: 'Memo' }));
    fireEvent.click(view.getByRole('button', { name: 'Clear All' }));
    const clearPrompt = view.getByText('Delete all memos in your inbox?');
    fireEvent.click(clearPrompt.parentElement!.querySelector('button')!);
    expect(clearPrompt).toBeInTheDocument();
  });

  it('renders the typed German and RTL Arabic service catalogs', () => {
    applyLocalePreference('de');
    const german = render(() => <ServicesPanel open onClose={vi.fn()} />);
    expect(german.getByRole('dialog', { name: 'Dienste' })).toBeInTheDocument();
    expect(german.getByRole('heading', { name: 'Kontoeinstellungen' })).toBeInTheDocument();
    expect(german.getByLabelText('Kontoeinstellung')).toBeInTheDocument();
    german.unmount();

    applyLocalePreference('ar');
    const arabic = render(() => <ServicesPanel open onClose={vi.fn()} />);
    expect(document.documentElement.dir).toBe('rtl');
    expect(arabic.getByRole('dialog', { name: 'الخدمات' })).toBeInTheDocument();
    fireEvent.click(arabic.getByRole('tab', { name: 'مذكرة' }));
    expect(arabic.getByLabelText('الرسالة...')).toBeInTheDocument();
    expect(arabic.getByRole('heading', { name: 'صندوق الوارد' })).toBeInTheDocument();
  });
});
