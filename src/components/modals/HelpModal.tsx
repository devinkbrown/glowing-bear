'use client';

import Modal from '@/components/ui/Modal';

interface Props {
  onClose: () => void;
}

const SHORTCUTS = [
  { keys: 'Alt + 1-9', desc: 'Switch to buffer 1-9' },
  { keys: 'Alt + Up/Down', desc: 'Previous / next buffer' },
  { keys: 'Alt + A', desc: 'Jump to next highlight' },
  { keys: 'Ctrl + K', desc: 'Quick buffer switcher' },
  { keys: 'Ctrl + B', desc: 'Toggle sidebar' },
  { keys: 'Ctrl + U', desc: 'Toggle user list' },
  { keys: 'Ctrl + \\', desc: 'Toggle split view' },
  { keys: 'Tab', desc: 'Complete nick / command' },
  { keys: 'Up / Down', desc: 'Command history' },
  { keys: 'Ctrl+B (input)', desc: 'Bold text' },
  { keys: 'Ctrl+I (input)', desc: 'Italic text' },
  { keys: 'Ctrl+U (input)', desc: 'Underline text' },
  { keys: 'Escape', desc: 'Close modal / panel' },
];

export default function HelpModal({ onClose }: Props) {
  return (
    <Modal onClose={onClose} title="Keyboard Shortcuts" width="max-w-md">
      <div className="p-5">
        <div className="space-y-0.5">
          {SHORTCUTS.map(({ keys, desc }) => (
            <div key={keys} className="flex items-center justify-between py-2 group">
              <span className="text-gray-400 text-[13px] group-hover:text-gray-200 transition-colors">{desc}</span>
              <kbd className="text-[11px] font-mono text-gray-400 bg-white/[0.04] border border-white/[0.06] rounded-md px-2 py-1 shrink-0 ml-4">
                {keys}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
