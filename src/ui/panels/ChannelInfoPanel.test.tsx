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
          localVars: { type: 'channel', channel: '#darkbear', server: 'onyx' },
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
  requestProps: vi.fn(() => true),
  requestAccess: vi.fn(() => true),
  setProp: vi.fn(() => true),
  addAccess: vi.fn(() => true),
  removeAccess: vi.fn(() => true),
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
    state.requestProps.mockReturnValue(true);
    state.requestAccess.mockReturnValue(true);
    state.setProp.mockReturnValue(true);
    state.addAccess.mockReturnValue(true);
    state.removeAccess.mockReturnValue(true);
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

  it('keeps an edited property visible when relay dispatch is rejected', () => {
    state.setProp.mockReturnValue(false);
    const { getAllByText, getByDisplayValue, getByText } = render(() => <ChannelInfoPanel open onClose={vi.fn()} />);

    fireEvent.click(getAllByText('Edit')[0]!);
    fireEvent.input(getByDisplayValue('Current topic'), { target: { value: 'Keep this topic' } });
    fireEvent.click(getByText('Save'));

    expect(state.setProp).toHaveBeenCalledWith('#darkbear', 'TOPIC', 'Keep this topic');
    expect(getByDisplayValue('Keep this topic')).toBeInTheDocument();
  });

  it('keeps a new access entry visible when relay dispatch is rejected', () => {
    state.addAccess.mockReturnValue(false);
    const { getByPlaceholderText, getByText } = render(() => <ChannelInfoPanel open onClose={vi.fn()} />);

    fireEvent.click(getByText('Access'));
    fireEvent.click(getByText('+ Add Entry'));
    const mask = getByPlaceholderText('nick!user@host or $a:account');
    const reason = getByPlaceholderText('Reason (optional)');
    fireEvent.input(mask, { target: { value: 'alice!*@example.test' } });
    fireEvent.input(reason, { target: { value: 'keep this reason' } });
    fireEvent.click(getByText('Add'));

    expect(state.addAccess).toHaveBeenCalledWith(
      '#darkbear', 'HOST', 'alice!*@example.test', 'keep this reason',
    );
    expect(mask).toHaveValue('alice!*@example.test');
    expect(reason).toHaveValue('keep this reason');
  });

  it('refreshes properties after an edited value is saved', async () => {
    const { getAllByText, getByDisplayValue, getByText } = render(() => <ChannelInfoPanel open onClose={vi.fn()} />);
    state.requestProps.mockClear();

    fireEvent.click(getAllByText('Edit')[0]!);
    fireEvent.input(getByDisplayValue('Current topic'), { target: { value: 'Updated topic' } });
    fireEvent.click(getByText('Save'));

    await vi.advanceTimersByTimeAsync(500);

    expect(state.requestProps).toHaveBeenCalledTimes(1);
    expect(state.requestProps).toHaveBeenCalledWith('#darkbear');
  });

  it('cancels delayed property refresh when the panel unmounts', async () => {
    const { getAllByText, getByDisplayValue, getByText, unmount } = render(() => <ChannelInfoPanel open onClose={vi.fn()} />);
    state.requestProps.mockClear();

    fireEvent.click(getAllByText('Edit')[0]!);
    fireEvent.input(getByDisplayValue('Current topic'), { target: { value: 'Updated topic' } });
    fireEvent.click(getByText('Save'));
    unmount();
    await vi.advanceTimersByTimeAsync(500);

    expect(state.requestProps).not.toHaveBeenCalled();
  });
});
