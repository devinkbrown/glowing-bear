// ReactionBar render tests — reaction pills with counts/tooltips, click
// routing through the orochi bridge, and the empty-state gate.

import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import type { Reaction } from '@/types';
import ReactionBar from './ReactionBar';
import { sendReactionTag } from '@/state/bridge';

vi.mock('@/state/bridge', () => ({
  sendReactionTag: vi.fn(),
}));

const sendReactionTagMock = vi.mocked(sendReactionTag);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ReactionBar', () => {
  const reactions: Reaction[] = [
    { emoji: '\u{1F44D}', nicks: ['alice', 'bob'] },
    { emoji: '❤️', nicks: ['carol'] },
  ];

  it('renders hostile emoji text inertly', () => {
    const hostileEmoji = '</span><img src=x onerror=alert(1)>';
    const { container, getByText } = render(() => (
      <ReactionBar
        bufferPtr="0xb"
        msgid="mid-1"
        reactions={[{ emoji: hostileEmoji, nicks: ['mallory'] }]}
      />
    ));

    expect(getByText(hostileEmoji)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).not.toContain('<img');
    expect(container.innerHTML).toContain('&lt;img');
    expect(sendReactionTagMock).not.toHaveBeenCalled();
  });

  it('renders one pill per reaction with emoji and reactor count', () => {
    const { getByText, container } = render(() => (
      <ReactionBar bufferPtr="0xb" msgid="mid-1" reactions={reactions} />
    ));

    const pills = container.querySelectorAll('button');
    expect(pills.length).toBe(2);
    expect(getByText('\u{1F44D}')).toBeInTheDocument();
    expect(getByText('2')).toBeInTheDocument();
    expect(getByText('❤️')).toBeInTheDocument();
    expect(getByText('1')).toBeInTheDocument();
  });

  it('lists the reactor nicks as the pill tooltip', () => {
    const { container } = render(() => (
      <ReactionBar bufferPtr="0xb" msgid="mid-1" reactions={reactions} />
    ));

    const pills = container.querySelectorAll('button');
    expect(pills[0]).toHaveAttribute('title', 'alice, bob');
    expect(pills[1]).toHaveAttribute('title', 'carol');
  });

  it('uses the aggregated reactor list for the count and tooltip', () => {
    const { getByRole } = render(() => (
      <ReactionBar
        bufferPtr="0xb"
        msgid="mid-1"
        reactions={[{ emoji: '🔥', nicks: ['alice', 'bob', 'carol'] }]}
      />
    ));

    const pill = getByRole('button');
    expect(pill).toHaveTextContent('🔥3');
    expect(pill).toHaveAttribute('title', 'alice, bob, carol');
  });

  it('renders a current-user reaction as a toggleable pill', () => {
    const { getByRole } = render(() => (
      <ReactionBar
        bufferPtr="0xb"
        msgid="mid-active"
        reactions={[{ emoji: '✅', nicks: ['alice', 'me'] }]}
      />
    ));

    const pill = getByRole('button');
    expect(pill).toHaveAttribute('title', 'alice, me');
    fireEvent.click(pill);
    expect(sendReactionTagMock).toHaveBeenCalledTimes(1);
    expect(sendReactionTagMock).toHaveBeenCalledWith('0xb', 'mid-active', '✅');
  });

  it('sends the same reaction through the bridge when a pill is clicked', () => {
    const { container } = render(() => (
      <ReactionBar bufferPtr="0xb" msgid="mid-1" reactions={reactions} />
    ));

    const pills = container.querySelectorAll('button');
    fireEvent.click(pills[0]!);
    expect(sendReactionTagMock).toHaveBeenCalledTimes(1);
    expect(sendReactionTagMock).toHaveBeenCalledWith('0xb', 'mid-1', '\u{1F44D}');

    fireEvent.click(pills[1]!);
    expect(sendReactionTagMock).toHaveBeenLastCalledWith('0xb', 'mid-1', '❤️');
  });

  it('keeps pills keyboard-activatable through native button semantics', () => {
    const { getByRole } = render(() => (
      <ReactionBar
        bufferPtr="0xb"
        msgid="mid-1"
        reactions={[{ emoji: '🚀', nicks: ['alice'] }]}
      />
    ));

    const pill = getByRole('button') as HTMLButtonElement;
    pill.focus();
    pill.click();

    expect(document.activeElement).toBe(pill);
    expect(sendReactionTagMock).toHaveBeenCalledTimes(1);
    expect(sendReactionTagMock).toHaveBeenCalledWith('0xb', 'mid-1', '🚀');
  });

  it('renders nothing when there are no reactions', () => {
    const { container } = render(() => (
      <ReactionBar bufferPtr="0xb" msgid="mid-1" reactions={[]} />
    ));

    expect(container.innerHTML).toBe('');
    expect(container.querySelector('button')).toBeNull();
  });
});
