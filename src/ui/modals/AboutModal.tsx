// AboutModal — small about card with the bear logo and stack versions.
//
// Usage: <AboutModal open={uiState.activeModal === 'about'} onClose={closeModal} />
// `open` defaults to true for conditional-mount usage.

import Modal from '@/ui/bits/Modal';
import BearLogo from '@/ui/bits/BearLogo';

interface Props {
  open?: boolean;
  onClose: () => void;
}

export default function AboutModal(props: Props) {
  return (
    <Modal open={props.open} onClose={props.onClose} width="max-w-sm">
      <div class="flex flex-col items-center p-10 text-center">
        <BearLogo size={64} />
        <h2 class="text-xl font-bold text-gray-100 mt-5 tracking-tight">DarkBear</h2>
        <p class="text-[11px] font-medium tracking-[0.2em] uppercase text-gray-500 mt-1.5">WeeChat Relay Client</p>
        <p class="text-gray-500 text-[13px] mt-5 leading-relaxed max-w-[260px]">
          A modern IRC client built with SolidJS, Vite, and Tailwind CSS 4.
        </p>
        <div class="flex gap-3 mt-5 text-[11px] text-gray-600 font-mono">
          <span>SolidJS 1.9</span>
          <span class="text-gray-800">|</span>
          <span>Vite 7</span>
          <span class="text-gray-800">|</span>
          <span>Tailwind 4</span>
        </div>
        <button onClick={() => props.onClose()}
          class="mt-7 px-6 py-2 text-[12px] font-medium text-gray-400 bg-white/[0.04] border border-white/[0.06] rounded-xl hover:text-gray-200 hover:bg-white/[0.06] transition-all">
          Close
        </button>
      </div>
    </Modal>
  );
}
