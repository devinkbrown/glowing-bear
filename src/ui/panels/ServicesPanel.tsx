// ServicesPanel — orochi services modal (Account / Channel / Memo tabs).
//
// Orochi has no pseudo-clients: services are real server commands sent raw
// (via /quote) to the active server buffer. The command surface here follows
// docs/OROCHI_PROTOCOL.md §7:
//   REGISTER <account> <email|*> <password> · VERIFY <token>
//   IDENTIFY [account] <password> · LOGOUT · ACCOUNTINFO [account]
//   ACCOUNTSET <account> <password> <email|flags|secure|enforce> <value>
//   GHOST <nick> <password> · RECOVER <nick> · RELEASE <nick>
//   DROP <account> <password> · CERTADD / CERTLIST / CERTDEL <fp>
//   VHOST USE|OFF|CLAIM|REQUEST|LIST · TOTP ENROLL|CONFIRM|DISABLE|STATUS
//   CHANNEL REGISTER|INFO|AKICK|DROP <#chan> … (SET/ACCESS/TRANSFER via raw row)
//   TEGAMI LIST|CLEAR|SEND <account> :<msg>

import { createSignal, createUniqueId, For, Show } from 'solid-js';
import type { JSX } from 'solid-js';
import {
  buffersState,
  clearServiceFeedback,
  ircxState,
  recordServiceFeedback,
  sendTo,
} from '@/state';
import { formatNumber, t } from '@/lib/i18n';
import { isImeComposing } from '@/primitives/ime';
import Modal from '@/ui/bits/Modal';

type ServicesTab = 'account' | 'channel' | 'memo';
const SERVICES_TABS: readonly ServicesTab[] = ['account', 'channel', 'memo'];
const MAX_SERVICE_COMMAND_LENGTH = 2_048;

/**
 * Send a raw command (via /quote) to the server buffer of the active buffer.
 * Mirrors the state layer's internal server-buffer routing.
 */
function sendRaw(cmd: string): boolean {
  const active = buffersState.activeBuffer;
  if (!active) return false;
  const entry = buffersState.buffers[active];
  if (!entry) return false;
  const serverName = entry.buffer.localVars['server'] ?? entry.buffer.localVars['network'] ?? '';
  const command = cmd.trim();
  const invalid = command.length > MAX_SERVICE_COMMAND_LENGTH || /[\u0000-\u001f\u007f]/.test(command);
  if (!command || invalid) {
    if (serverName && invalid) {
      const verb = /^[a-z][a-z\d-]{0,31}/i.exec(command)?.[0]?.toUpperCase() ?? 'SERVICES';
      recordServiceFeedback(serverName, {
        kind: 'error',
        command: verb,
        code: 'CLIENT_INVALID_INPUT',
        message: command.length > MAX_SERVICE_COMMAND_LENGTH
          ? t('services.commandTooLong', { count: formatNumber(MAX_SERVICE_COMMAND_LENGTH) })
          : t('services.commandControls'),
      });
    }
    return false;
  }

  const dispatch = (bufferPointer: string): boolean => {
    if (sendTo(bufferPointer, `/quote ${command}`)) return true;
    if (serverName) {
      const verb = /^[a-z][a-z\d-]{0,31}/i.exec(command)?.[0]?.toUpperCase() ?? 'SERVICES';
      recordServiceFeedback(serverName, {
        kind: 'error',
        command: verb,
        code: 'CLIENT_NOT_CONNECTED',
        message: t('services.clientNotConnected'),
      });
    }
    return false;
  };

  if (entry.buffer.localVars['type'] === 'server') {
    return dispatch(entry.buffer.id);
  }
  for (const e of Object.values(buffersState.buffers)) {
    if (e.buffer.localVars['type'] === 'server') {
      const sn = e.buffer.localVars['server'] ?? e.buffer.localVars['network'] ?? '';
      if (sn === serverName) {
        return dispatch(e.buffer.id);
      }
    }
  }
  return false;
}

