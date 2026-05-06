'use client';

import Modal from '@/components/ui/Modal';
import BearLogo from '@/components/ui/BearLogo';

interface Props {
  onClose: () => void;
}

export default function AboutModal({ onClose }: Props) {
  return (
    <Modal onClose={onClose} width="max-w-sm">
      <div className="flex flex-col items-center p-10 text-center">
        <BearLogo size={64} />
        <h2 className="text-xl font-bold text-gray-100 mt-5 tracking-tight">DarkBear</h2>
        <p className="text-[11px] font-medium tracking-[0.2em] uppercase text-gray-500 mt-1.5">WeeChat Relay Client</p>
        <p className="text-gray-500 text-[13px] mt-5 leading-relaxed max-w-[260px]">
          A modern IRC client built with React 19, Next.js 15, and Tailwind CSS 4.
        </p>
        <div className="flex gap-3 mt-5 text-[11px] text-gray-600 font-mono">
          <span>React 19</span>
          <span className="text-gray-800">|</span>
          <span>Next.js 15</span>
          <span className="text-gray-800">|</span>
          <span>Tailwind 4</span>
        </div>
        <button onClick={onClose}
          className="mt-7 px-6 py-2 text-[12px] font-medium text-gray-400 bg-white/[0.04] border border-white/[0.06] rounded-xl hover:text-gray-200 hover:bg-white/[0.06] transition-all">
          Close
        </button>
      </div>
    </Modal>
  );
}
