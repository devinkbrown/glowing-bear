'use client';

import { useState, useCallback, useRef } from 'react';
import { useStore } from '@/stores';
import Modal from '@/components/ui/Modal';

export default function ChannelListModal({ onClose }: { onClose: () => void }) {
  const sendInput = useStore(s => s.sendInput);
  const [minUsers, setMinUsers] = useState('2');
  const [maxUsers, setMaxUsers] = useState('');
  const [pattern, setPattern] = useState('');

  const handleSearch = useCallback(() => {
    const parts = ['/list'];
    if (pattern.trim()) parts.push(pattern.trim());
    const filters: string[] = [];
    if (minUsers.trim()) filters.push(`>${minUsers.trim()}`);
    if (maxUsers.trim()) filters.push(`<${maxUsers.trim()}`);
    if (filters.length > 0) parts.push(filters.join(','));
    sendInput(parts.join(' '));
  }, [pattern, minUsers, maxUsers, sendInput]);

  return (
    <Modal onClose={onClose} title="Channel List">
      <div className="space-y-4 px-4 sm:px-5 pb-4 pt-3">
        <div className="bg-white/[0.01] border border-white/[0.04] rounded-xl p-3 space-y-3">
          <Input label="Pattern" placeholder="*chat* or #channel" value={pattern} onChange={setPattern} />
          <div className="flex gap-3">
            <Input label="Min Users" placeholder="2" value={minUsers} onChange={setMinUsers} />
            <Input label="Max Users" placeholder="" value={maxUsers} onChange={setMaxUsers} />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSearch}
              className="flex-1 text-[12px] font-medium bg-[var(--custom-accent,#818cf8)]/[0.1] text-[var(--custom-accent,#818cf8)] hover:bg-[var(--custom-accent,#818cf8)]/[0.2] py-2 rounded-lg transition-colors">
              Search Channels
            </button>
            <button onClick={() => sendInput('/list')}
              className="text-[12px] font-medium bg-white/[0.03] text-gray-400 hover:bg-white/[0.06] hover:text-gray-200 px-4 py-2 rounded-lg transition-colors">
              List All
            </button>
          </div>
        </div>

        <div className="text-[11px] text-gray-500 px-1">
          Results will appear in the server buffer. Click a channel name to join.
        </div>

        {/* Quick actions */}
        <div className="border-t border-white/[0.06] pt-3">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2 px-1">Quick Actions</h4>
          <div className="flex flex-wrap gap-2">
            <SmallBtn label="LISTX (Extended)" onClick={() => sendInput('/quote LISTX')} />
            <SmallBtn label="Join Channel" onClick={() => {
              const ch = prompt('Channel to join:');
              if (ch) sendInput(`/join ${ch}`);
            }} />
            <SmallBtn label="Create Channel" onClick={() => {
              const ch = prompt('Channel name:');
              if (ch) sendInput(`/quote CREATE ${ch}`);
            }} accent />
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Input({ label, placeholder, value, onChange }: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="flex-1">
      <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1 block">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-md text-[12px] text-gray-200 px-2.5 py-1.5 outline-none focus:border-[var(--custom-accent,#818cf8)]/40 placeholder-gray-600 transition-colors"
      />
    </div>
  );
}

function SmallBtn({ label, onClick, accent }: { label: string; onClick: () => void; accent?: boolean }) {
  return (
    <button onClick={onClick}
      className={`text-[11px] font-medium px-3 py-1.5 rounded-lg transition-colors
        ${accent
          ? 'bg-[var(--custom-accent,#818cf8)]/[0.08] text-[var(--custom-accent,#818cf8)] hover:bg-[var(--custom-accent,#818cf8)]/[0.15]'
          : 'bg-white/[0.03] text-gray-400 hover:bg-white/[0.06] hover:text-gray-200'}`}>
      {label}
    </button>
  );
}
