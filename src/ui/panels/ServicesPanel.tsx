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

import { createSignal, For, Show } from 'solid-js';
import type { JSX } from 'solid-js';
import { buffersState, ircxState, sendTo } from '@/state';
import Modal from '@/ui/bits/Modal';

type ServicesTab = 'account' | 'channel' | 'memo';

/**
 * Send a raw command (via /quote) to the server buffer of the active buffer.
 * Mirrors the state layer's internal server-buffer routing.
 */
function sendRaw(cmd: string): void {
  const active = buffersState.activeBuffer;
  if (!active) return;
  const entry = buffersState.buffers[active];
  if (!entry) return;

  if (entry.buffer.localVars['type'] === 'server') {
    sendTo(entry.buffer.id, `/quote ${cmd}`);
    return;
  }
  const serverName = entry.buffer.localVars['server'] ?? '';
  for (const e of Object.values(buffersState.buffers)) {
    if (e.buffer.localVars['type'] === 'server') {
      const sn = e.buffer.localVars['server'] ?? e.buffer.localVars['network'] ?? '';
      if (sn === serverName) {
        sendTo(e.buffer.id, `/quote ${cmd}`);
        return;
      }
    }
  }
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

  return (
    <Modal open={props.open ?? true} onClose={props.onClose} title="Services" wide>
      <div>
        <div class="flex border-b border-white/[0.06] mb-4">
          <TabBtn active={tab() === 'account'} onClick={() => setTab('account')}>Account</TabBtn>
          <TabBtn active={tab() === 'channel'} onClick={() => setTab('channel')}>Channel</TabBtn>
          <TabBtn active={tab() === 'memo'} onClick={() => setTab('memo')}>Memo</TabBtn>
        </div>

        <div class="px-4 sm:px-5 pb-4">
          <Show when={tab() === 'account'}><AccountTab /></Show>
          <Show when={tab() === 'channel'}><ChannelTab /></Show>
          <Show when={tab() === 'memo'}><MemoTab /></Show>
        </div>
      </div>
    </Modal>
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
      <Section title="Register">
        <div class="space-y-2">
          <Input placeholder="Account name" value={regAccount()} onChange={setRegAccount} />
          <Input placeholder="Email (blank = none)" value={regEmail()} onChange={setRegEmail} />
          <div class="flex gap-2">
            <Input placeholder="Password" type="password" value={regPass()} onChange={setRegPass} flex />
            <Btn
              label="Register"
              disabled={!regAccount() || !regPass()}
              onClick={() => sendRaw(`REGISTER ${regAccount()} ${regEmail().trim() || '*'} ${regPass()}`)}
            />
          </div>
          <div class="flex gap-2">
            <Input placeholder="Verification token" value={verifyToken()} onChange={setVerifyToken} flex />
            <Btn label="Verify" disabled={!verifyToken()} onClick={() => { sendRaw(`VERIFY ${verifyToken()}`); setVerifyToken(''); }} />
          </div>
        </div>
      </Section>

      <Section title="Identify">
        <div class="space-y-2">
          <Input placeholder="Account (blank = current nick)" value={identAccount()} onChange={setIdentAccount} />
          <div class="flex gap-2">
            <Input placeholder="Password" type="password" value={identPass()} onChange={setIdentPass} flex />
            <Btn
              label="Identify"
              disabled={!identPass()}
              onClick={() => sendRaw(identAccount() ? `IDENTIFY ${identAccount()} ${identPass()}` : `IDENTIFY ${identPass()}`)}
            />
          </div>
          <div class="flex flex-wrap gap-2">
            <SmallBtn label="Logout" onClick={() => sendRaw('LOGOUT')} />
            <SmallBtn label="SASL Info" onClick={() => sendRaw('SASLINFO')} />
          </div>
        </div>
      </Section>

      <Section title="Info">
        <div class="flex gap-2">
          <Input placeholder="Account (blank = self)" value={infoAccount()} onChange={setInfoAccount} flex />
          <Btn label="Info" onClick={() => sendRaw(infoAccount() ? `ACCOUNTINFO ${infoAccount()}` : 'ACCOUNTINFO')} />
        </div>
      </Section>

      <Section title="Account Settings">
        <div class="space-y-2">
          <div class="flex gap-2">
            <Input placeholder="Account" value={setAccount()} onChange={setSetAccount} flex />
            <Input placeholder="Password" type="password" value={setPass()} onChange={setSetPass} flex />
          </div>
          <div class="flex gap-2">
            <select
              value={setKey()}
              onChange={(e) => setSetKey(e.currentTarget.value)}
              class="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-md text-[12px] text-gray-200 px-2.5 py-1.5 outline-none focus:border-[var(--custom-accent,#818cf8)]/40 transition-colors"
            >
              <option value="">Select setting...</option>
              <For each={[...ACCOUNTSET_KEYS]}>
                {(k) => <option value={k}>{k}</option>}
              </For>
            </select>
            <Input placeholder="Value" value={setVal()} onChange={setSetVal} flex />
          </div>
          <Btn
            label="Set"
            disabled={!setAccount() || !setPass() || !setKey() || !setVal()}
            onClick={() => sendRaw(`ACCOUNTSET ${setAccount()} ${setPass()} ${setKey()} ${setVal()}`)}
          />
          <p class="text-[10px] text-gray-500 px-1">secure on = only recognized via identify · enforce on = nick protection</p>
        </div>
      </Section>

      <Section title="Nick Tools">
        <div class="space-y-2">
          <div class="flex flex-wrap gap-2">
            <SmallBtn label="Ghost" active={expanded() === 'ghost'} onClick={() => toggle('ghost')} />
            <SmallBtn label="Recover" active={expanded() === 'recover'} onClick={() => toggle('recover')} />
            <SmallBtn label="Release" active={expanded() === 'release'} onClick={() => toggle('release')} />
            <SmallBtn label="Group" onClick={() => sendRaw('GROUP')} />
          </div>

          <Show when={expanded() === 'ghost'}>
            <InlineForm onCancel={() => { setExpanded(null); setGhostNick(''); setGhostPass(''); }}>
              <Input placeholder="Nick to ghost" value={ghostNick()} onChange={setGhostNick} flex />
              <Input placeholder="Password" type="password" value={ghostPass()} onChange={setGhostPass} flex />
              <Btn
                label="Ghost"
                disabled={!ghostNick() || !ghostPass()}
                onClick={() => { sendRaw(`GHOST ${ghostNick()} ${ghostPass()}`); setGhostNick(''); setGhostPass(''); setExpanded(null); }}
              />
            </InlineForm>
          </Show>

          <Show when={expanded() === 'recover'}>
            <InlineForm onCancel={() => { setExpanded(null); setRecoverNick(''); }}>
              <Input placeholder="Nick to recover" value={recoverNick()} onChange={setRecoverNick} flex />
              <Btn
                label="Recover"
                disabled={!recoverNick()}
                onClick={() => { sendRaw(`RECOVER ${recoverNick()}`); setRecoverNick(''); setExpanded(null); }}
              />
            </InlineForm>
          </Show>

          <Show when={expanded() === 'release'}>
            <InlineForm onCancel={() => { setExpanded(null); setRecoverNick(''); }}>
              <Input placeholder="Nick to release" value={recoverNick()} onChange={setRecoverNick} flex />
              <Btn
                label="Release"
                disabled={!recoverNick()}
                onClick={() => { sendRaw(`RELEASE ${recoverNick()}`); setRecoverNick(''); setExpanded(null); }}
              />
            </InlineForm>
          </Show>
        </div>
      </Section>

      <Section title="Certificates (SASL EXTERNAL)">
        <div class="space-y-2">
          <div class="flex flex-wrap gap-2">
            <SmallBtn label="Add Current Cert" onClick={() => sendRaw('CERTADD')} />
            <SmallBtn label="List Certs" onClick={() => sendRaw('CERTLIST')} />
          </div>
          <div class="flex gap-2">
            <Input placeholder="Fingerprint to remove" value={certFp()} onChange={setCertFp} flex />
            <DangerBtn label="Remove" disabled={!certFp()} onClick={() => { sendRaw(`CERTDEL ${certFp()}`); setCertFp(''); }} />
          </div>
        </div>
      </Section>

      <Section title="VHost">
        <div class="flex gap-2">
          <select
            value={vhostSub()}
            onChange={(e) => setVhostSub(e.currentTarget.value)}
            class="bg-white/[0.04] border border-white/[0.08] rounded-md text-[12px] text-gray-200 px-2.5 py-1.5 outline-none focus:border-[var(--custom-accent,#818cf8)]/40 transition-colors"
          >
            <For each={[...VHOST_SUBS]}>
              {(s) => <option value={s}>{s}</option>}
            </For>
          </select>
          <Input placeholder="Host (if required)" value={vhostArg()} onChange={setVhostArg} flex />
          <Btn
            label="Send"
            onClick={() => sendRaw(vhostArg().trim() ? `VHOST ${vhostSub()} ${vhostArg().trim()}` : `VHOST ${vhostSub()}`)}
          />
        </div>
      </Section>

      <Section title="Two-Factor (TOTP)">
        <div class="space-y-2">
          <div class="flex flex-wrap gap-2">
            <SmallBtn label="Enroll" onClick={() => sendRaw('TOTP ENROLL')} />
            <SmallBtn label="Status" onClick={() => sendRaw('TOTP STATUS')} />
            <SmallBtn label="Disable" danger active={expanded() === 'totp-disable'} onClick={() => toggle('totp-disable')} />
          </div>
          <div class="flex gap-2">
            <Input placeholder="6-digit code" value={totpCode()} onChange={setTotpCode} flex />
            <Btn label="Confirm" disabled={!totpCode()} onClick={() => { sendRaw(`TOTP CONFIRM ${totpCode()}`); setTotpCode(''); }} />
          </div>
          <Show when={expanded() === 'totp-disable'}>
            <ConfirmForm
              message="Disable two-factor authentication?"
              onConfirm={() => { sendRaw('TOTP DISABLE'); setExpanded(null); }}
              onCancel={() => setExpanded(null)}
            />
          </Show>
        </div>
      </Section>

      <Section title="Danger Zone">
        <div class="space-y-2">
          <div class="flex flex-wrap gap-2">
            <SmallBtn label="Drop Account" danger active={expanded() === 'drop'} onClick={() => toggle('drop')} />
          </div>
          <Show when={expanded() === 'drop'}>
            <div class="space-y-2">
              <div class="flex gap-2">
                <Input placeholder="Account" value={dropAccount()} onChange={setDropAccount} flex />
                <Input placeholder="Password" type="password" value={dropPass()} onChange={setDropPass} flex />
              </div>
              <ConfirmForm
                message={`Permanently delete account ${dropAccount() || '...'}?`}
                confirmDisabled={!dropAccount() || !dropPass()}
                onConfirm={() => { sendRaw(`DROP ${dropAccount()} ${dropPass()}`); setDropAccount(''); setDropPass(''); setExpanded(null); }}
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
      <Section title="Register Channel">
        <div class="flex gap-2">
          <Input placeholder="#channel" value={regChan()} onChange={setRegChan} flex />
          <Btn label="Register" disabled={!regChan()} onClick={() => sendRaw(`CHANNEL REGISTER ${regChan()}`)} />
        </div>
      </Section>

      <Section title="Channel Info">
        <div class="flex gap-2">
          <Input placeholder="#channel" value={infoChan()} onChange={setInfoChan} flex />
          <Btn label="Info" disabled={!infoChan()} onClick={() => sendRaw(`CHANNEL INFO ${infoChan()}`)} />
        </div>
      </Section>

      <Section title="Auto-Kick (AKICK)">
        <div class="space-y-2">
          <div class="flex gap-2">
            <Input placeholder="#channel" value={akickChan()} onChange={setAkickChan} flex />
            <select
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
            <Input placeholder="Mask (for ADD/DEL)" value={akickMask()} onChange={setAkickMask} flex />
            <Btn
              label="Send"
              disabled={!akickChan() || (akickAction() !== 'LIST' && !akickMask())}
              onClick={() => {
                const suffix = akickAction() === 'LIST' ? '' : ` ${akickMask().trim()}`;
                sendRaw(`CHANNEL AKICK ${akickChan()} ${akickAction()}${suffix}`);
              }}
            />
          </div>
        </div>
      </Section>

      <Section title="Raw CHANNEL Command">
        <div class="space-y-2">
          <p class="text-[10px] text-gray-500 px-1">
            For SET MLOCK / ACCESS / TRANSFER — arguments are sent verbatim after <span class="font-mono">CHANNEL</span>.
          </p>
          <div class="flex gap-2">
            <Input placeholder="SET MLOCK #chan +nt" value={rawArgs()} onChange={setRawArgs} flex />
            <Btn label="Send" disabled={!rawArgs().trim()} onClick={() => { sendRaw(`CHANNEL ${rawArgs().trim()}`); setRawArgs(''); }} />
          </div>
        </div>
      </Section>

      <Section title="Danger Zone">
        <div class="space-y-2">
          <div class="flex flex-wrap gap-2">
            <SmallBtn label="Drop Channel" danger active={expanded() === 'drop'} onClick={() => toggle('drop')} />
          </div>
          <Show when={expanded() === 'drop'}>
            <div class="space-y-2">
              <Input placeholder="#channel to drop" value={dropChan()} onChange={setDropChan} />
              <ConfirmForm
                message={`Drop registration for ${dropChan() || '...'}?`}
                confirmDisabled={!dropChan()}
                onConfirm={() => { sendRaw(`CHANNEL DROP ${dropChan()}`); setDropChan(''); setExpanded(null); }}
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
      <Section title="Send Memo">
        <div class="space-y-2">
          <Input placeholder="Recipient account" value={sendTarget()} onChange={setSendTarget} />
          <textarea
            value={sendText()}
            onInput={(e) => setSendText(e.currentTarget.value)}
            placeholder="Message..."
            rows={3}
            class="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg text-[12px] text-gray-200 px-3 py-2 outline-none focus:border-[var(--custom-accent,#818cf8)]/40 placeholder-gray-600 resize-none"
          />
          <Btn
            label="Send"
            disabled={!sendTarget() || !sendText()}
            onClick={() => { sendRaw(`TEGAMI SEND ${sendTarget()} :${sendText()}`); setSendText(''); }}
          />
          <p class="text-[10px] text-gray-500 px-1">Memos are delivered when the recipient next logs in.</p>
        </div>
      </Section>

      <Section title="Inbox">
        <div class="space-y-2">
          <div class="flex flex-wrap gap-2">
            <SmallBtn label="List" onClick={() => sendRaw('TEGAMI LIST')} />
            <SmallBtn label="Clear All" danger active={confirmClear()} onClick={() => setConfirmClear(!confirmClear())} />
          </div>
          <Show when={confirmClear()}>
            <ConfirmForm
              message="Delete all memos in your inbox?"
              onConfirm={() => { sendRaw('TEGAMI CLEAR'); setConfirmClear(false); }}
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
      <h4 class="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2.5">{props.title}</h4>
      {props.children}
    </div>
  );
}

