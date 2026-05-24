'use client';

import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  onClose?: () => void;
  title?: string;
  width?: string;
  wide?: boolean;
  maxHeight?: string;
  className?: string;
}

const WIDTH_MAP: Record<string, string> = {
  'max-w-sm': '384px',
  'max-w-md': '448px',
  'max-w-lg': '512px',
  'max-w-xl': '576px',
  'max-w-2xl': '672px',
};

export default function Modal({ children, onClose, title, width, wide, maxHeight, className = '' }: Props) {
  const resolvedWidth = width ?? (wide ? 'max-w-2xl' : 'max-w-lg');
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    if (!panel) return;

    const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusable = panel.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (focusable.length > 0) focusable[0].focus();

    function onKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape' && onClose) {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const nodes = panel!.querySelectorAll<HTMLElement>(FOCUSABLE);
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
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
    return () => {
      window.removeEventListener('keydown', onKeydown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 animate-fade-in"
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))', paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      onClick={e => { if (e.target === overlayRef.current && onClose) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/60" style={{ WebkitBackdropFilter: 'blur(4px)', backdropFilter: 'blur(4px)' }} />
      <div
        ref={panelRef}
        className={`relative w-full rounded-2xl border border-white/[0.06] bg-gray-900 overflow-hidden ${className}`}
        style={{
          maxWidth: WIDTH_MAP[resolvedWidth] ?? resolvedWidth.replace('max-w-[', '').replace(']', ''),
          maxHeight: maxHeight ?? '85dvh',
          boxShadow: '0 25px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)',
        }}
      >
        {title && (
          <div className="flex items-center justify-between px-4 sm:px-5 pt-4 pb-3 border-b border-white/[0.04]">
            <h2 className="text-[15px] font-semibold text-gray-100">{title}</h2>
            {onClose && (
              <button onClick={onClose} className="text-gray-600 hover:text-gray-300 transition-colors p-2 -mr-2 rounded-lg hover:bg-white/5"
                aria-label="Close">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