function memoLine(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function activeServerName(): string {
  const active = buffersState.activeBuffer;
  if (!active) return '';
  const entry = buffersState.buffers[active];
  if (!entry) return '';
  return entry.buffer.localVars['server'] ?? entry.buffer.localVars['network'] ?? '';
}

interface Props {
  open?: boolean;
  onClose: () => void;
}

export default function ServicesPanel(props: Props) {
  const initial: ServicesTab =
    ircxState.servicesPanel === 'chan' ? 'channel'
    : ircxState.servicesPanel === 'memo' ? 'memo'
    : 'account';
  const [tab, setTab] = createSignal<ServicesTab>(initial);
  const tabGroupId = createUniqueId();
  const tabRefs: Partial<Record<ServicesTab, HTMLButtonElement>> = {};
  let scrollRegion: HTMLDivElement | undefined;

  const tabId = (value: ServicesTab): string => `${tabGroupId}-tab-${value}`;
  const panelId = (value: ServicesTab): string => `${tabGroupId}-panel-${value}`;
  const selectTab = (value: ServicesTab, focus = false): void => {
    setTab(value);
    queueMicrotask(() => {
      scrollRegion?.scrollTo?.({ top: 0 });
      if (focus) tabRefs[value]?.focus();
    });
  };
  const onTabKeyDown = (
    current: ServicesTab,
    event: KeyboardEvent & { currentTarget: HTMLButtonElement },
  ): void => {
    if (isImeComposing(event)) return;
    const index = SERVICES_TABS.indexOf(current);
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl' || document.documentElement.dir === 'rtl';
    let nextIndex: number | undefined;
    if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = SERVICES_TABS.length - 1;
    else if (event.key === 'ArrowLeft') nextIndex = index + (rtl ? 1 : -1);
    else if (event.key === 'ArrowRight') nextIndex = index + (rtl ? -1 : 1);
    if (nextIndex === undefined) return;
    event.preventDefault();
    const wrapped = (nextIndex + SERVICES_TABS.length) % SERVICES_TABS.length;
    selectTab(SERVICES_TABS[wrapped]!, true);
  };

  return (
    <Modal open={props.open ?? true} onClose={props.onClose} title={t('services.title')} wide>
      <div
        ref={(element) => (scrollRegion = element)}
        data-testid="services-scroll-region"
        class="max-h-[calc(85dvh-57px)] overflow-y-auto overflow-x-hidden overscroll-contain"
      >
        <div
          role="tablist"
          aria-label={t('services.title')}
          aria-orientation="horizontal"
          class="sticky top-0 z-10 flex max-w-full overflow-x-auto border-b border-white/[0.06] bg-gray-900"
        >
          <TabBtn
            ref={(element) => { tabRefs.account = element; }}
            id={tabId('account')}
            controls={panelId('account')}
            active={tab() === 'account'}
            onClick={() => selectTab('account')}
            onKeyDown={(event) => onTabKeyDown('account', event)}
          >
            {t('services.account')}
          </TabBtn>
          <TabBtn
            ref={(element) => { tabRefs.channel = element; }}
            id={tabId('channel')}
            controls={panelId('channel')}
            active={tab() === 'channel'}
            onClick={() => selectTab('channel')}
            onKeyDown={(event) => onTabKeyDown('channel', event)}
          >
            {t('services.channel')}
          </TabBtn>
          <TabBtn
            ref={(element) => { tabRefs.memo = element; }}
            id={tabId('memo')}
            controls={panelId('memo')}
            active={tab() === 'memo'}
            onClick={() => selectTab('memo')}
            onKeyDown={(event) => onTabKeyDown('memo', event)}
          >
            {t('services.memo')}
          </TabBtn>
        </div>

        <div class="px-4 pt-4 sm:px-5">
          <ServiceReplyLog serverName={activeServerName()} />
        </div>
        <section
          id={panelId('account')}
          role="tabpanel"
          aria-labelledby={tabId('account')}
          hidden={tab() !== 'account'}
          class="min-w-0 px-4 pb-4 sm:px-5"
        >
          <AccountTab />
        </section>
        <section
          id={panelId('channel')}
          role="tabpanel"
          aria-labelledby={tabId('channel')}
          hidden={tab() !== 'channel'}
          class="min-w-0 px-4 pb-4 sm:px-5"
        >
          <ChannelTab />
        </section>
        <section
          id={panelId('memo')}
          role="tabpanel"
          aria-labelledby={tabId('memo')}
          hidden={tab() !== 'memo'}
          class="min-w-0 px-4 pb-4 sm:px-5"
        >
          <MemoTab />
        </section>
      </div>
    </Modal>
  );
}

function ServiceReplyLog(props: { serverName: string }): JSX.Element {
  const replies = () => ircxState.serviceFeedback
    .filter((entry) => entry.serverName === props.serverName)
    .slice(-4)
    .reverse();

  return (
    <Show when={replies().length > 0}>
      <section
        aria-label={t('services.recentRepliesLabel')}
        role="log"
        aria-live="polite"
        class="mb-4 rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden"
      >
        <div class="flex items-center justify-between px-3 py-2 border-b border-white/[0.05]">
          <h4 class="text-[10px] font-bold uppercase tracking-wider text-gray-400">{t('services.recentReplies')}</h4>
          <button
            type="button"
            onClick={() => clearServiceFeedback(props.serverName)}
            class="text-[10px] text-gray-400 hover:text-gray-200 transition-colors"
          >
            {t('services.clear')}
          </button>
        </div>
        <div class="divide-y divide-white/[0.04]">
          <For each={replies()}>
            {(reply) => (
              <div
                class={`flex items-start gap-2 px-3 py-2 text-[11px] ${
                  reply.kind === 'error' ? 'text-red-300'
                    : reply.kind === 'warning' ? 'text-amber-300'
                      : reply.kind === 'success' ? 'text-emerald-300'
                        : 'text-gray-300'
                }`}
              >
                <span class="font-mono font-semibold shrink-0">{reply.command}</span>
                <span class="text-gray-400 break-words min-w-0">{reply.message}</span>
              </div>
            )}
          </For>
        </div>
      </section>
    </Show>
  );
}

// ---------------------------------------------------------------------------
// Account tab
// ---------------------------------------------------------------------------

const ACCOUNTSET_KEYS = ['email', 'flags', 'secure', 'enforce'] as const;
const VHOST_SUBS = ['USE', 'OFF', 'CLAIM', 'REQUEST', 'LIST'] as const;

function AccountTab(): JSX.Element {
  const [regAccount, setRegAccount] = createSignal('');
  const [regEmail, setRegEmail] = createSignal('');
  const [regPass, setRegPass] = createSignal('');
  const [verifyToken, setVerifyToken] = createSignal('');
  const [identAccount, setIdentAccount] = createSignal('');
  const [identPass, setIdentPass] = createSignal('');
  const [infoAccount, setInfoAccount] = createSignal('');
  const [setAccount, setSetAccount] = createSignal('');
  const [setPass, setSetPass] = createSignal('');
  const [setKey, setSetKey] = createSignal('');
  const [setVal, setSetVal] = createSignal('');
  const [expanded, setExpanded] = createSignal<string | null>(null);
  const [ghostNick, setGhostNick] = createSignal('');
  const [ghostPass, setGhostPass] = createSignal('');
  const [recoverNick, setRecoverNick] = createSignal('');
  const [certFp, setCertFp] = createSignal('');
  const [vhostSub, setVhostSub] = createSignal<string>('USE');
  const [vhostArg, setVhostArg] = createSignal('');
  const [totpCode, setTotpCode] = createSignal('');
  const [dropAccount, setDropAccount] = createSignal('');
  const [dropPass, setDropPass] = createSignal('');

  const toggle = (key: string): void => { setExpanded(expanded() === key ? null : key); };

  return (
    <div class="space-y-4">
      <Section title={t('services.register')}>
        <div class="space-y-2">
          <Input placeholder={t('services.accountName')} value={regAccount()} onChange={setRegAccount} />
          <Input placeholder={t('services.emailOptional')} value={regEmail()} onChange={setRegEmail} />
          <div class="flex gap-2">
            <Input placeholder={t('services.password')} type="password" autocomplete="new-password" value={regPass()} onChange={setRegPass} flex />
            <Btn
              label={t('services.register')}
              disabled={!regAccount() || !regPass()}
              onClick={() => {
                if (sendRaw(`REGISTER ${regAccount()} ${regEmail().trim() || '*'} ${regPass()}`)) setRegPass('');
              }}
            />
          </div>
          <div class="flex gap-2">
            <Input placeholder={t('services.verificationToken')} autocomplete="one-time-code" value={verifyToken()} onChange={setVerifyToken} flex />
            <Btn label={t('services.verify')} disabled={!verifyToken()} onClick={() => {
              if (sendRaw(`VERIFY ${verifyToken()}`)) setVerifyToken('');
            }} />
          </div>
        </div>
      </Section>

      <Section title={t('services.identify')}>
        <div class="space-y-2">
          <Input placeholder={t('services.accountCurrentNick')} value={identAccount()} onChange={setIdentAccount} />
          <div class="flex gap-2">
            <Input placeholder={t('services.password')} type="password" autocomplete="current-password" value={identPass()} onChange={setIdentPass} flex />
            <Btn
              label={t('services.identify')}
              disabled={!identPass()}
              onClick={() => {
                const sent = sendRaw(identAccount() ? `IDENTIFY ${identAccount()} ${identPass()}` : `IDENTIFY ${identPass()}`);
                if (sent) setIdentPass('');
              }}
            />
          </div>
          <div class="flex flex-wrap gap-2">
            <SmallBtn label={t('services.logout')} onClick={() => sendRaw('LOGOUT')} />
            <SmallBtn label={t('services.saslInfo')} onClick={() => sendRaw('SASLINFO')} />
          </div>
        </div>
      </Section>

      <Section title={t('services.info')}>
        <div class="flex gap-2">
          <Input placeholder={t('services.accountSelf')} value={infoAccount()} onChange={setInfoAccount} flex />
          <Btn label={t('services.info')} onClick={() => sendRaw(infoAccount() ? `ACCOUNTINFO ${infoAccount()}` : 'ACCOUNTINFO')} />
        </div>
      </Section>

      <Section title={t('services.accountSettings')}>
        <div class="space-y-2">
          <div class="flex gap-2">
            <Input placeholder={t('services.accountField')} value={setAccount()} onChange={setSetAccount} flex />
            <Input placeholder={t('services.password')} type="password" autocomplete="current-password" value={setPass()} onChange={setSetPass} flex />
          </div>
          <div class="flex gap-2">
            <select
              aria-label={t('services.accountSetting')}
              value={setKey()}
              onChange={(e) => setSetKey(e.currentTarget.value)}
              class="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-md text-[12px] text-gray-200 px-2.5 py-1.5 outline-none focus:border-[var(--custom-accent,#818cf8)]/40 transition-colors"
            >
              <option value="">{t('services.selectSetting')}</option>
              <For each={[...ACCOUNTSET_KEYS]}>
                {(k) => <option value={k}>{k}</option>}
              </For>
            </select>
            <Input placeholder={t('services.value')} value={setVal()} onChange={setSetVal} flex />
          </div>
          <Btn
            label={t('services.set')}
            disabled={!setAccount() || !setPass() || !setKey() || !setVal()}
            onClick={() => {
              if (sendRaw(`ACCOUNTSET ${setAccount()} ${setPass()} ${setKey()} ${setVal()}`)) setSetPass('');
            }}
          />
          <p class="text-[10px] text-gray-400 px-1">{t('services.accountSettingsHint')}</p>
        </div>
      </Section>

      <Section title={t('services.nickTools')}>
        <div class="space-y-2">
          <div class="flex flex-wrap gap-2">
            <SmallBtn label={t('services.ghost')} active={expanded() === 'ghost'} onClick={() => toggle('ghost')} />
            <SmallBtn label={t('services.recover')} active={expanded() === 'recover'} onClick={() => toggle('recover')} />
            <SmallBtn label={t('services.release')} active={expanded() === 'release'} onClick={() => toggle('release')} />
            <SmallBtn label={t('services.group')} onClick={() => sendRaw('GROUP')} />
          </div>

          <Show when={expanded() === 'ghost'}>
            <InlineForm onCancel={() => { setExpanded(null); setGhostNick(''); setGhostPass(''); }}>
              <Input placeholder={t('services.nickToGhost')} value={ghostNick()} onChange={setGhostNick} flex />
              <Input placeholder={t('services.password')} type="password" autocomplete="current-password" value={ghostPass()} onChange={setGhostPass} flex />
              <Btn
                label={t('services.ghost')}
                disabled={!ghostNick() || !ghostPass()}
                onClick={() => {
                  if (sendRaw(`GHOST ${ghostNick()} ${ghostPass()}`)) {
                    setGhostNick(''); setGhostPass(''); setExpanded(null);
                  }
                }}
              />
            </InlineForm>
          </Show>

          <Show when={expanded() === 'recover'}>
            <InlineForm onCancel={() => { setExpanded(null); setRecoverNick(''); }}>
              <Input placeholder={t('services.nickToRecover')} value={recoverNick()} onChange={setRecoverNick} flex />
              <Btn
                label={t('services.recover')}
                disabled={!recoverNick()}
                onClick={() => {
                  if (sendRaw(`RECOVER ${recoverNick()}`)) {
                    setRecoverNick(''); setExpanded(null);
                  }
                }}
              />
            </InlineForm>
          </Show>

          <Show when={expanded() === 'release'}>
            <InlineForm onCancel={() => { setExpanded(null); setRecoverNick(''); }}>
              <Input placeholder={t('services.nickToRelease')} value={recoverNick()} onChange={setRecoverNick} flex />
              <Btn
                label={t('services.release')}
                disabled={!recoverNick()}
                onClick={() => {
                  if (sendRaw(`RELEASE ${recoverNick()}`)) {
                    setRecoverNick(''); setExpanded(null);
                  }
                }}
              />
            </InlineForm>
          </Show>
        </div>
      </Section>

      <Section title={t('services.certificates')}>
        <div class="space-y-2">
          <div class="flex flex-wrap gap-2">
            <SmallBtn label={t('services.addCurrentCert')} onClick={() => sendRaw('CERTADD')} />
            <SmallBtn label={t('services.listCerts')} onClick={() => sendRaw('CERTLIST')} />
          </div>
          <div class="flex gap-2">
            <Input placeholder={t('services.fingerprintRemove')} value={certFp()} onChange={setCertFp} flex />
            <DangerBtn label={t('services.remove')} disabled={!certFp()} onClick={() => {
              if (sendRaw(`CERTDEL ${certFp()}`)) setCertFp('');
            }} />
          </div>
        </div>
      </Section>

      <Section title={t('services.vhost')}>
        <div class="flex gap-2">
          <select
            aria-label={t('services.vhostAction')}
            value={vhostSub()}
            onChange={(e) => setVhostSub(e.currentTarget.value)}
            class="bg-white/[0.04] border border-white/[0.08] rounded-md text-[12px] text-gray-200 px-2.5 py-1.5 outline-none focus:border-[var(--custom-accent,#818cf8)]/40 transition-colors"
          >
            <For each={[...VHOST_SUBS]}>
              {(s) => <option value={s}>{s}</option>}
            </For>
          </select>
          <Input placeholder={t('services.hostOptional')} value={vhostArg()} onChange={setVhostArg} flex />
          <Btn
            label={t('services.send')}
            onClick={() => sendRaw(vhostArg().trim() ? `VHOST ${vhostSub()} ${vhostArg().trim()}` : `VHOST ${vhostSub()}`)}
          />
        </div>
      </Section>

      <Section title={t('services.twoFactor')}>
        <div class="space-y-2">
          <div class="flex flex-wrap gap-2">
            <SmallBtn label={t('services.enroll')} onClick={() => sendRaw('TOTP ENROLL')} />
            <SmallBtn label={t('services.status')} onClick={() => sendRaw('TOTP STATUS')} />
            <SmallBtn label={t('services.disable')} danger active={expanded() === 'totp-disable'} onClick={() => toggle('totp-disable')} />
          </div>
          <div class="flex gap-2">
            <Input placeholder={t('services.totpCode')} autocomplete="one-time-code" inputmode="numeric" value={totpCode()} onChange={setTotpCode} flex />
            <Btn label={t('services.confirm')} disabled={!totpCode()} onClick={() => {
              if (sendRaw(`TOTP CONFIRM ${totpCode()}`)) setTotpCode('');
            }} />
          </div>
          <Show when={expanded() === 'totp-disable'}>
            <ConfirmForm
              message={t('services.disableTotpConfirm')}
              onConfirm={() => { if (sendRaw('TOTP DISABLE')) setExpanded(null); }}
              onCancel={() => setExpanded(null)}
            />
          </Show>
        </div>
      </Section>

      <Section title={t('services.dangerZone')}>
        <div class="space-y-2">
          <div class="flex flex-wrap gap-2">
            <SmallBtn label={t('services.dropAccount')} danger active={expanded() === 'drop'} onClick={() => toggle('drop')} />
          </div>
          <Show when={expanded() === 'drop'}>
            <div class="space-y-2">
              <div class="flex gap-2">
                <Input placeholder={t('services.accountField')} value={dropAccount()} onChange={setDropAccount} flex />
                <Input placeholder={t('services.password')} type="password" autocomplete="current-password" value={dropPass()} onChange={setDropPass} flex />
              </div>
              <ConfirmForm
                message={t('services.deleteAccountConfirm', { account: dropAccount() || '...' })}
                confirmDisabled={!dropAccount() || !dropPass()}
                onConfirm={() => {
                  if (sendRaw(`DROP ${dropAccount()} ${dropPass()}`)) {
                    setDropAccount(''); setDropPass(''); setExpanded(null);
                  }
                }}
                onCancel={() => setExpanded(null)}
              />
            </div>
          </Show>
        </div>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Channel tab
// ---------------------------------------------------------------------------

function ChannelTab(): JSX.Element {
  const [regChan, setRegChan] = createSignal('');
  const [infoChan, setInfoChan] = createSignal('');
  const [akickChan, setAkickChan] = createSignal('');
  const [akickAction, setAkickAction] = createSignal<string>('LIST');
  const [akickMask, setAkickMask] = createSignal('');
  const [dropChan, setDropChan] = createSignal('');
  const [rawArgs, setRawArgs] = createSignal('');
  const [expanded, setExpanded] = createSignal<string | null>(null);

  const toggle = (key: string): void => { setExpanded(expanded() === key ? null : key); };

  return (
    <div class="space-y-4">
      <Section title={t('services.registerChannel')}>
        <div class="flex gap-2">
          <Input placeholder={t('services.channelField')} value={regChan()} onChange={setRegChan} flex />
          <Btn label={t('services.register')} disabled={!regChan()} onClick={() => sendRaw(`CHANNEL REGISTER ${regChan()}`)} />
        </div>
      </Section>

      <Section title={t('services.channelInfo')}>
        <div class="flex gap-2">
          <Input placeholder={t('services.channelField')} value={infoChan()} onChange={setInfoChan} flex />
          <Btn label={t('services.info')} disabled={!infoChan()} onClick={() => sendRaw(`CHANNEL INFO ${infoChan()}`)} />
        </div>
      </Section>

      <Section title={t('services.autoKick')}>
        <div class="space-y-2">
          <div class="flex gap-2">
            <Input placeholder={t('services.channelField')} value={akickChan()} onChange={setAkickChan} flex />
            <select
              aria-label={t('services.autoKickAction')}
              value={akickAction()}
              onChange={(e) => setAkickAction(e.currentTarget.value)}
              class="bg-white/[0.04] border border-white/[0.08] rounded-md text-[12px] text-gray-200 px-2.5 py-1.5 outline-none focus:border-[var(--custom-accent,#818cf8)]/40 transition-colors"
            >
              <option value="LIST">LIST</option>
              <option value="ADD">ADD</option>
              <option value="DEL">DEL</option>
            </select>
          </div>
          <div class="flex gap-2">
            <Input placeholder={t('services.maskAddDelete')} value={akickMask()} onChange={setAkickMask} flex />
            <Btn
              label={t('services.send')}
              disabled={!akickChan() || (akickAction() !== 'LIST' && !akickMask())}
              onClick={() => {
                const suffix = akickAction() === 'LIST' ? '' : ` ${akickMask().trim()}`;
                sendRaw(`CHANNEL AKICK ${akickChan()} ${akickAction()}${suffix}`);
              }}
            />
          </div>
        </div>
      </Section>

      <Section title={t('services.rawChannel')}>
        <div class="space-y-2">
          <p class="text-[10px] text-gray-400 px-1">{t('services.rawChannelHint')}</p>
          <div class="flex gap-2">
            <Input placeholder={t('services.rawChannelPlaceholder')} value={rawArgs()} onChange={setRawArgs} flex />
            <Btn label={t('services.send')} disabled={!rawArgs().trim()} onClick={() => {
              if (sendRaw(`CHANNEL ${rawArgs().trim()}`)) setRawArgs('');
            }} />
          </div>
        </div>
      </Section>

      <Section title={t('services.dangerZone')}>
        <div class="space-y-2">
          <div class="flex flex-wrap gap-2">
            <SmallBtn label={t('services.dropChannel')} danger active={expanded() === 'drop'} onClick={() => toggle('drop')} />
          </div>
          <Show when={expanded() === 'drop'}>
            <div class="space-y-2">
              <Input placeholder={t('services.channelToDrop')} value={dropChan()} onChange={setDropChan} />
              <ConfirmForm
                message={t('services.dropChannelConfirm', { channel: dropChan() || '...' })}
                confirmDisabled={!dropChan()}
                onConfirm={() => {
                  if (sendRaw(`CHANNEL DROP ${dropChan()}`)) {
                    setDropChan(''); setExpanded(null);
                  }
                }}
                onCancel={() => setExpanded(null)}
              />
            </div>
          </Show>
        </div>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Memo tab (TEGAMI — offline account messages)
// ---------------------------------------------------------------------------

function MemoTab(): JSX.Element {
  const [sendTarget, setSendTarget] = createSignal('');
  const [sendText, setSendText] = createSignal('');
  const [confirmClear, setConfirmClear] = createSignal(false);

  return (
    <div class="space-y-4">
      <Section title={t('services.sendMemo')}>
        <div class="space-y-2">
          <Input placeholder={t('services.recipientAccount')} value={sendTarget()} onChange={setSendTarget} />
          <textarea
            aria-label={t('services.memoMessage')}
            value={sendText()}
            onInput={(e) => setSendText(e.currentTarget.value)}
            placeholder={t('services.memoMessage')}
            rows={3}
            class="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg text-[12px] text-gray-200 px-3 py-2 outline-none focus:border-[var(--custom-accent,#818cf8)]/40 placeholder-gray-600 resize-none"
          />
          <Btn
            label={t('services.send')}
            disabled={!sendTarget() || !sendText()}
            onClick={() => {
              const message = memoLine(sendText());
              if (message && sendRaw(`TEGAMI SEND ${sendTarget()} :${message}`)) setSendText('');
            }}
          />
          <p class="text-[10px] text-gray-400 px-1">{t('services.memoDeliveryHint')}</p>
        </div>
      </Section>

      <Section title={t('services.inbox')}>
        <div class="space-y-2">
          <div class="flex flex-wrap gap-2">
            <SmallBtn label={t('services.list')} onClick={() => sendRaw('TEGAMI LIST')} />
            <SmallBtn label={t('services.clearAll')} danger active={confirmClear()} onClick={() => setConfirmClear(!confirmClear())} />
          </div>
          <Show when={confirmClear()}>
            <ConfirmForm
              message={t('services.clearMemosConfirm')}
              onConfirm={() => { if (sendRaw('TEGAMI CLEAR')) setConfirmClear(false); }}
              onCancel={() => setConfirmClear(false)}
            />
          </Show>
        </div>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function Section(props: { title: string; children: JSX.Element }): JSX.Element {
  return (
    <div class="bg-white/[0.01] border border-white/[0.04] rounded-xl p-3">
      <h4 class="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2.5">{props.title}</h4>
      {props.children}
    </div>
  );
}

function Input(props: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  flex?: boolean;
  autocomplete?: string;
  inputmode?: JSX.InputHTMLAttributes<HTMLInputElement>['inputmode'];
  ariaLabel?: string;
}): JSX.Element {
  return (
    <input
      type={props.type ?? 'text'}
      value={props.value}
      onInput={(e) => props.onChange(e.currentTarget.value)}
      placeholder={props.placeholder}
      autocomplete={props.autocomplete ?? 'off'}
      inputmode={props.inputmode}
      aria-label={props.ariaLabel ?? props.placeholder}
      class={`${props.flex ? 'flex-1 min-w-0' : 'w-full'} bg-white/[0.04] border border-white/[0.08] rounded-md text-[12px] text-gray-200 px-2.5 py-1.5 outline-none focus:border-[var(--custom-accent,#818cf8)]/40 placeholder-gray-600 transition-colors`}
    />
  );
}

function Btn(props: { label: string; onClick: () => void; disabled?: boolean }): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => props.onClick()}
      disabled={props.disabled}
      class="text-[11px] font-medium bg-[var(--custom-accent,#818cf8)]/[0.1] text-[var(--custom-accent,#818cf8)] hover:bg-[var(--custom-accent,#818cf8)]/[0.2] px-4 py-1.5 rounded-md transition-colors shrink-0 disabled:opacity-30 disabled:pointer-events-none"
    >
      {props.label}
    </button>
  );
}

function DangerBtn(props: { label: string; onClick: () => void; disabled?: boolean }): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => props.onClick()}
      disabled={props.disabled}
      class="text-[11px] font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 px-4 py-1.5 rounded-md transition-colors shrink-0 disabled:opacity-30 disabled:pointer-events-none"
    >
      {props.label}
    </button>
  );
}

