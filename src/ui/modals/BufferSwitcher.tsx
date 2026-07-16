// BufferSwitcher — the Ctrl+K COMMAND PALETTE. One fuzzy primitive over two
// sources: open buffers (jump-to) and app actions (join, settings, notify
// tier, mute, split, search, member list, oper console, themes). Full keyboard
// model: Arrow up/down wrap, Enter runs the active row, Esc closes. Results are
// grouped (Buffers / Actions) and exposed as an aria listbox with a roving
// aria-activedescendant. Mount while activeModal === 'bufferSwitcher'.
//
// Overlay concerns — focus trap, initial focus, focus restore to the opener,
// Escape, and backdrop click-to-close — are delegated to the shared <Modal>
// shell (@/ui/bits/Modal) so the palette can't leak focus and returns it to
// whatever opened it. This file owns only the query state, the arrow/Enter
// keyboard model, and the combobox+listbox presentation inside the dialog.
//
// The command model + fuzzy ranker live in ../palette; this file owns only the
// query state, keyboard model, and presentation.

import { createEffect, createMemo, createSignal, For, on, Show } from 'solid-js';
import { closeModal } from '@/state';
import Modal from '@/ui/bits/Modal';
import { buildPaletteCommands, type PaletteCommand, type PaletteGroup } from '@/ui/palette/commands';
import { rankCommands } from '@/ui/palette/fuzzy';
import { isImeComposing } from '@/primitives/ime';
import { t } from '@/lib/i18n';

const LISTBOX_ID = 'cmdk-listbox';

interface Section {
  key: PaletteGroup;
  label: string;
  items: PaletteCommand[];
}

interface PaletteView {
  ordered: PaletteCommand[];
  indexOf: Map<string, number>;
  sections: Section[];
}

function optionId(index: number): string {
  return `cmdk-option-${index}`;
}

