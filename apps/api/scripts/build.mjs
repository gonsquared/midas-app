// Compiles the API to plain JavaScript in apps/api/dist so the production image runs `node`
// without tsx or a TypeScript toolchain.
//
//   dist/server.js          HTTP server (+ scheduler)
//   dist/cli.js             migrate, seed:system, admin:create, ...
//   dist/db/migrations/*.js one file per migration (node-pg-migrate loads these at runtime)
//
// Third-party packages stay external (installed with `pnpm deploy --prod`). The workspace package
// @midas/shared ships TypeScript source, so it is bundled into each entry point.
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const external = Object.keys({ ...manifest.dependencies }).filter(
  (name) => !name.startsWith('@midas/'),
);

const migrations = readdirSync(new URL('../db/migrations/', import.meta.url))
  .filter((file) => file.endsWith('.ts'))
  .map((file) => file.slice(0, -'.ts'.length));

rmSync(new URL('../dist', import.meta.url), { recursive: true, force: true });

const common = {
  absWorkingDir: root,
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  // Subpath imports (pg/lib/..., zod/v4) of an external package stay external too.
  external: external.flatMap((name) => [name, `${name}/*`]),
  logLevel: 'info',
};

await build({
  ...common,
  entryPoints: { server: 'src/server.ts', cli: 'src/cli.ts' },
  sourcemap: true,
});

// No source maps here: node-pg-migrate imports every file in the folder, and a .map is not a module.
await build({
  ...common,
  entryPoints: Object.fromEntries(
    migrations.map((name) => [`db/migrations/${name}`, `db/migrations/${name}.ts`]),
  ),
  sourcemap: false,
});
