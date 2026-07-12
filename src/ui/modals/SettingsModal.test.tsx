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
