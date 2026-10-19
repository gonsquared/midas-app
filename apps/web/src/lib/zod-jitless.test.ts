import { afterEach, describe, expect, it, vi } from 'vitest';

describe('zod without eval (strict CSP)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('never probes new Function once the bootstrap config is imported', async () => {
    vi.resetModules();
    const probe = vi.fn();
    const RealFunction = Function;
    vi.stubGlobal(
      'Function',
      new Proxy(RealFunction, {
        construct(target, args, newTarget) {
          probe(...args);
          return Reflect.construct(target, args, newTarget) as object;
        },
      }),
    );
    // Stub first so even work done while the modules load is observed.
    await import('@midas/shared/zod-config');
    const { PreferencesSchema } = await import('@midas/shared');
    expect(PreferencesSchema.safeParse({ nope: true }).success).toBe(false);
    expect(probe).not.toHaveBeenCalled();
  });
});
