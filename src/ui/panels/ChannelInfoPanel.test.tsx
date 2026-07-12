// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@solidjs/testing-library';

const state = vi.hoisted(() => ({
  buffersState: {
    buffers: {
      chan: {
        buffer: {
          id: 'chan',
          localVars: { type: 'channel', channel: '#darkbear', server: 'orochi' },
          shortName: '#darkbear',
        },
        modes: ['n', 't', 'm'],
      },
    },
  },
  ircxState: {
    channelInfoTarget: '#darkbear' as string | null,
    channelProps: {
      '#darkbear': {
        TOPIC: 'Current topic',
        SUBJECT: 'Panel coverage',
        LANGUAGE: 'en',
        MEMBERCOUNT: '42',
      },
    },
    accessLists: {
      '#darkbear': [
        {
          channel: '#darkbear',
          level: 'HOST',
          mask: 'alice!*@example.test',
          setter: 'root',
          duration: 3600,
          reason: 'trusted',
        },
      ],
    },
  },
  requestProps: vi.fn(),
  requestAccess: vi.fn(),
  setProp: vi.fn(),
  addAccess: vi.fn(),
  removeAccess: vi.fn(),
}));

vi.mock('@/state', () => state);

import ChannelInfoPanel from './ChannelInfoPanel';

describe('ChannelInfoPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    state.ircxState.channelInfoTarget = '#darkbear';
    state.ircxState.channelProps = {
      '#darkbear': {
        TOPIC: 'Current topic',
        SUBJECT: 'Panel coverage',
        LANGUAGE: 'en',
        MEMBERCOUNT: '42',
      },
    };
    state.ircxState.accessLists = {
      '#darkbear': [
        {
          channel: '#darkbear',
          level: 'HOST',
          mask: 'alice!*@example.test',
          setter: 'root',
          duration: 3600,
          reason: 'trusted',
        },
      ],
    };
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('renders channel properties, modes, and access entries', () => {
    const { getByText } = render(() => <ChannelInfoPanel open onClose={vi.fn()} />);

    expect(state.requestProps).toHaveBeenCalledWith('#darkbear');
    expect(state.requestAccess).toHaveBeenCalledWith('#darkbear');
    expect(getByText('#darkbear')).toBeInTheDocument();
    expect(getByText('Current topic')).toBeInTheDocument();
    expect(getByText('Panel coverage')).toBeInTheDocument();
    expect(getByText('42')).toBeInTheDocument();

    fireEvent.click(getByText('Modes'));
    expect(getByText('+mnt')).toBeInTheDocument();
    expect(getByText('Moderated')).toBeInTheDocument();
    expect(getByText('No external messages')).toBeInTheDocument();
    expect(getByText('Ops set topic')).toBeInTheDocument();

    fireEvent.click(getByText('Access'));
    expect(getByText('alice!*@example.test')).toBeInTheDocument();
    expect(getByText('trusted')).toBeInTheDocument();
    expect(getByText('by root')).toBeInTheDocument();
    expect(getByText('1h')).toBeInTheDocument();
  });

  it('dispatches an edited channel property value', () => {
    const { getAllByText, getByDisplayValue, getByText } = render(() => <ChannelInfoPanel open onClose={vi.fn()} />);

    fireEvent.click(getAllByText('Edit')[0]!);
    fireEvent.input(getByDisplayValue('Current topic'), { target: { value: 'Updated topic' } });
    fireEvent.click(getByText('Save'));

    expect(state.setProp).toHaveBeenCalledWith('#darkbear', 'TOPIC', 'Updated topic');
  });
});
