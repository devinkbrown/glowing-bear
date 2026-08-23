// HelpModal — keyboard shortcuts, Onyx Server command reference, and the
// Onyx extras voice/video commands.

import { For } from 'solid-js';
import Modal from '@/ui/bits/Modal';
import { t, type MessageKey } from '@/lib/i18n';

interface Props {
  open?: boolean;
  onClose: () => void;
}

const SHORTCUTS: { keys: string; desc: MessageKey }[] = [
  { keys: 'Alt + 1-9', desc: 'help.shortcut.buffers' },
  { keys: 'Alt + Up/Down', desc: 'help.shortcut.nextBuffer' },
  { keys: 'Alt + A', desc: 'help.shortcut.activity' },
  { keys: 'Ctrl + K', desc: 'help.shortcut.switcher' },
  { keys: 'Ctrl + B', desc: 'help.shortcut.sidebar' },
  { keys: 'Ctrl + U', desc: 'help.shortcut.userList' },
  { keys: 'Ctrl + I', desc: 'help.shortcut.channelInfo' },
  { keys: 'Ctrl + \\', desc: 'help.shortcut.split' },
  { keys: 'Ctrl + Shift + O', desc: 'help.shortcut.oper' },
  { keys: 'Tab', desc: 'help.shortcut.complete' },
  { keys: 'Up / Down', desc: 'help.shortcut.history' },
  { keys: 'Ctrl+B (input)', desc: 'help.shortcut.bold' },
  { keys: 'Ctrl+I (input)', desc: 'help.shortcut.italic' },
  { keys: 'Ctrl+U (input)', desc: 'help.shortcut.underline' },
  { keys: 'Escape', desc: 'help.shortcut.escape' },
  { keys: 'M / D / V / S', desc: 'help.shortcut.callKeys' },
  { keys: 'C / H', desc: 'help.shortcut.callEnd' },
];

const ONYX_COMMANDS: { cmd: string; desc: MessageKey }[] = [
  { cmd: '/whisper #ch nick msg', desc: 'help.cmd.whisper' },
  { cmd: '/prop #ch|nick [key] [val]', desc: 'help.cmd.prop' },
  { cmd: '/access #channel', desc: 'help.cmd.access' },
  { cmd: '/chaninfo [#channel]', desc: 'help.cmd.chaninfo' },
  { cmd: '/profile nick', desc: 'help.cmd.profile' },
  { cmd: '/services', desc: 'help.cmd.services' },
  { cmd: '/monitor add|del nick', desc: 'help.cmd.monitor' },
  { cmd: '/pushset key value', desc: 'help.cmd.pushset' },
];

const EXTRAS_COMMANDS: { cmd: string; desc: MessageKey }[] = [
  { cmd: '/call nick', desc: 'help.cmd.call' },
  { cmd: '/vcall nick', desc: 'help.cmd.vcall' },
  { cmd: '/voice [#channel]', desc: 'help.cmd.voice' },
  { cmd: '/video [#channel]', desc: 'help.cmd.video' },
  { cmd: '/hangup', desc: 'help.cmd.hangup' },
];

function CommandList(props: { items: { cmd: string; desc: MessageKey }[] }) {
  return (
    <div class="space-y-0.5">
      <For each={props.items}>
        {(item) => (
          <div class="flex items-center justify-between py-2 group">
            <span class="text-gray-400 text-[13px] group-hover:text-gray-200 transition-colors">{t(item.desc)}</span>
            <code class="help-code text-[10px] font-mono text-[var(--custom-accent,#818cf8)] bg-[var(--custom-accent,#818cf8)]/[0.06] px-2 py-1 shrink-0 ms-3">
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
    <Modal open={props.open} onClose={props.onClose} title={t('help.title')} width="max-w-md">
      <div class="p-5 space-y-5 overflow-y-auto" style={{ 'max-height': 'calc(85dvh - 56px)' }}>
        <div>
          <h3 class="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">{t('help.shortcuts')}</h3>
          <div class="space-y-0.5">
            <For each={SHORTCUTS}>
              {(s) => (
                <div class="flex items-center justify-between py-2 group">
                  <span class="text-gray-400 text-[13px] group-hover:text-gray-200 transition-colors">{t(s.desc)}</span>
                  <kbd class="help-kbd text-[11px] font-mono text-gray-400 bg-white/[0.04] border border-white/[0.06] px-2 py-1 shrink-0 ms-4">
                    {s.keys}
                  </kbd>
                </div>
              )}
            </For>
          </div>
        </div>

        <div class="border-t border-white/[0.06] pt-4">
          <h3 class="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">{t('help.onyxCommands')}</h3>
          <CommandList items={ONYX_COMMANDS} />
        </div>

        <div class="border-t border-white/[0.06] pt-4">
          <h3 class="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">{t('help.extrasCommands')}</h3>
          <p class="text-[10px] text-gray-600 leading-relaxed mb-2">
            {t('help.extrasHint')}
          </p>
          <CommandList items={EXTRAS_COMMANDS} />
        </div>
      </div>
    </Modal>
  );
}
