'use client';

import { useState } from 'react';
import { useStore } from '@/stores';
import Modal from '@/components/ui/Modal';

type ServicesTab = 'account' | 'channel' | 'memo';

export default function ServicesPanel({ onClose }: { onClose: () => void }) {
  const servicesPanel = useStore(s => s.servicesPanel);
  const initial: ServicesTab = servicesPanel === 'nick' ? 'account'
    : servicesPanel === 'chan' ? 'channel'
    : servicesPanel === 'memo' ? 'memo'
    : 'account';
  const [tab, setTab] = useState<ServicesTab>(initial);

  return (
    <Modal onClose={onClose} title="Services" wide>
      <div className="flex border-b border-white/[0.06] mb-4">
        <TabBtn active={tab === 'account'} onClick={() => setTab('account')}>Account</TabBtn>
        <TabBtn active={tab === 'channel'} onClick={() => setTab('channel')}>Channel</TabBtn>
        <TabBtn active={tab === 'memo'} onClick={() => setTab('memo')}>Memo</TabBtn>
      </div>

      <div className="px-4 sm:px-5 pb-4">
        {tab === 'account' && <AccountTab />}
        {tab === 'channel' && <ChannelTab />}
        {tab === 'memo' && <MemoTab />}
      </div>
    </Modal>
  );
}

