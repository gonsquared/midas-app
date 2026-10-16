/**
 * Build-time safety checks, kept pure so they can be unit tested (src/build-guard.test.ts).
 * Used by vite.config.ts.
 */
export interface BuildContext {
  command: 'build' | 'serve';
  mode: string;
  /** process.env.NODE_ENV at config time. */
  nodeEnv: string | undefined;
  /** VITE_DEV_SKIP_AUTH from the loaded env files and process env. */
  devSkipAuth: string | undefined;
}

/** Throws when a build could ship the dev-only auth bypass. Never throws for the dev server. */
export function assertSafeBuild(context: BuildContext): void {
  if (context.command !== 'build') return;
  if (context.devSkipAuth !== undefined && context.devSkipAuth !== '') {
    throw new Error(
      'VITE_DEV_SKIP_AUTH is set. Refusing to build: the dev auth bypass must never ship. Unset it.',
    );
  }
  if (context.mode !== 'production') {
    throw new Error(
      `Refusing to build with mode "${context.mode}". Builds must use the production mode.`,
    );
  }
  if (context.nodeEnv !== undefined && context.nodeEnv !== '' && context.nodeEnv !== 'production') {
    throw new Error(
      `Refusing to build with NODE_ENV="${context.nodeEnv}". Builds must use NODE_ENV=production.`,
    );
  }
}

/**
 * Value for the `__DEV_SKIP_AUTH__` compile-time constant. Hard false for every build and for
 * tests; true only on the dev server in development mode with the explicit opt-in.
 */
export function resolveDevSkipAuth(context: BuildContext): boolean {
  return (
    context.command === 'serve' && context.mode === 'development' && context.devSkipAuth === 'true'
  );
}
