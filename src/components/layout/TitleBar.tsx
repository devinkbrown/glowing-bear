'use client';

import { useState, useEffect } from 'react';

let tauriWindow: typeof import('@tauri-apps/api/window') | null = null;
async function getTauri() {
  if (!tauriWindow) tauriWindow = await import('@tauri-apps/api/window');
  return tauriWindow;
}

export default function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    getTauri().then(async ({ getCurrentWindow }) => {
      const win = getCurrentWindow();
      setMaximized(await win.isMaximized());
      const unlisten = await win.onResized(async () => {
        setMaximized(await win.isMaximized());
      });
      return unlisten;
    }).catch(() => {});
  }, []);

  const minimize = () => getTauri().then(({ getCurrentWindow }) => getCurrentWindow().minimize()).catch(() => {});
  const toggleMax = () => getTauri().then(({ getCurrentWindow }) => getCurrentWindow().toggleMaximize()).catch(() => {});
  const close = () => getTauri().then(({ getCurrentWindow }) => getCurrentWindow().close()).catch(() => {});

  return (
    <div
      data-tauri-drag-region
      className="relative z-[100] flex items-center justify-between h-8 px-3 shrink-0 select-none bg-gray-950 border-b border-white/[0.05]"
    >
      <span data-tauri-drag-region className="text-[10px] font-bold tracking-[0.2em] uppercase text-gray-700 pointer-events-none">
        DarkBear
      </span>

      <div className="flex items-center">
        {/* Minimize */}
        <button
          onClick={minimize}
          aria-label="Minimize"
          className="w-11 h-8 flex items-center justify-center text-gray-600 hover:text-gray-300 hover:bg-white/[0.06] transition-colors"
        >
          <svg width="11" height="2" viewBox="0 0 11 2" fill="currentColor">
            <rect width="11" height="1.5" rx="0.75" />
          </svg>
        </button>

        {/* Maximize / Restore */}
        <button
          onClick={toggleMax}
          aria-label={maximized ? 'Restore' : 'Maximize'}
          className="w-11 h-8 flex items-center justify-center text-gray-600 hover:text-gray-300 hover:bg-white/[0.06] transition-colors"
        >
          {maximized ? (
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.2">
              <rect x="3" y="0.6" width="7.4" height="7.4" rx="0.5" />
              <path d="M0.6 3v7.4h7.4" />
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.2">
              <rect x="0.6" y="0.6" width="9.8" height="9.8" rx="0.5" />
            </svg>
          )}
        </button>

        {/* Close */}
        <button
          onClick={close}
          aria-label="Close"
          className="w-11 h-8 flex items-center justify-center text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M1 1l9 9M10 1l-9 9" />
          </svg>
        </button>
      </div>
    </div>
  );
}