function AccountTab() {
  const sendAccount = useStore(s => s.sendAccount);
  const [regEmail, setRegEmail] = useState('');
  const [regPass, setRegPass] = useState('');
  const [identAccount, setIdentAccount] = useState('');
  const [identPass, setIdentPass] = useState('');
  const [infoNick, setInfoNick] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [ghostNick, setGhostNick] = useState('');
  const [newPass, setNewPass] = useState('');
  const [setOption, setSetOption] = useState('');
  const [setVal, setSetVal] = useState('');

  return (
    <div className="space-y-4">
      <Section title="Register">
        <div className="space-y-2">
          <Input placeholder="Email" value={regEmail} onChange={setRegEmail} />
          <Input placeholder="Password" type="password" value={regPass} onChange={setRegPass} />
          <Btn label="Register" disabled={!regEmail || !regPass} onClick={() => {
            sendAccount(`REGISTER ${regEmail} ${regPass}`);
          }} />
        </div>
      </Section>

      <Section title="Identify">
        <div className="space-y-2">
          <Input placeholder="Account (blank = current nick)" value={identAccount} onChange={setIdentAccount} />
          <div className="flex gap-2">
            <Input placeholder="Password" type="password" value={identPass} onChange={setIdentPass} flex />
            <Btn label="Identify" disabled={!identPass} onClick={() => {
              sendAccount(identAccount ? `IDENTIFY ${identAccount} ${identPass}` : `IDENTIFY ${identPass}`);
            }} />
          </div>
        </div>
      </Section>

      <Section title="Info">
        <div className="flex gap-2">
          <Input placeholder="Account (blank = self)" value={infoNick} onChange={setInfoNick} flex />
          <Btn label="Info" onClick={() => sendAccount(infoNick ? `INFO ${infoNick}` : 'INFO')} />
        </div>
      </Section>

      <Section title="Account Settings">
        <div className="space-y-2">
          <div className="flex gap-2">
            <select value={setOption} onChange={e => setSetOption(e.target.value)}
              className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-md text-[12px] text-gray-200 px-2.5 py-1.5 outline-none focus:border-[var(--custom-accent,#818cf8)]/40 transition-colors">
              <option value="">Select setting...</option>
              <option value="PASSWORD">Password</option>
              <option value="EMAIL">Email</option>
              <option value="LANGUAGE">Language</option>
              <option value="ENFORCE">Enforce (nick protection)</option>
              <option value="HIDEMAIL">Hide Email</option>
              <option value="PRIVATE">Private</option>
            </select>
            <Input placeholder="Value" value={setVal} onChange={setSetVal} flex />
          </div>
          <Btn label="Set" disabled={!setOption || !setVal} onClick={() => {
            sendAccount(`SET ${setOption} ${setVal}`);
          }} />
        </div>
      </Section>

      <Section title="Quick Actions">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <SmallBtn label="Ghost" active={expanded === 'ghost'} onClick={() => setExpanded(expanded === 'ghost' ? null : 'ghost')} />
            <SmallBtn label="Group" onClick={() => sendAccount('GROUP')} />
            <SmallBtn label="Set Password" active={expanded === 'setpass'} onClick={() => setExpanded(expanded === 'setpass' ? null : 'setpass')} />
            <SmallBtn label="Cert" onClick={() => sendAccount('CERT LIST')} />
            <SmallBtn label="Drop" active={expanded === 'drop'} onClick={() => setExpanded(expanded === 'drop' ? null : 'drop')} danger />
          </div>

          {expanded === 'ghost' && (
            <InlineForm onCancel={() => { setExpanded(null); setGhostNick(''); }}>
              <Input placeholder="Nick to ghost" value={ghostNick} onChange={setGhostNick} flex />
              <Btn label="Ghost" disabled={!ghostNick} onClick={() => { sendAccount(`GHOST ${ghostNick}`); setGhostNick(''); setExpanded(null); }} />
            </InlineForm>
          )}

          {expanded === 'setpass' && (
            <InlineForm onCancel={() => { setExpanded(null); setNewPass(''); }}>
              <Input placeholder="New password" type="password" value={newPass} onChange={setNewPass} flex />
              <Btn label="Set" disabled={!newPass} onClick={() => { sendAccount(`SET PASSWORD ${newPass}`); setNewPass(''); setExpanded(null); }} />
            </InlineForm>
          )}

          {expanded === 'drop' && (
            <ConfirmForm
              message="Drop your account registration?"
              onConfirm={() => { sendAccount('DROP'); setExpanded(null); }}
              onCancel={() => setExpanded(null)}
            />
          )}
        </div>
      </Section>
    </div>
  );
}

function ChannelTab() {
  const sendChannel = useStore(s => s.sendChannel);
  const [regChan, setRegChan] = useState('');
  const [infoChan, setInfoChan] = useState('');
  const [setChan, setSetChan] = useState('');
  const [setKey, setSetKey] = useState('');
  const [setVal, setSetVal] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [accessChan, setAccessChan] = useState('');
  const [akickChan, setAkickChan] = useState('');
  const [dropChan, setDropChan] = useState('');
  const [inviteChan, setInviteChan] = useState('');
  const [unbanChan, setUnbanChan] = useState('');

  return (
    <div className="space-y-4">
      <Section title="Register Channel">
        <div className="flex gap-2">
          <Input placeholder="#channel" value={regChan} onChange={setRegChan} flex />
          <Btn label="Register" disabled={!regChan} onClick={() => sendChannel(`REGISTER ${regChan}`)} />
        </div>
      </Section>

      <Section title="Channel Info">
        <div className="flex gap-2">
          <Input placeholder="#channel" value={infoChan} onChange={setInfoChan} flex />
          <Btn label="Info" disabled={!infoChan} onClick={() => sendChannel(`INFO ${infoChan}`)} />
        </div>
      </Section>

      <Section title="Channel Settings">
        <div className="space-y-2">
          <Input placeholder="#channel" value={setChan} onChange={setSetChan} />
          <div className="flex gap-2">
            <select value={setKey} onChange={e => setSetKey(e.target.value)}
              className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-md text-[12px] text-gray-200 px-2.5 py-1.5 outline-none focus:border-[var(--custom-accent,#818cf8)]/40 transition-colors">
              <option value="">Select setting...</option>
              <option value="GUARD">Guard (ChanServ join)</option>
              <option value="SECURE">Secure (ops require identify)</option>
              <option value="PRIVATE">Private</option>
              <option value="TOPICLOCK">Topic Lock</option>
              <option value="KEEPTOPIC">Keep Topic</option>
              <option value="RESTRICTED">Restricted</option>
              <option value="VERBOSE">Verbose</option>
              <option value="FANTASY">Fantasy (!commands)</option>
              <option value="PROPLOCK">Prop Lock</option>
              <option value="FOUNDER">Founder</option>
              <option value="SUCCESSOR">Successor</option>
              <option value="TOPIC">Topic</option>
              <option value="MODELOCK">Mode Lock</option>
            </select>
            <Input placeholder="Value" value={setVal} onChange={setSetVal} flex />
          </div>
          <Btn label="Set" disabled={!setChan || !setKey} onClick={() => {
            sendChannel(`SET ${setChan} ${setKey} ${setVal}`);
          }} />
        </div>
      </Section>

      <Section title="Quick Actions">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <SmallBtn label="Access List" active={expanded === 'access'} onClick={() => setExpanded(expanded === 'access' ? null : 'access')} />
            <SmallBtn label="Auto-Kick List" active={expanded === 'akick'} onClick={() => setExpanded(expanded === 'akick' ? null : 'akick')} />
            <SmallBtn label="Invite" active={expanded === 'invite'} onClick={() => setExpanded(expanded === 'invite' ? null : 'invite')} />
            <SmallBtn label="Unban" active={expanded === 'unban'} onClick={() => setExpanded(expanded === 'unban' ? null : 'unban')} />
            <SmallBtn label="Drop Channel" active={expanded === 'drop'} onClick={() => setExpanded(expanded === 'drop' ? null : 'drop')} danger />
          </div>

          {expanded === 'access' && (
            <InlineForm onCancel={() => { setExpanded(null); setAccessChan(''); }}>
              <Input placeholder="#channel" value={accessChan} onChange={setAccessChan} flex />
              <Btn label="List" disabled={!accessChan} onClick={() => { sendChannel(`ACCESS ${accessChan} LIST`); setAccessChan(''); setExpanded(null); }} />
            </InlineForm>
          )}

          {expanded === 'akick' && (
            <InlineForm onCancel={() => { setExpanded(null); setAkickChan(''); }}>
              <Input placeholder="#channel" value={akickChan} onChange={setAkickChan} flex />
              <Btn label="List" disabled={!akickChan} onClick={() => { sendChannel(`AKICK ${akickChan} LIST`); setAkickChan(''); setExpanded(null); }} />
            </InlineForm>
          )}

          {expanded === 'invite' && (
            <InlineForm onCancel={() => { setExpanded(null); setInviteChan(''); }}>
              <Input placeholder="#channel" value={inviteChan} onChange={setInviteChan} flex />
              <Btn label="Invite" disabled={!inviteChan} onClick={() => { sendChannel(`INVITE ${inviteChan}`); setInviteChan(''); setExpanded(null); }} />
            </InlineForm>
          )}

          {expanded === 'unban' && (
            <InlineForm onCancel={() => { setExpanded(null); setUnbanChan(''); }}>
              <Input placeholder="#channel" value={unbanChan} onChange={setUnbanChan} flex />
              <Btn label="Unban" disabled={!unbanChan} onClick={() => { sendChannel(`UNBAN ${unbanChan}`); setUnbanChan(''); setExpanded(null); }} />
            </InlineForm>
          )}

          {expanded === 'drop' && (
            <InlineForm onCancel={() => { setExpanded(null); setDropChan(''); }}>
              <Input placeholder="#channel to drop" value={dropChan} onChange={setDropChan} flex />
              <DangerBtn label={`Drop ${dropChan || '...'}`} disabled={!dropChan} onClick={() => { sendChannel(`DROP ${dropChan}`); setDropChan(''); setExpanded(null); }} />
            </InlineForm>
          )}
        </div>
      </Section>
    </div>
  );
}

function MemoTab() {
  const sendMemo = useStore(s => s.sendMemo);
  const [sendTarget, setSendTarget] = useState('');
  const [sendText, setSendText] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [fwdId, setFwdId] = useState('');
  const [fwdTo, setFwdTo] = useState('');
  const [readId, setReadId] = useState('');
  const [delId, setDelId] = useState('');

  return (
    <div className="space-y-4">
      <Section title="Send Memo">
        <div className="space-y-2">
          <Input placeholder="Recipient nick" value={sendTarget} onChange={setSendTarget} />
          <textarea
            value={sendText}
            onChange={e => setSendText(e.target.value)}
            placeholder="Message..."
            rows={3}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg text-[12px] text-gray-200 px-3 py-2 outline-none focus:border-[var(--custom-accent,#818cf8)]/40 placeholder-gray-600 resize-none"
          />
          <Btn label="Send" disabled={!sendTarget || !sendText} onClick={() => {
            sendMemo(`SEND ${sendTarget} ${sendText}`);
            setSendText('');
          }} />
        </div>
      </Section>

      <Section title="Inbox">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <SmallBtn label="List" onClick={() => sendMemo('LIST')} />
            <SmallBtn label="Read" active={expanded === 'read'} onClick={() => setExpanded(expanded === 'read' ? null : 'read')} />
            <SmallBtn label="Delete" active={expanded === 'delete'} onClick={() => setExpanded(expanded === 'delete' ? null : 'delete')} danger />
            <SmallBtn label="Forward" active={expanded === 'forward'} onClick={() => setExpanded(expanded === 'forward' ? null : 'forward')} />
          </div>

          {expanded === 'read' && (
            <InlineForm onCancel={() => { setExpanded(null); setReadId(''); }}>
              <Input placeholder="Memo ID or ALL" value={readId} onChange={setReadId} flex />
              <Btn label="Read" disabled={!readId} onClick={() => { sendMemo(`READ ${readId}`); setReadId(''); setExpanded(null); }} />
            </InlineForm>
          )}

          {expanded === 'delete' && (
            <InlineForm onCancel={() => { setExpanded(null); setDelId(''); }}>
              <Input placeholder="Memo ID or ALL" value={delId} onChange={setDelId} flex />
              <DangerBtn label="Delete" disabled={!delId} onClick={() => { sendMemo(`DEL ${delId}`); setDelId(''); setExpanded(null); }} />
            </InlineForm>
          )}

          {expanded === 'forward' && (
            <InlineForm onCancel={() => { setExpanded(null); setFwdId(''); setFwdTo(''); }}>
              <Input placeholder="Memo ID" value={fwdId} onChange={setFwdId} flex />
              <Input placeholder="Forward to" value={fwdTo} onChange={setFwdTo} flex />
              <Btn label="Forward" disabled={!fwdId || !fwdTo} onClick={() => { sendMemo(`FORWARD ${fwdId} ${fwdTo}`); setFwdId(''); setFwdTo(''); setExpanded(null); }} />
            </InlineForm>
          )}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white/[0.01] border border-white/[0.04] rounded-xl p-3">
      <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2.5">{title}</h4>
      {children}
    </div>
  );
}

function Input({ placeholder, value, onChange, type, flex }: {
  placeholder: string; value: string; onChange: (v: string) => void; type?: string; flex?: boolean;
}) {
  return (
    <input
      type={type ?? 'text'}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      autoComplete="off"
      className={`${flex ? 'flex-1' : 'w-full'} bg-white/[0.04] border border-white/[0.08] rounded-md text-[12px] text-gray-200 px-2.5 py-1.5 outline-none focus:border-[var(--custom-accent,#818cf8)]/40 placeholder-gray-600 transition-colors`}
    />
  );
}

function Btn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="text-[11px] font-medium bg-[var(--custom-accent,#818cf8)]/[0.1] text-[var(--custom-accent,#818cf8)] hover:bg-[var(--custom-accent,#818cf8)]/[0.2] px-4 py-1.5 rounded-md transition-colors shrink-0 disabled:opacity-30 disabled:pointer-events-none">
      {label}
    </button>
  );
}

function DangerBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="text-[11px] font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 px-4 py-1.5 rounded-md transition-colors shrink-0 disabled:opacity-30 disabled:pointer-events-none">
      {label}
    </button>
  );
}

function SmallBtn({ label, onClick, danger, active }: { label: string; onClick: () => void; danger?: boolean; active?: boolean }) {
  return (
    <button onClick={onClick}
      className={`text-[11px] font-medium px-3 py-1.5 rounded-lg transition-colors
        ${danger
          ? active ? 'bg-red-500/20 text-red-300 ring-1 ring-red-500/30' : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
          : active ? 'bg-[var(--custom-accent,#818cf8)]/[0.15] text-[var(--custom-accent,#818cf8)] ring-1 ring-[var(--custom-accent,#818cf8)]/30' : 'bg-white/[0.03] text-gray-400 hover:bg-white/[0.06] hover:text-gray-200'}`}>
      {label}
    </button>
  );
}

function InlineForm({ children, onCancel }: { children: React.ReactNode; onCancel: () => void }) {
  return (
    <div className="flex items-center gap-2 bg-white/[0.02] rounded-lg px-3 py-2 border border-white/[0.06]">
      {children}
      <button onClick={onCancel} className="text-[10px] text-gray-500 hover:text-gray-300 px-1.5 shrink-0">Cancel</button>
    </div>
  );
}

function ConfirmForm({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="flex items-center gap-3 bg-red-500/[0.04] rounded-lg px-3 py-2.5 border border-red-500/[0.12]">
      <span className="text-[11px] text-gray-300 flex-1">{message}</span>
      <button onClick={onConfirm} className="text-[11px] font-medium text-red-400 hover:text-red-300 px-2 shrink-0">Confirm</button>
      <button onClick={onCancel} className="text-[11px] text-gray-500 hover:text-gray-300 px-1.5 shrink-0">Cancel</button>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-[12px] font-medium transition-all border-b-2 -mb-px
        ${active
          ? 'text-gray-100 border-[var(--custom-accent,#818cf8)]'
          : 'text-gray-500 border-transparent hover:text-gray-300 hover:border-white/[0.06]'}`}>
      {children}
    </button>
  );
}
