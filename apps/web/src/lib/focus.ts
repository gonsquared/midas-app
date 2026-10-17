/** Moves focus to the first control marked aria-invalid (or data-invalid for composite groups) inside `root` (after a failed submit). */
export function focusFirstInvalid(root: HTMLElement | null): boolean {
  const target = root?.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid="true"]');
  if (!target) return false;
  target.focus();
  return true;
}
