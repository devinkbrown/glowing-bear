import { isImeComposing } from '@/primitives/ime';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function isVisuallyHidden(element: HTMLElement): boolean {
  if (getComputedStyle(element).visibility === 'hidden') return true;
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    if (getComputedStyle(node).display === 'none') return true;
  }
  return false;
}

function isFocusable(element: HTMLElement): boolean {
  if ((element as HTMLButtonElement | HTMLInputElement).disabled) return false;
  if (element.hasAttribute('disabled')) return false;
  if (element.getAttribute('aria-hidden') === 'true') return false;
  if (element.hidden || element.closest('[hidden]')) return false;
  if (element.closest('[inert]')) return false;
  return !isVisuallyHidden(element);
}

function focusableIn(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isFocusable);
}

interface OverlayFocusOptions {
  panel: HTMLElement;
  backdrop?: HTMLElement;
  initialFocus?: HTMLElement;
  onDismiss: () => void;
}

interface InertSnapshot {
  element: HTMLElement;
  inert: boolean;
  hadAttribute: boolean;
}

/**
 * Makes a conditionally mounted side panel behave as a true modal overlay.
 * The panel owns focus, its sibling app regions become inert, and cleanup
 * returns focus to the control that opened it.
 */
export function activateOverlayFocus(options: OverlayFocusOptions): () => void {
  const { panel, backdrop, initialFocus, onDismiss } = options;
  const previouslyFocused = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  const inertSnapshots: InertSnapshot[] = [];
  const parent = panel.parentElement;
  const owned = new Set<HTMLElement>([panel]);
  if (backdrop) owned.add(backdrop);

  if (parent) {
    for (const sibling of parent.children) {
      if (!(sibling instanceof HTMLElement) || owned.has(sibling)) continue;
      inertSnapshots.push({
        element: sibling,
        inert: sibling.inert,
        hadAttribute: sibling.hasAttribute('inert'),
      });
      sibling.inert = true;
      sibling.setAttribute('inert', '');
    }
  }

  let active = true;
  queueMicrotask(() => {
    if (!active || !panel.isConnected) return;
    const target = initialFocus && isFocusable(initialFocus)
      ? initialFocus
      : focusableIn(panel)[0] ?? panel;
    target.focus();
  });

  const onKeyDown = (event: KeyboardEvent): void => {
    if (isImeComposing(event)) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      onDismiss();
      return;
    }
    if (event.key !== 'Tab') return;

    const nodes = focusableIn(panel);
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (!first || !last) {
      event.preventDefault();
      panel.focus();
      return;
    }

    const focused = document.activeElement;
    if (!panel.contains(focused)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && focused === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && focused === last) {
      event.preventDefault();
      first.focus();
    }
  };

  window.addEventListener('keydown', onKeyDown);
  return () => {
    active = false;
    window.removeEventListener('keydown', onKeyDown);
    for (const snapshot of inertSnapshots) {
      snapshot.element.inert = snapshot.inert;
      if (snapshot.hadAttribute) snapshot.element.setAttribute('inert', '');
      else snapshot.element.removeAttribute('inert');
    }
    if (previouslyFocused?.isConnected) previouslyFocused.focus();
  };
}
