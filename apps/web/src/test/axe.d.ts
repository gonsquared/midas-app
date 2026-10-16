import type { AxeMatchers } from 'vitest-axe/matchers';

declare module 'vitest' {
  // Declaration merging must reuse the original generic signature.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-explicit-any
  interface Assertion<_T = any> extends AxeMatchers {}
}
