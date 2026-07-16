// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@solidjs/testing-library';

const state = vi.hoisted(() => ({
  buffersState: {
    buffers: {
      '0x1': {
        buffer: {
          localVars: { type: 'channel', channel: '#root' },
          shortName: '#root',
        },
      },
    },
  },
  ircxState: {
    channelList: {
      status: 'ready' as 'idle' | 'loading' | 'ready',
      rows: [
        { channel: '#root', users: 5, topic: 'Main room' },
        { channel: '#quiet', users: 1, topic: 'Low traffic' },
      ],
      query: '',
      extended: false,
      updatedAt: 1,
    },
  },
  requestChannelList: vi.fn(),
  sendInput: vi.fn(),
}));

vi.mock('@/state', () => state);

import ChannelListModal from './ChannelListModal';

describe('ChannelListModal', () => {
  beforeEach(() => {
    cleanup();
    state.requestChannelList.mockClear();
    state.sendInput.mockClear();
    state.sendInput.mockReturnValue(true);
    state.ircxState.channelList.status = 'ready';
  });

  it('renders channel rows, joined state, and dispatches join/create commands', () => {
    const { getByText, getByPlaceholderText, getAllByText } = render(() => <ChannelListModal open onClose={vi.fn()} />);

    expect(getByText('#root')).toBeInTheDocument();
    expect(getByText('joined')).toBeInTheDocument();
    expect(getByText('Main room')).toBeInTheDocument();
    expect(getByText('5 users')).toBeInTheDocument();

    fireEvent.click(getByText('Join'));
    expect(state.sendInput).toHaveBeenCalledWith('/join #quiet');

    fireEvent.input(getByPlaceholderText('#new-channel'), { target: { value: 'newroom' } });
    fireEvent.click(getAllByText('Create')[1]!);
    expect(state.sendInput).toHaveBeenCalledWith('/quote CREATE #newroom');
    expect(state.sendInput).toHaveBeenCalledWith('/join #newroom');
  });

  it('filters rows locally and auto-requests when idle', () => {
    state.ircxState.channelList.status = 'idle';
    const { getByPlaceholderText, queryByText } = render(() => <ChannelListModal open onClose={vi.fn()} />);

    expect(state.requestChannelList).toHaveBeenCalledTimes(1);

    fireEvent.input(getByPlaceholderText('#chat or topic'), { target: { value: 'quiet' } });

    expect(queryByText('#quiet')).toBeInTheDocument();
    expect(queryByText('#root')).not.toBeInTheDocument();
  });

  it('keeps join/create retry state until each relay dispatch is accepted', () => {
    const onClose = vi.fn();
    state.sendInput
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const { getByText, getByPlaceholderText, getAllByText } = render(() => (
      <ChannelListModal open onClose={onClose} />
    ));

    fireEvent.click(getByText('Join'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.input(getByPlaceholderText('#new-channel'), { target: { value: 'retry-room' } });
    fireEvent.click(getAllByText('Create')[1]!);
    expect(state.sendInput).toHaveBeenNthCalledWith(2, '/quote CREATE #retry-room');
    expect(state.sendInput).toHaveBeenNthCalledWith(3, '/join #retry-room');
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(getAllByText('Create')[1]!);
    expect(state.sendInput.mock.calls.filter(([command]) => command === '/quote CREATE #retry-room')).toHaveLength(1);
    expect(state.sendInput).toHaveBeenLastCalledWith('/join #retry-room');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
