// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';

const harness = vi.hoisted(() => ({
  close: vi.fn(),
  confirm: vi.fn(),
  refresh: vi.fn(() => Promise.resolve()),
  rerun: vi.fn(() => Promise.resolve()),
  echo: vi.fn(() => Promise.resolve()),
  select: vi.fn(),
  state: {
    preflight: {
      open: true,
      intent: { mode: 'room' as const, target: '#orbit', video: true },
      status: 'ready' as 'idle' | 'checking' | 'ready' | 'error',
      codec: 'ready' as 'idle' | 'checking' | 'ready' | 'error',
      microphonePermission: 'granted' as PermissionState | 'unsupported',
      cameraPermission: 'granted' as PermissionState | 'unsupported',
      microphones: [{ deviceId: 'mic-1', label: 'Studio microphone' }],
      cameras: [{ deviceId: 'camera-1', label: 'Front camera' }],
      speakers: [{ deviceId: 'speaker-1', label: 'Desk speakers' }],
      microphoneId: 'mic-1' as string | null,
      cameraId: 'camera-1' as string | null,
      speakerId: 'speaker-1' as string | null,
      audioLevel: 0.42,
      echo: 'idle' as 'idle' | 'recording' | 'playing' | 'error',
      error: null as string | null,
    },
  },
}));

vi.mock('@/state/media', () => ({
  closeMediaPreflight: harness.close,
  confirmMediaPreflight: harness.confirm,
  mediaPreflightPreviewStream: vi.fn(() => null),
  mediaState: harness.state,
  refreshMediaDevices: harness.refresh,
  runMediaEchoTest: harness.echo,
  runMediaPreflight: harness.rerun,
  selectMediaDevice: harness.select,
}));

import MediaPreflight from './MediaPreflight';

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(harness.state.preflight, {
    open: true,
    intent: { mode: 'room', target: '#orbit', video: true },
    status: 'ready',
    codec: 'ready',
    microphonePermission: 'granted',
    cameraPermission: 'granted',
    microphoneId: 'mic-1',
    cameraId: 'camera-1',
    speakerId: 'speaker-1',
    audioLevel: 0.42,
    echo: 'idle',
    error: null,
  });
});

afterEach(cleanup);

describe('MediaPreflight', () => {
  it('presents the full accessible device and readiness gate', () => {
    render(() => <MediaPreflight />);

    expect(screen.getByRole('dialog', { name: 'Media preflight' })).toBeInTheDocument();
    expect(screen.getByText('Check your signal for')).toHaveTextContent('#orbit');
    expect(screen.getByRole('status', { name: 'Media checks' })).toHaveTextContent('Encoder ready');
    expect(screen.getByLabelText('Live camera preview')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Microphone level' })).toHaveAttribute('aria-valuenow', '42');
    expect(screen.getByRole('combobox', { name: 'Microphone' })).toHaveValue('mic-1');
    expect(screen.getByRole('combobox', { name: 'Camera' })).toHaveValue('camera-1');
    expect(screen.getByRole('combobox', { name: 'Speaker' })).toHaveValue('speaker-1');
    expect(screen.getByRole('button', { name: 'Join video' })).toBeEnabled();
  });

  it('routes device, echo, rerun, confirm, and cancel actions', () => {
    render(() => <MediaPreflight />);

    fireEvent.change(screen.getByRole('combobox', { name: 'Microphone' }), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run echo test' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    fireEvent.click(screen.getByRole('button', { name: 'Join video' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(harness.select).toHaveBeenCalledWith('microphone', '');
    expect(harness.echo).toHaveBeenCalledOnce();
    expect(harness.rerun).toHaveBeenCalledOnce();
    expect(harness.confirm).toHaveBeenCalledOnce();
    expect(harness.close).toHaveBeenCalledOnce();
  });

  it('keeps confirmation blocked and explains a capture failure', () => {
    Object.assign(harness.state.preflight, {
      status: 'error',
      microphonePermission: 'denied',
      error: 'Microphone permission is blocked. Allow access in browser site settings, then check again.',
    });

    render(() => <MediaPreflight />);

    expect(screen.getByRole('alert')).toHaveTextContent('permission is blocked');
    expect(screen.getByText('Access blocked')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join video' })).toBeDisabled();
  });

  it('uses the audio-only layout and call-specific action copy', () => {
    Object.assign(harness.state.preflight, {
      intent: { mode: 'call', target: 'trev', video: false },
      cameraPermission: 'unsupported',
    });

    render(() => <MediaPreflight />);

    expect(screen.queryByRole('combobox', { name: 'Camera' })).toBeNull();
    expect(screen.queryByLabelText('Live camera preview')).toBeNull();
    expect(screen.getByText('Speak to test your microphone')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start voice call' })).toBeEnabled();
  });
});
