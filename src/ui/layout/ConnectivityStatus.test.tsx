import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  online: true,
  connection: 'connected',
  attempt: 0,
  delay: 0,
  reconnect: vi.fn(),
}));

vi.mock('@/state', () => ({
  browserOnline: () => mocked.online,
  connectionState: () => mocked.connection,
  reconnect: mocked.reconnect,
  relayDiagnostics: () => ({ reconnectAttempt: mocked.attempt, reconnectDelayMs: mocked.delay }),
  ConnectionState: { RECONNECTING: 'reconnecting' },
}));

import ConnectivityStatus from './ConnectivityStatus';

afterEach(() => {
  cleanup();
  mocked.online = true;
  mocked.connection = 'connected';
  mocked.attempt = 0;
  mocked.delay = 0;
  mocked.reconnect.mockReset();
});

describe('ConnectivityStatus', () => {
  it('explains browser-offline state without offering a futile retry', () => {
    mocked.online = false;
    render(() => <ConnectivityStatus />);
    expect(screen.getByRole('status')).toHaveTextContent('Offline');
    expect(screen.getByRole('status')).toHaveTextContent('Network unavailable');
    expect(screen.queryByRole('button', { name: 'Retry now' })).not.toBeInTheDocument();
  });

  it('shows bounded relay reconnect detail and invokes the existing retry path', () => {
    mocked.connection = 'reconnecting';
    mocked.attempt = 3;
    mocked.delay = 2_100;
    render(() => <ConnectivityStatus />);
    expect(screen.getByRole('status')).toHaveTextContent('attempt 3');
    expect(screen.getByRole('status')).toHaveTextContent('Next attempt in 3s');
    fireEvent.click(screen.getByRole('button', { name: 'Retry now' }));
    expect(mocked.reconnect).toHaveBeenCalledOnce();
  });
});
