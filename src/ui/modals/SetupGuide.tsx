// Localized setup drawer. Closed by default. Snippets are generated from the
// live connect form and never emit `weechat.weechat`. Tabs follow the chosen
// first-class server type.

import { For, Show, createEffect, createSignal, onCleanup } from 'solid-js';
import { t } from '@/lib/i18n';
import type { ConnectServerType } from '@/lib/connect/serverTypes';
import { defaultSetupTab, setupTabsForType } from '@/lib/connect/serverTypes';
import {
  caddyWeechatConfig,
  letsEncryptRelayPemLines,
  nginxWeechatConfig,
  onyxTlsEndpoint,
  onyxWssEndpoint,
  weechatBindLocalhostCommand,
  weechatListenerName,
  weechatOriginCommand,
  weechatQuickstartCommands,
  weechatTlsCertCommands,
  weechatTotpCommands,
} from '@/lib/weechat/setupSnippets';

function useCopy(): [() => boolean, (text: string) => void] {
  const [copied, setCopied] = createSignal(false);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => {
    if (copiedTimer) clearTimeout(copiedTimer);
  });
  const copy = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      if (copiedTimer) clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => {
        copiedTimer = undefined;
        setCopied(false);
      }, 1500);
    });
  };
  return [copied, copy];
}

function CopyBlock(props: { label?: string; text: string }) {
  const [copied, copy] = useCopy();
  return (
    <div class="flex flex-col gap-1">
      <Show when={props.label}>
        <span class="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-600 pl-1">{props.label}</span>
      </Show>
      <div class="setup-block group flex items-center gap-0 overflow-hidden">
        <code class="flex-1 text-[12px] text-gray-300 font-mono px-3 py-2.5 leading-relaxed select-all overflow-x-auto guide-no-scrollbar whitespace-pre-wrap">{props.text}</code>
        <button
          type="button"
          onClick={() => copy(props.text)}
          class="setup-copy"
          aria-label={t('setup.copy')}
        >
          {copied() ? t('setup.copied') : t('setup.copy')}
        </button>
      </div>
    </div>
  );
}

export interface SetupGuideProps {
  open: boolean;
  type: ConnectServerType;
  port: number;
  tls: boolean;
  path: string;
  origin?: string;
  endpoint?: string;
}

export default function SetupGuide(props: SetupGuideProps) {
  const [tab, setTab] = createSignal<'weechat' | 'proxy' | 'totp' | 'onyx' | 'tls'>('weechat');
  createEffect(() => {
    setTab(defaultSetupTab(props.type));
  });
  const origin = () => props.origin || (typeof location !== 'undefined' ? location.origin : '*');
  const commands = () => weechatQuickstartCommands({ port: props.port, tls: props.tls, path: props.path, origin: origin() });
  const tabs = () => setupTabsForType(props.type);

  return (
    <Show when={props.open}>
      <div data-testid="setup-drawer" class="mt-4 flex flex-col gap-3 animate-fade-in">
        <div class="setup-tabs" role="tablist" aria-label={t('connect.setup')}>
          <For each={tabs()}>
            {(id) => (
              <button
                type="button"
                role="tab"
                aria-selected={tab() === id}
                data-testid={`setup-tab-${id}`}
                onClick={() => setTab(id)}
                class="setup-tab"
              >
                {t(`setup.${id}`)}
              </button>
            )}
          </For>
        </div>

        <Show when={tab() === 'weechat'}>
          <div class="flex flex-col gap-2">
            <p class="text-[12px] text-gray-400">{t('setup.quickstart')}</p>
            <CopyBlock label={t('setup.password')} text={commands()[0]!} />
            <CopyBlock text={commands()[1]!} />
            <CopyBlock label={t('setup.listener')} text={commands()[2]!} />
            <CopyBlock label={t('setup.origin')} text={weechatOriginCommand(origin())} />
            <Show when={props.tls}>
              <For each={weechatTlsCertCommands()}>
                {(cmd) => <CopyBlock text={cmd} />}
              </For>
              <CopyBlock text={letsEncryptRelayPemLines().join('\n')} />
            </Show>
            <p class="text-[11px] text-gray-500">{t('setup.noApi')}</p>
            <p class="text-[10px] text-gray-600 font-mono">{t('setup.listenerName', { name: weechatListenerName(props.tls) })}</p>
          </div>
        </Show>

        <Show when={tab() === 'proxy'}>
          <div class="flex flex-col gap-2">
            <CopyBlock label={t('setup.bind')} text={weechatBindLocalhostCommand()} />
            <CopyBlock label={t('setup.listener')} text={`/relay add weechat ${props.port}`} />
            <CopyBlock label={t('setup.nginx')} text={nginxWeechatConfig(props.port, props.path)} />
            <CopyBlock label={t('setup.caddy')} text={caddyWeechatConfig(props.port, props.path)} />
          </div>
        </Show>

        <Show when={tab() === 'totp'}>
          <div class="flex flex-col gap-2">
            <For each={weechatTotpCommands()}>
              {(cmd) => <CopyBlock text={cmd} />}
            </For>
          </div>
        </Show>

        <Show when={tab() === 'onyx'}>
          <div class="flex flex-col gap-2">
            <CopyBlock label={t('connect.endpoint')} text={props.endpoint || onyxWssEndpoint()} />
            <p class="text-[11px] text-gray-500">{t('setup.sasl')}</p>
            <p class="text-[11px] text-gray-500">{t('setup.noStarttls')}</p>
            <p class="text-[11px] text-gray-500">{t('setup.wssSubprotocols')}</p>
          </div>
        </Show>

        <Show when={tab() === 'tls'}>
          <div class="flex flex-col gap-2">
            <p class="text-[12px] text-gray-400">{t('setup.tlsBody')}</p>
            <CopyBlock label={t('setup.tlsPort')} text={onyxTlsEndpoint()} />
            <p class="text-[11px] text-gray-500">{t('setup.noStarttls')}</p>
            <p class="text-[11px] text-gray-500">{t('setup.plainIrc')}</p>
          </div>
        </Show>
      </div>
    </Show>
  );
}
