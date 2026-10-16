/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dev only: skip sign-in and use a fake admin session. Ignored in production builds. */
  readonly VITE_DEV_SKIP_AUTH?: string;
}

/** Compile-time constant from vite.config.ts. Hard false for builds and tests. */
declare const __DEV_SKIP_AUTH__: boolean;
