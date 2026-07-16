// Modal render tests — title/children rendering, open gate, Escape/backdrop
// dismissal, and initial focus placement inside the panel.

import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import Modal from './Modal';

const tab = (shiftKey = false) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey }));

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

  it('falls back to the panel when no focusable child exists', () => {
    // No title bar (no close button) and inert content: nothing focusable.
    const { getByRole } = render(() => (
      <Modal open>
        <p>read-only content</p>
      </Modal>
    ));

    const dialog = getByRole('dialog');
    expect(dialog).toHaveAttribute('tabindex', '-1');
    // Focus lands on the dialog itself rather than escaping the modal.
    expect(document.activeElement).toBe(dialog);
  });

  it('skips a disabled first child when placing initial focus', () => {
    const { getByRole, getByText } = render(() => (
      <Modal open>
        <button disabled>Disabled first</button>
        <button>Enabled second</button>
      </Modal>
    ));

    const dialog = getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
    // The disabled control must not receive focus; the enabled one does.
    expect(document.activeElement).toBe(getByText('Enabled second'));
  });

  it('wraps Tab from the last focusable to the first ENABLED one', () => {
    const { getByText } = render(() => (
      <Modal open>
        <button disabled>Disabled first</button>
        <button>Enabled A</button>
        <button>Enabled B</button>
      </Modal>
    ));

    const enabledA = getByText('Enabled A');
    const enabledB = getByText('Enabled B');
    enabledB.focus();
    expect(document.activeElement).toBe(enabledB);

    // Forward Tab off the last node wraps to the first ENABLED node, skipping
    // the disabled first child entirely.
    tab();
    expect(document.activeElement).toBe(enabledA);

    // Shift+Tab off the first ENABLED node wraps back to the last.
    tab(true);
    expect(document.activeElement).toBe(enabledB);
  });

  it('pins Tab to the panel when there is no focusable child', () => {
    const { getByRole } = render(() => (
      <Modal open>
        <p>static content</p>
      </Modal>
    ));

    const dialog = getByRole('dialog');
    expect(document.activeElement).toBe(dialog);
    // Tab must not escape the dialog — focus stays pinned to the panel.
    tab();
    expect(document.activeElement).toBe(dialog);
  });

  it('repairs focus after a focused dynamic control is removed', () => {
    const [showDynamic, setShowDynamic] = createSignal(true);
    const { getByLabelText, getByText, queryByText } = render(() => (
      <Modal open title="Dynamic" onClose={() => undefined}>
        {showDynamic() && <button onClick={() => setShowDynamic(false)}>Remove me</button>}
        <button>Stable</button>
      </Modal>
    ));

    const dynamic = getByText('Remove me');
    dynamic.focus();
    fireEvent.click(dynamic);
    expect(queryByText('Remove me')).toBeNull();

    tab();
    expect(document.activeElement).toBe(getByLabelText('Close'));
  });

  it('makes background siblings inert until the modal unmounts', () => {
    const [open, setOpen] = createSignal(true);
    const { getByText } = render(() => (
      <>
        <main data-testid="background"><button>Background</button></main>
        <Modal open={open()} title="Isolated" onClose={() => setOpen(false)}>
          <button>Inside</button>
        </Modal>
      </>
    ));

    const background = getByText('Background').parentElement!;
    expect(background).toHaveAttribute('inert');
    setOpen(false);
    expect(background).not.toHaveAttribute('inert');
  });

  it('excludes an inert-subtree control from the focus order', () => {
    const { getByText } = render(() => (
      <Modal open>
        <div ref={(el) => el.setAttribute('inert', '')}>
          <button>Inert child</button>
        </div>
        <button>Reachable</button>
      </Modal>
    ));

    // Initial focus skips the inert control and lands on the reachable one.
    expect(document.activeElement).toBe(getByText('Reachable'));
  });

  it('excludes a display:none control from the focus order', () => {
    const { getByText } = render(() => (
      <Modal open>
        <button style={{ display: 'none' }}>Hidden</button>
        <button>Visible</button>
      </Modal>
    ));

    expect(document.activeElement).toBe(getByText('Visible'));
  });

  it('closes on Escape and restores focus to the opener', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const [open, setOpen] = createSignal(true);
    const { queryByRole } = render(() => (
      <Modal open={open()} title="Restore" onClose={() => setOpen(false)}>
        <button>Inside</button>
      </Modal>
    ));

    // Focus moved into the dialog on open.
    expect(queryByRole('dialog')).not.toBeNull();
    expect(opener.contains(document.activeElement)).toBe(false);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    // Escape drove onClose, which unmounted the dialog.
    expect(queryByRole('dialog')).toBeNull();
    // Unmount cleanup restores focus to the element that opened the modal.
    expect(document.activeElement).toBe(opener);

    opener.remove();
  });
});