function Input(props: {
  placeholder: string; value: string; onChange: (v: string) => void; type?: string; flex?: boolean;
}): JSX.Element {
  return (
    <input
      type={props.type ?? 'text'}
      value={props.value}
      onInput={(e) => props.onChange(e.currentTarget.value)}
      placeholder={props.placeholder}
      autocomplete="off"
      class={`${props.flex ? 'flex-1 min-w-0' : 'w-full'} bg-white/[0.04] border border-white/[0.08] rounded-md text-[12px] text-gray-200 px-2.5 py-1.5 outline-none focus:border-[var(--custom-accent,#818cf8)]/40 placeholder-gray-600 transition-colors`}
    />
  );
}

function Btn(props: { label: string; onClick: () => void; disabled?: boolean }): JSX.Element {
  return (
    <button
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
      <button onClick={() => props.onCancel()} class="text-[10px] text-gray-500 hover:text-gray-300 px-1.5 shrink-0">Cancel</button>
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
        onClick={() => props.onConfirm()}
        disabled={props.confirmDisabled}
        class="text-[11px] font-medium text-red-400 hover:text-red-300 px-2 shrink-0 disabled:opacity-30 disabled:pointer-events-none"
      >
        Confirm
      </button>
      <button onClick={() => props.onCancel()} class="text-[11px] text-gray-500 hover:text-gray-300 px-1.5 shrink-0">Cancel</button>
    </div>
  );
}

function TabBtn(props: { active: boolean; onClick: () => void; children: JSX.Element }): JSX.Element {
  return (
    <button
      onClick={() => props.onClick()}
      class={`px-4 py-2.5 text-[12px] font-medium transition-all border-b-2 -mb-px
        ${props.active
          ? 'text-gray-100 border-[var(--custom-accent,#818cf8)]'
          : 'text-gray-500 border-transparent hover:text-gray-300 hover:border-white/[0.06]'}`}
    >
      {props.children}
    </button>
  );
}
