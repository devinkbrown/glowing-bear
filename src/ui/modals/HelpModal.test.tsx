// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { createSignal } from 'solid-js';
import { cleanup, fireEvent, render } from '@solidjs/testing-library';
import HelpModal from './HelpModal';

afterEach(() => {
  cleanup();
});

describe('HelpModal', () => {
  it('renders keyboard, Onyx, and extras command help', () => {
    const { getByRole, getByText } = render(() => <HelpModal open onClose={vi.fn()} />);

    expect(getByRole('dialog')).toHaveAccessibleName('Help');
    expect(getByText('Keyboard Shortcuts')).toBeInTheDocument();
    expect(getByText('Switch to buffer 1-9')).toBeInTheDocument();
    expect(getByText('/whisper #ch nick msg')).toBeInTheDocument();
    expect(getByText('/call nick')).toBeInTheDocument();
    expect(getByText('Voice / Video (Onyx extras)')).toBeInTheDocument();
    expect(getByRole('dialog').textContent).not.toMatch(/Bridge/);
  });

  it('closes through the Modal title-bar close button', () => {
    const { getByLabelText, queryByRole } = render(() => {
      const [open, setOpen] = createSignal(true);
      return <HelpModal open={open()} onClose={() => setOpen(false)} />;
    });

    fireEvent.click(getByLabelText('Close'));

    expect(queryByRole('dialog')).toBeNull();
  });

  it('closes through the Modal Escape handler', () => {
    const { queryByRole } = render(() => {
      const [open, setOpen] = createSignal(true);
      return <HelpModal open={open()} onClose={() => setOpen(false)} />;
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(queryByRole('dialog')).toBeNull();
  });
});
