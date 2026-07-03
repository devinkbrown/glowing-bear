// Modal — shared modal shell: backdrop blur + click-to-close, focus trap,
// Escape to close, optional title bar with ✕ button.
//
// STABLE API — panels and modals across the app import '@/ui/bits/Modal':
//
//   <Modal open={uiState.activeModal === 'help'} onClose={closeModal}
//          title="Help" width="max-w-md">
//     ...content...
//   </Modal>
//
// Props:
//   open?      Render gate. Defaults to true so conditionally-mounted usage
//              (<Show when={...}><Modal ...>) works without passing it.
//   onClose?   Called on Escape, backdrop click, and the title-bar ✕.
//              Omit to make the modal non-dismissable.
//   title?     Renders a title bar (with close button when onClose is given).
//   width?     'max-w-sm' | 'max-w-md' | 'max-w-lg' | 'max-w-xl' | 'max-w-2xl'
//              or a 'max-w-[…]' literal / raw CSS length.
//              Defaults to 'max-w-lg' ('max-w-2xl' when `wide`).
//   wide?      Shorthand for width='max-w-2xl'.
//   maxHeight? Panel max-height (default '85dvh').
//   class?     Extra classes for the panel element.

import { Show, createUniqueId, onCleanup, onMount } from 'solid-js';
import type { JSX } from 'solid-js';

export interface ModalProps {
  children: JSX.Element;
  open?: boolean;
  onClose?: () => void;
  title?: string;
  width?: string;
  wide?: boolean;
  maxHeight?: string;
  class?: string;
}

const WIDTH_MAP: Record<string, string> = {
  'max-w-sm': '384px',
  'max-w-md': '448px',
  'max-w-lg': '512px',
  'max-w-xl': '576px',
  'max-w-2xl': '672px',
};

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export default function Modal(props: ModalProps) {
  return (
    <Show when={props.open ?? true}>
      <ModalShell {...props} />
    </Show>
  );
}

function ModalShell(props: ModalProps) {
  const titleId = createUniqueId();
  let overlayRef: HTMLDivElement | undefined;
  let backdropRef: HTMLDivElement | undefined;
  let panelRef: HTMLDivElement | undefined;

  const widthCss = () => {
    const resolved = props.width ?? (props.wide ? 'max-w-2xl' : 'max-w-lg');
    return WIDTH_MAP[resolved] ?? resolved.replace('max-w-[', '').replace(']', '');
  };

  onMount(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef;
    if (!panel) return;

    const focusable = panel.querySelectorAll<HTMLElement>(FOCUSABLE);
    focusable[0]?.focus();

    function onKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape' && props.onClose) {
        e.preventDefault();
        props.onClose();
        return;
      }
      if (e.key === 'Tab' && panel) {
        const nodes = panel.querySelectorAll<HTMLElement>(FOCUSABLE);
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener('keydown', onKeydown);
    onCleanup(() => {
      window.removeEventListener('keydown', onKeydown);
      previouslyFocused?.focus();
    });
  });

  return (
    <div
      ref={(el) => (overlayRef = el)}
      class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 animate-fade-in"
      style={{
        'padding-top': 'max(0.75rem, env(safe-area-inset-top))',
        'padding-bottom': 'max(0.75rem, env(safe-area-inset-bottom))',
      }}
      onClick={(e) => {
        // The dimming backdrop covers the overlay, so outside-the-panel clicks
        // target the backdrop — treat both as click-to-close.
        if ((e.target === overlayRef || e.target === backdropRef) && props.onClose) props.onClose();
      }}
    >
      <div
        ref={(el) => (backdropRef = el)}
        class="absolute inset-0 bg-black/60"
        style={{ '-webkit-backdrop-filter': 'blur(4px)', 'backdrop-filter': 'blur(4px)' }}
      />
      <div
        ref={(el) => (panelRef = el)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={props.title ? titleId : undefined}
        class={`relative w-full rounded-2xl border border-white/[0.06] bg-gray-900 overflow-hidden ${props.class ?? ''}`}
        style={{
          'max-width': widthCss(),
          'max-height': props.maxHeight ?? '85dvh',
          'box-shadow': '0 25px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)',
        }}
      >
        <Show when={props.title}>
          <div class="flex items-center justify-between px-4 sm:px-5 pt-4 pb-3 border-b border-white/[0.04]">
            <h2 id={titleId} class="text-[15px] font-semibold text-gray-100">{props.title}</h2>
            <Show when={props.onClose}>
              <button
                onClick={() => props.onClose?.()}
                class="text-gray-600 hover:text-gray-300 transition-colors p-2 -mr-2 rounded-lg hover:bg-white/5"
                aria-label="Close"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </Show>
          </div>
        </Show>
        {props.children}
      </div>
    </div>
  );
}
