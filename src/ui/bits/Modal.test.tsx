// Modal render tests — title/children rendering, open gate, Escape/backdrop
// dismissal, and initial focus placement inside the panel.

import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import Modal from './Modal';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Modal', () => {
  it('renders the title and children when open', () => {
    const { getByText, getByRole } = render(() => (
      <Modal open title="Preferences" onClose={() => undefined}>
        <p>Body content</p>
      </Modal>
    ));

    const dialog = getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(getByText('Preferences')).toBeInTheDocument();
    expect(getByText('Body content')).toBeInTheDocument();
  });

  it('renders nothing when open is false', () => {
    const { container, queryByText } = render(() => (
      <Modal open={false} title="Hidden">
        <p>Never shown</p>
      </Modal>
    ));

    expect(queryByText('Never shown')).toBeNull();
    expect(container.innerHTML).toBe('');
  });

  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    render(() => (
      <Modal open title="Esc" onClose={onClose}>
        <p>content</p>
      </Modal>
    ));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    const { getByRole } = render(() => (
      <Modal open title="Backdrop" onClose={onClose}>
        <p>content</p>
      </Modal>
    ));

    // The dimming backdrop is the sibling right before the dialog panel; it
    // covers the whole overlay, so it is what a user actually clicks.
    const dialog = getByRole('dialog');
    const backdrop = dialog.previousElementSibling;
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when clicking inside the panel', () => {
    const onClose = vi.fn();
    const { getByText } = render(() => (
      <Modal open title="Inside" onClose={onClose}>
        <p>content</p>
      </Modal>
    ));

    fireEvent.click(getByText('content'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('moves focus inside the panel on open', () => {
    const { getByRole, getByLabelText } = render(() => (
      <Modal open title="Focus" onClose={() => undefined}>
        <button>Do the thing</button>
      </Modal>
    ));

    const dialog = getByRole('dialog');
    expect(document.activeElement).not.toBeNull();
    expect(dialog.contains(document.activeElement)).toBe(true);
    // First focusable in the panel is the title-bar close button.
    expect(document.activeElement).toBe(getByLabelText('Close'));
  });
});