export default function BufferSwitcher() {
  const [query, setQuery] = createSignal('');
  const [selected, setSelected] = createSignal(0);

  let listRef: HTMLDivElement | undefined;

  // Ranked, grouped view of the palette. Buffers render before Actions; within
  // each group the order follows the fuzzy rank (input order when no query).
  const view = createMemo<PaletteView>(() => {
    const all = buildPaletteCommands(query());
    const ranked = rankCommands(all, query()).map((r) => r.item);

    const buffers = ranked.filter((c) => c.group === 'buffers');
    const actions = ranked.filter((c) => c.group === 'actions');
    const ordered = [...buffers, ...actions];

    const indexOf = new Map<string, number>();
    ordered.forEach((c, i) => indexOf.set(c.id, i));

    const sections: Section[] = [];
    if (buffers.length) sections.push({ key: 'buffers', label: t('palette.buffers'), items: buffers });
    if (actions.length) sections.push({ key: 'actions', label: t('palette.actions'), items: actions });

    return { ordered, indexOf, sections };
  });

  // Reset the highlight to the top whenever the query changes.
  createEffect(on(query, () => setSelected(0), { defer: true }));

  // Clamp the highlight if the result set shrinks under it.
  createEffect(() => {
    const n = view().ordered.length;
    setSelected((s) => (n === 0 ? 0 : Math.min(s, n - 1)));
  });

  // Initial focus lands on the search input via the Modal shell (it focuses the
  // first focusable child on mount, and the roving listbox rows are role=option
  // divs, not tab stops), so the shell can first record the opener for restore.

  // Keep the highlighted row visible.
  createEffect(() => {
    const el = listRef?.querySelector<HTMLElement>(`#${optionId(selected())}`);
    el?.scrollIntoView({ block: 'nearest' });
  });

  const activeId = createMemo(() => (view().ordered.length ? optionId(selected()) : undefined));

  const run = (cmd: PaletteCommand): void => {
    // Close FIRST, then run: an action that opens another modal (Open settings)
    // must win over the palette's own dismissal, since activeModal is a single
    // slot — running before closing would immediately clobber it back to null.
    closeModal();
    cmd.run();
  };

  const runAt = (index: number): void => {
    const cmd = view().ordered[index];
    if (cmd) run(cmd);
  };

  const move = (delta: number): void => {
    const n = view().ordered.length;
    if (n === 0) return;
    setSelected((s) => (s + delta + n) % n);
  };

  // Arrow/Enter only. Escape (and backdrop click) are owned by the Modal shell
  // so there is exactly one close path — the shell also restores focus to the
  // opener, which a local closeModal() here would bypass.
  const onKeyDown = (e: KeyboardEvent): void => {
    if (isImeComposing(e)) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runAt(selected());
    }
  };

  return (
    <Modal open onClose={closeModal} width="480px" class="animate-slide-down">
      <>
        {/* Search */}
        <div class="flex items-center gap-3 px-4 py-4 sm:py-3.5 border-b border-white/[0.04]">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="text-gray-600 shrink-0 sm:w-4 sm:h-4" aria-hidden="true">
            <circle cx="6.5" cy="6.5" r="4.5" />
            <path d="M10 10l4 4" />
          </svg>
          <input
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={LISTBOX_ID}
            aria-activedescendant={activeId()}
            aria-label={t('palette.search')}
            autocomplete="off"
            spellcheck={false}
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={onKeyDown}
            placeholder={t('palette.placeholder')}
            class="flex-1 bg-transparent text-[15px] sm:text-[14px] text-gray-100 outline-none placeholder:text-gray-600"
          />
          <kbd class="text-[10px] font-mono text-gray-600 bg-white/[0.04] border border-white/[0.06] rounded px-1.5 py-0.5 hidden sm:inline">esc</kbd>
        </div>

        {/* Results */}
        <div ref={(el) => (listRef = el)} id={LISTBOX_ID} role="listbox" aria-label={t('palette.commands')} class="max-h-[60vh] sm:max-h-[340px] overflow-y-auto py-1">
          <Show when={view().ordered.length === 0}>
            <div class="px-4 py-8 text-center text-gray-600 text-[14px] sm:text-[13px]">{t('palette.noMatches')}</div>
          </Show>
          <For each={view().sections}>
            {(section) => (
              <div role="group" aria-label={section.label}>
                <div class="px-4 pt-2 pb-1 text-[9px] font-black uppercase tracking-[0.18em] text-gray-600 select-none">
                  {section.label}
                </div>
                <For each={section.items}>
                  {(cmd) => {
                    const index = () => view().indexOf.get(cmd.id) ?? -1;
                    const isActive = () => index() === selected();
                    return (
                      // A role=option div, not a <button>: listbox rows are
                      // driven by the input's roving aria-activedescendant and
                      // must never be tab stops. As buttons they would be caught
                      // by the Modal shell's focus-trap scan and let Tab escape.
                      <div
                        role="option"
                        id={optionId(index())}
                        aria-selected={isActive()}
                        onClick={() => run(cmd)}
                        onMouseEnter={() => setSelected(index())}
                        class="w-full text-left px-4 py-3.5 sm:py-2.5 flex items-center gap-3 text-[15px] sm:text-[13px] transition-colors cursor-pointer"
                        classList={{
                          'bg-[var(--custom-accent,#818cf8)]/10 text-gray-100': isActive(),
                          'text-gray-400 hover:bg-white/[0.02]': !isActive(),
                        }}
                      >
                        <span class="text-[13px] sm:text-[11px] text-gray-600 font-mono w-5 sm:w-4 text-center shrink-0" aria-hidden="true">
                          {cmd.glyph}
                        </span>
                        <span class="truncate flex-1">{cmd.title}</span>
                        <Show when={cmd.group === 'buffers' && (cmd.highlighted ?? 0) > 0}>
                          <span class="text-[10px] font-bold bg-red-500/80 text-white rounded-full px-2 py-0.5 min-w-[22px] text-center">{cmd.highlighted}</span>
                        </Show>
                        <Show when={cmd.group === 'buffers' && (cmd.unread ?? 0) > 0 && (cmd.highlighted ?? 0) === 0}>
                          <span class="text-[10px] font-medium bg-white/[0.06] text-gray-400 rounded-full px-2 py-0.5 min-w-[22px] text-center">{cmd.unread}</span>
                        </Show>
                        <Show when={cmd.group === 'actions' && cmd.subtitle}>
                          <span class="text-[11px] sm:text-[10px] text-gray-600 font-mono truncate max-w-[45%] text-right">{cmd.subtitle}</span>
                        </Show>
                      </div>
                    );
                  }}
                </For>
              </div>
            )}
          </For>
        </div>
      </>
    </Modal>
  );
}
