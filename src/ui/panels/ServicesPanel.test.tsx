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
          localVars: { type: 'server', server: 'orochi', network: 'orochi' },
        },
      },
      chan: {
        buffer: {
          id: 'chan',
          localVars: { type: 'channel', channel: '#darkbear', server: 'orochi' },
        },
      },
    },
  },
  ircxState: {
    servicesPanel: 'nick' as 'nick' | 'chan' | 'memo' | null,
  },
  sendTo: vi.fn(),
}));

vi.mock('@/state', () => state);

import ServicesPanel from './ServicesPanel';

describe('ServicesPanel', () => {
  beforeEach(() => {
    state.buffersState.activeBuffer = 'chan';
    state.ircxState.servicesPanel = 'nick';
  });

  afterEach(() => {
    cleanup();
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
  });

  it('renders channel and memo tabs from visible controls', () => {
    const { getAllByPlaceholderText, getByPlaceholderText, getByText } = render(() => <ServicesPanel open onClose={vi.fn()} />);

    fireEvent.click(getByText('Channel'));
    expect(getByText('Register Channel')).toBeInTheDocument();
    expect(getAllByPlaceholderText('#channel')).toHaveLength(3);
    expect(getByText('Raw CHANNEL Command')).toBeInTheDocument();

    fireEvent.click(getByText('Memo'));
    expect(getByText('Send Memo')).toBeInTheDocument();
    expect(getByPlaceholderText('Recipient account')).toBeInTheDocument();
    expect(getByText('Inbox')).toBeInTheDocument();
  });
});
