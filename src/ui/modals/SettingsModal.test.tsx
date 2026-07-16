import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import { resetSettings, settings } from '@/state';
import SettingsModal from './SettingsModal';

beforeEach(() => {
  globalThis.localStorage?.clear();
  resetSettings();
});

afterEach(() => {
  cleanup();
});

describe('SettingsModal', () => {
  it('renders the redesigned preferences shell with overview controls', () => {
    const { getAllByText, getByText } = render(() => <SettingsModal open onClose={vi.fn()} />);

    expect(getAllByText('Preferences').length).toBeGreaterThan(0);
    expect(getByText('Tune the relay console without leaving the buffer.')).toBeInTheDocument();
    expect(getAllByText('Theme').length).toBeGreaterThan(0);
    expect(getAllByText('Bridge').length).toBeGreaterThan(0);
  });

  it('switches tabs from the preferences rail', () => {
    const { getAllByText, getByText } = render(() => <SettingsModal open onClose={vi.fn()} />);

    fireEvent.click(getAllByText('Messages')[0]!);
    expect(getByText('Timestamps')).toBeInTheDocument();

    fireEvent.click(getAllByText('Connection')[0]!);
    expect(getByText('Relay')).toBeInTheDocument();
  });

  it('stores an explicit interface locale from Appearance', () => {
    const { getByLabelText } = render(() => <SettingsModal open onClose={vi.fn()} />);

    fireEvent.change(getByLabelText('Language'), { target: { value: 'ar' } });

    expect(settings.locale).toBe('ar');
  });

  it('configures local call-caption presentation from Messages', () => {
    const { getAllByText, getByLabelText } = render(() => <SettingsModal open onClose={vi.fn()} />);
    fireEvent.click(getAllByText('Messages')[0]!);
    fireEvent.change(getByLabelText('Default caption size'), { target: { value: 'large' } });
    fireEvent.change(getByLabelText('Default caption background'), { target: { value: 'translucent' } });
    expect(settings.captionSize).toBe('large');
    expect(settings.captionBackground).toBe('translucent');
  });

  it('configures timezone-aware quiet hours and temporary DND', () => {
    const { getAllByText, getByLabelText, getByRole } = render(() => (
      <SettingsModal open onClose={vi.fn()} />
    ));
    fireEvent.click(getAllByText('Alerts')[0]!);
    fireEvent.click(getByRole('switch', { name: /Scheduled quiet hours/ }));
    fireEvent.input(getByLabelText('Quiet starts'), { target: { value: '21:30' } });
    fireEvent.input(getByLabelText('Quiet ends'), { target: { value: '06:15' } });
    fireEvent.input(getByLabelText('Time zone'), { target: { value: 'Europe/Berlin' } });
    fireEvent.click(getByRole('button', { name: 'Pause 1 hour' }));

    expect(settings.quietHoursEnabled).toBe(true);
    expect(settings.quietHoursStart).toBe('21:30');
    expect(settings.quietHoursEnd).toBe('06:15');
    expect(settings.quietHoursTimezone).toBe('Europe/Berlin');
    expect(settings.notificationsSnoozedUntil).toBeGreaterThan(Date.now());
    expect(getByRole('status')).toHaveTextContent(/Paused until/);

    fireEvent.click(getByRole('button', { name: 'Resume alerts' }));
    expect(settings.notificationsSnoozedUntil).toBe(0);
  });

  it('creates and removes a named allowlisted command-palette action', () => {
    const { getAllByText, getByLabelText, getByRole } = render(() => (
      <SettingsModal open onClose={vi.fn()} />
    ));
    fireEvent.click(getAllByText('Advanced')[0]!);
    fireEvent.input(getByLabelText('Action name'), { target: { value: 'Who is teammate' } });
    fireEvent.change(getByLabelText('Safe command'), { target: { value: 'whois' } });
    fireEvent.click(getByRole('button', { name: 'Add action' }));

    expect(settings.userActions).toHaveLength(1);
    expect(settings.userActions[0]).toMatchObject({ name: 'Who is teammate', commandId: 'whois', scope: 'global' });
    expect(getAllByText('/whois {nick}').length).toBeGreaterThan(0);

    fireEvent.click(getByRole('button', { name: 'Delete action Who is teammate' }));
    expect(settings.userActions).toEqual([]);
  });

  it('shows capability-aware cross-device preference status and the local-only fallback', () => {
    const { getAllByText, getByLabelText, getByText } = render(() => (
      <SettingsModal open onClose={vi.fn()} />
    ));

    fireEvent.click(getAllByText('Connection')[0]!);
    expect(getByText('Cross-device preferences')).toBeInTheDocument();
    expect(getByText(/Export\/import remains the fallback/)).toBeInTheDocument();
    expect(getByLabelText('Sync preferences now')).toBeDisabled();
  });

  it('shows redacted phase, protocol, Orochi media, and runtime diagnostics', () => {
    const { getAllByText, getByText } = render(() => <SettingsModal open onClose={vi.fn()} />);

    fireEvent.click(getAllByText('Advanced')[0]!);

    expect(getByText('Phase')).toBeInTheDocument();
    expect(getByText('Protocol')).toBeInTheDocument();
    expect(getByText('Orochi Media')).toBeInTheDocument();
    expect(getByText('Codec Runtime')).toBeInTheDocument();
    expect(getByText('Service Worker')).toBeInTheDocument();
  });

  it('describes settings portability as a redacted, secret-free copy', () => {
    const { getAllByText, getByRole, getByText } = render(() => (
      <SettingsModal open onClose={vi.fn()} />
    ));

    fireEvent.click(getAllByText('Advanced')[0]!);

    expect(getByText(/without passwords, API keys, or URL credentials and query data/))
      .toBeInTheDocument();
    expect(getByRole('button', { name: 'Copy Redacted Settings' })).toBeInTheDocument();
    expect(getByRole('button', { name: 'Import Redacted Settings' })).toBeInTheDocument();
  });

  it('quick toggles update settings immediately', () => {
    const { getByLabelText } = render(() => <SettingsModal open onClose={vi.fn()} />);

    expect(settings.compactMode).toBe(false);
    fireEvent.click(getByLabelText('Toggle Compact'));
    expect(settings.compactMode).toBe(true);

    expect(settings.bridge.enabled).toBe(false);
    fireEvent.click(getByLabelText('Toggle Bridge'));
    expect(settings.bridge.enabled).toBe(true);
  });

  it('calls onClose from the custom close control', () => {
    const onClose = vi.fn();
    const { getAllByLabelText } = render(() => <SettingsModal open onClose={onClose} />);

    fireEvent.click(getAllByLabelText('Close preferences')[0]!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
