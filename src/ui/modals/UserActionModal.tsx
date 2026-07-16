import { For, Show, createMemo, createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';
import {
  activeUserAction,
  closeUserAction,
  runUserAction,
} from '@/state';
import {
  expandSafeCommand,
  safeCommandDefinition,
} from '@/lib/userActions';
import Modal from '@/ui/bits/Modal';

export default function UserActionModal() {
  const [values, setValues] = createStore<Record<string, string>>({});
  const [error, setError] = createSignal('');
  const action = createMemo(activeUserAction);
  const definition = createMemo(() => {
    const current = action();
    return current ? safeCommandDefinition(current.commandId) : null;
  });
  const expansion = createMemo(() => {
    const current = action();
    return current ? expandSafeCommand(current.commandId, values) : null;
  });
  const commandPreview = () => {
    const result = expansion();
    return result?.ok ? result.command : (definition()?.template ?? '');
  };

  const run = (): void => {
    const current = action();
    if (!current) return;
    const result = runUserAction(current.id, values);
    if (!result.ok) setError(result.reason);
  };

  return (
    <Show when={action() && definition()}>
      <Modal open onClose={closeUserAction} title={`Run ${action()!.name}`} width="min(520px, calc(100vw - 1rem))">
        <div class="max-h-[70dvh] overflow-y-auto p-4 sm:p-5" data-testid="user-action-runner">
          <div class="mb-4 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3">
            <p class="text-[12px] font-bold text-gray-200">{definition()!.label}</p>
            <p class="mt-1 text-[10px] leading-relaxed text-white/75">{definition()!.description}</p>
            <p class="mt-2 text-[10px] text-white/75">
              Scope: {action()!.scope === 'global' ? 'all profiles' : action()!.scope.slice('profile:'.length)}
            </p>
          </div>

          <div class="space-y-3">
            <For each={definition()!.arguments}>
              {(argument) => (
                <label class="block text-[10px] font-bold uppercase tracking-[0.08em] text-white/75">
                  {argument.label}
                  <Show when={argument.kind === 'text' || argument.kind === 'optional-text'} fallback={
                    <input
                      aria-label={argument.label}
                      value={values[argument.id] ?? ''}
                      onInput={(event) => { setValues(argument.id, event.currentTarget.value); setError(''); }}
                      placeholder={argument.placeholder}
                      autocomplete="off"
                      class="mt-1.5 w-full rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2.5 text-[13px] font-normal normal-case tracking-normal text-gray-100 outline-none placeholder:text-gray-700 focus:border-[var(--custom-accent,#818cf8)]/35"
                    />
                  }>
                    <textarea
                      aria-label={argument.label}
                      value={values[argument.id] ?? ''}
                      onInput={(event) => { setValues(argument.id, event.currentTarget.value); setError(''); }}
                      placeholder={argument.placeholder}
                      rows={3}
                      class="mt-1.5 w-full resize-y rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2.5 text-[13px] font-normal normal-case tracking-normal text-gray-100 outline-none placeholder:text-gray-700 focus:border-[var(--custom-accent,#818cf8)]/35"
                    />
                  </Show>
                </label>
              )}
            </For>
          </div>

          <div class="mt-4 rounded-2xl border border-[var(--custom-accent,#818cf8)]/20 bg-[var(--custom-accent,#818cf8)]/[0.06] p-3">
            <p class="text-[9px] font-black uppercase tracking-[0.14em] text-white/75">Exact IRC command</p>
            <code class="mt-1.5 block break-all text-[12px] text-gray-100">
              {commandPreview()}
            </code>
          </div>

          <Show when={!action()!.confirmed}>
            <p class="mt-3 rounded-xl border border-amber-400/15 bg-amber-400/[0.06] px-3 py-2 text-[10px] leading-relaxed text-amber-100/80">
              First use: review the exact command above. DarkBear expands only this fixed allowlisted command—never JavaScript, shell, or an arbitrary raw template.
            </p>
          </Show>
          <Show when={error()}>
            <p role="alert" class="mt-3 text-[11px] font-semibold text-red-300">{error()}</p>
          </Show>

          <div class="mt-4 flex justify-end gap-2">
            <button type="button" onClick={closeUserAction}
              class="rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-2.5 text-[11px] font-bold text-white/75 hover:bg-white/[0.06]">
              Cancel
            </button>
            <button type="button" onClick={run} disabled={!expansion()?.ok}
              class="rounded-xl border border-[var(--custom-accent,#818cf8)]/50 bg-gray-100 px-4 py-2.5 text-[11px] font-black text-gray-950 shadow-lg transition-all hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35">
              {action()!.confirmed ? 'Run command' : 'Confirm and run'}
            </button>
          </div>
        </div>
      </Modal>
    </Show>
  );
}
