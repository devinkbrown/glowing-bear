// HelpModal — keyboard shortcuts, IRCX/orochi command reference, and the
// orochi bridge voice/video commands.
//
// Usage: <HelpModal open={uiState.activeModal === 'help'} onClose={closeModal} />
// `open` defaults to true for conditional-mount usage.

import { For } from 'solid-js';
import Modal from '@/ui/bits/Modal';

interface Props {
  open?: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { keys: 'Alt + 1-9', desc: 'Switch to buffer 1-9' },
  { keys: 'Alt + Up/Down', desc: 'Previous / next buffer' },
  { keys: 'Alt + A', desc: 'Jump to next highlight' },
  { keys: 'Ctrl + K', desc: 'Quick buffer switcher' },
  { keys: 'Ctrl + B', desc: 'Toggle sidebar' },
  { keys: 'Ctrl + U', desc: 'Toggle user list' },
  { keys: 'Ctrl + I', desc: 'Channel info (IRCX)' },
  { keys: 'Ctrl + \\', desc: 'Toggle split view' },
  { keys: 'Ctrl + Shift + O', desc: 'Oper console' },
  { keys: 'Tab', desc: 'Complete nick / command' },
  { keys: 'Up / Down', desc: 'Command history' },
  { keys: 'Ctrl+B (input)', desc: 'Bold text' },
  { keys: 'Ctrl+I (input)', desc: 'Italic text' },
  { keys: 'Ctrl+U (input)', desc: 'Underline text' },
  { keys: 'Escape', desc: 'Close modal / panel' },
];

const IRCX_COMMANDS = [
  { cmd: '/whisper #ch nick msg', desc: 'IRCX whisper (in-channel PM)' },
  { cmd: '/prop #ch|nick [key] [val]', desc: 'View/set IRCX properties' },
  { cmd: '/access #channel', desc: 'View IRCX access list' },
  { cmd: '/chaninfo [#channel]', desc: 'Open channel info panel' },
  { cmd: '/profile nick', desc: 'Open user profile card' },
  { cmd: '/services', desc: 'Open NickServ/ChanServ/Memo' },
  { cmd: '/monitor add|del nick', desc: 'MONITOR online tracking' },
  { cmd: '/pushset key value', desc: 'Configure push notifications' },
];

const BRIDGE_COMMANDS = [
  { cmd: '/call nick', desc: 'Start a video call (DM)' },
  { cmd: '/vcall nick', desc: 'Start a voice call (DM)' },
  { cmd: '/voice [#channel]', desc: 'Join the channel voice room' },
  { cmd: '/video [#channel]', desc: 'Join the channel video room' },
  { cmd: '/hangup', desc: 'Leave the current call / room' },
];

function CommandList(props: { items: { cmd: string; desc: string }[] }) {
  return (
    <div class="space-y-0.5">
      <For each={props.items}>
        {(item) => (
          <div class="flex items-center justify-between py-2 group">
            <span class="text-gray-400 text-[13px] group-hover:text-gray-200 transition-colors">{item.desc}</span>
            <code class="text-[10px] font-mono text-[var(--custom-accent,#818cf8)] bg-[var(--custom-accent,#818cf8)]/[0.06] rounded-md px-2 py-1 shrink-0 ml-3">
              {item.cmd}
            </code>
          </div>
        )}
      </For>
    </div>
  );
}

export default function HelpModal(props: Props) {
  return (
    <Modal open={props.open} onClose={props.onClose} title="Help" width="max-w-md">
      <div class="p-5 space-y-5 overflow-y-auto" style={{ 'max-height': 'calc(85dvh - 56px)' }}>
        <div>
          <h3 class="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">Keyboard Shortcuts</h3>
          <div class="space-y-0.5">
            <For each={SHORTCUTS}>
              {(s) => (
                <div class="flex items-center justify-between py-2 group">
                  <span class="text-gray-400 text-[13px] group-hover:text-gray-200 transition-colors">{s.desc}</span>
                  <kbd class="text-[11px] font-mono text-gray-400 bg-white/[0.04] border border-white/[0.06] rounded-md px-2 py-1 shrink-0 ml-4">
                    {s.keys}
                  </kbd>
                </div>
              )}
            </For>
          </div>
        </div>

        <div class="border-t border-white/[0.06] pt-4">
          <h3 class="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">IRCX / orochi Commands</h3>
          <CommandList items={IRCX_COMMANDS} />
        </div>

        <div class="border-t border-white/[0.06] pt-4">
          <h3 class="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">Voice / Video (orochi bridge)</h3>
          <p class="text-[10px] text-gray-600 leading-relaxed mb-2">
            These commands require the orochi bridge — enable it under Settings → Connection.
          </p>
          <CommandList items={BRIDGE_COMMANDS} />
        </div>
      </div>
    </Modal>
  );
}
