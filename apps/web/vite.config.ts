import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { assertSafeBuild, resolveDevSkipAuth, type BuildContext } from './build-guard';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const context: BuildContext = {
    command,
    mode,
    nodeEnv: process.env['NODE_ENV'],
    devSkipAuth: process.env['VITE_DEV_SKIP_AUTH'] ?? env['VITE_DEV_SKIP_AUTH'],
  };
  // Fail before anything is emitted if the dev auth bypass could be embedded in a build.
  assertSafeBuild(context);

  // The API origin is only used by the dev server proxy, so the browser always talks to its own
  // origin (same-origin cookies, no CORS), exactly like production where the API serves the SPA.
  const apiTarget =
    process.env['VITE_DEV_API_URL'] ?? env['VITE_DEV_API_URL'] ?? 'http://localhost:3000';
  // Loopback by default. Set VITE_DEV_HOST=0.0.0.0 to opt in to exposing the dev server.
  const devHost = process.env['VITE_DEV_HOST'] ?? env['VITE_DEV_HOST'] ?? 'localhost';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    // Compile-time constant: hard false for builds and tests, so the dev session branch (and the
    // dynamically imported fake session) is dead code and never reaches the bundle.
    define: { __DEV_SKIP_AUTH__: JSON.stringify(resolveDevSkipAuth(context)) },
    server: {
      host: devHost,
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: false },
        '/health': { target: apiTarget, changeOrigin: false },
      },
    },
    build: {
      sourcemap: false,
      // Keep the CSP strict: never inline assets as data: URIs into scripts or styles.
      assetsInlineLimit: 0,
    },
    test: {
      environment: 'jsdom',
      globals: false,
      setupFiles: ['./vitest.setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: false,
    },
  };
});
