// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@solidjs/testing-library';

const PICTURE = 'https://profiles.example.test/alice.png';

const state = vi.hoisted(() => ({
  settings: { inlineImages: false },
  buffersState: {
    activeBuffer: 'channel' as string | null,
    buffers: {
      channel: {
        buffer: {
          id: 'channel',
          localVars: {
            type: 'channel',
            channel: '#darkbear',
            server: 'onyx.test',
            nick: 'tester',
          },
        },
      },
    },
  },
  ircxState: {
    userProfileTarget: 'alice' as string | null,
    userProfiles: {
      alice: { picture: 'https://profiles.example.test/alice.png' },
    } as Record<string, { picture?: string; bio?: string }>,
    accountMap: {} as Record<string, string>,
    botNicks: {} as Record<string, true>,
    monitorList: {} as Record<string, true>,
  },
  requestProps: vi.fn(() => true),
  setProp: vi.fn(() => true),
  openQuery: vi.fn(),
  sendInput: vi.fn(),
  sendWhisper: vi.fn(),
  monitorAdd: vi.fn(),
  monitorRemove: vi.fn(),
}));

vi.mock('@/state', () => state);

import UserProfileCard from './UserProfileCard';

describe('UserProfileCard remote picture privacy', () => {
  beforeEach(() => {
    state.settings.inlineImages = false;
    state.ircxState.userProfileTarget = 'alice';
    state.ircxState.userProfiles = { alice: { picture: PICTURE } };
    state.requestProps.mockReturnValue(true);
    state.setProp.mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('does not create a remote image surface while inline images are off', () => {
    const { container, getByRole, getByText } = render(() => (
      <UserProfileCard open onClose={vi.fn()} />
    ));

    expect(container.querySelector(`img[src="${PICTURE}"]`)).not.toBeInTheDocument();
    expect(getByText('AL')).toBeInTheDocument();
    // The inert profile field remains available as an explicit, safe navigation
    // link; it does not trigger an image request merely by opening the profile.
    expect(getByRole('link', { name: PICTURE })).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders an opted-in remote avatar without sending a referrer', () => {
    state.settings.inlineImages = true;

    const { getByRole } = render(() => (
      <UserProfileCard open onClose={vi.fn()} />
    ));
    const avatar = getByRole('img', { name: 'alice' });

    expect(avatar).toHaveAttribute('src', PICTURE);
    expect(avatar).toHaveAttribute('loading', 'lazy');
    expect(avatar).toHaveAttribute('referrerpolicy', 'no-referrer');
  });

  it('keeps a profile edit visible when relay dispatch is rejected', () => {
    state.ircxState.userProfileTarget = 'tester';
    state.ircxState.userProfiles = { tester: { bio: 'Original bio' } };
    state.setProp.mockReturnValue(false);
    const { getByDisplayValue, getByText } = render(() => (
      <UserProfileCard open onClose={vi.fn()} />
    ));

    fireEvent.click(getByText('Edit'));
    const editor = getByDisplayValue('Original bio');
    fireEvent.input(editor, { target: { value: 'Keep this bio' } });
    fireEvent.click(getByText('Save'));

    expect(state.setProp).toHaveBeenCalledWith('tester', 'BIO', 'Keep this bio');
    expect(getByDisplayValue('Keep this bio')).toBeInTheDocument();
  });
});