function SmallBtn(props: { label: string; onClick: () => void; danger?: boolean; active?: boolean }): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => props.onClick()}
      class={`text-[11px] font-medium px-3 py-1.5 rounded-lg transition-colors
        ${props.danger
          ? props.active ? 'bg-red-500/20 text-red-300 ring-1 ring-red-500/30' : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
          : props.active ? 'bg-[var(--custom-accent,#818cf8)]/[0.15] text-[var(--custom-accent,#818cf8)] ring-1 ring-[var(--custom-accent,#818cf8)]/30' : 'bg-white/[0.03] text-gray-400 hover:bg-white/[0.06] hover:text-gray-200'}`}
    >
      {props.label}
    </button>
  );
}

function InlineForm(props: { children: JSX.Element; onCancel: () => void }): JSX.Element {
  return (
    <div class="flex items-center gap-2 bg-white/[0.02] rounded-lg px-3 py-2 border border-white/[0.06]">
      {props.children}
      <button type="button" onClick={() => props.onCancel()} class="text-[10px] text-gray-400 hover:text-gray-200 px-1.5 shrink-0">{t('services.cancel')}</button>
    </div>
  );
}

function ConfirmForm(props: {
  message: string; onConfirm: () => void; onCancel: () => void; confirmDisabled?: boolean;
}): JSX.Element {
  return (
    <div class="flex items-center gap-3 bg-red-500/[0.04] rounded-lg px-3 py-2.5 border border-red-500/[0.12]">
      <span class="text-[11px] text-gray-300 flex-1">{props.message}</span>
      <button
        type="button"
        onClick={() => props.onConfirm()}
        disabled={props.confirmDisabled}
        class="text-[11px] font-medium text-red-400 hover:text-red-300 px-2 shrink-0 disabled:opacity-30 disabled:pointer-events-none"
      >
        {t('services.confirm')}
      </button>
      <button type="button" onClick={() => props.onCancel()} class="text-[11px] text-gray-400 hover:text-gray-200 px-1.5 shrink-0">{t('services.cancel')}</button>
    </div>
  );
}

function TabBtn(props: {
  ref: (element: HTMLButtonElement) => void;
  id: string;
  controls: string;
  active: boolean;
  onClick: () => void;
  onKeyDown: (event: KeyboardEvent & { currentTarget: HTMLButtonElement }) => void;
  children: JSX.Element;
}): JSX.Element {
  return (
    <button
      ref={props.ref}
      id={props.id}
      type="button"
      role="tab"
      aria-selected={props.active}
      aria-controls={props.controls}
      tabindex={props.active ? 0 : -1}
      onClick={() => props.onClick()}
      onKeyDown={(event) => props.onKeyDown(event)}
      class={`shrink-0 whitespace-nowrap px-4 py-2.5 text-[12px] font-medium transition-all border-b-2 -mb-px
        ${props.active
          ? 'text-gray-100 border-[var(--custom-accent,#818cf8)]'
          : 'text-gray-400 border-transparent hover:text-gray-200 hover:border-white/[0.06]'}`}
    >
      {props.children}
    </button>
  );
}
