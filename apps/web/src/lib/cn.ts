/** Joins class names, skipping falsy values. Tailwind utilities here never conflict by design. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
