/**
 * Browsers report an active IME composition through `isComposing`. Safari and
 * older embedded webviews can instead expose the conventional keyCode 229 or
 * the `Process` key. Keyboard shortcuts must not submit, navigate, or dismiss
 * UI until compositionend commits the user's text.
 */
export function isImeComposing(event: KeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229 || event.key === 'Process';
}
