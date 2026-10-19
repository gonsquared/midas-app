import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/** Paths that belong to the server, never to the SPA: unknown ones keep the JSON problem 404. */
const SERVER_PATH = /^\/(?:api|health|metrics|assets)(?:\/|$)/i;

export interface WebApp {
  /**
   * For the not-found handler. Sends index.html and returns true for a browser navigation to a
   * client-side route (GET or HEAD, accepts HTML, not a server path); false otherwise.
   */
  fallback(request: FastifyRequest, reply: FastifyReply): boolean;
}

function pathnameOf(request: FastifyRequest): string {
  const raw = request.raw.url ?? '/';
  const pathname = (raw.split('?')[0] ?? '/').replace(/\/{2,}/g, '/');
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

/**
 * Serves the built SPA (apps/web/dist) from the API origin (architecture ADR-004):
 *  - /assets/* are content-hashed by Vite, so they are cached for a year and immutable;
 *  - index.html and the other root files (favicon, theme-init.js) are `no-cache` (revalidated),
 *    so a new release is picked up at once;
 *  - client routes fall back to index.html through `fallback()` in the not-found handler.
 * Security headers and the CSP come from the helmet registration on the app, and API responses
 * stay `no-store` (the onRequest hook in app.ts). Returns undefined, and registers nothing, when
 * the folder has no index.html (for example `pnpm dev` before the first web build).
 */
export async function registerWebApp(
  app: FastifyInstance,
  distDir: string,
): Promise<WebApp | undefined> {
  const root = path.resolve(distDir);
  if (!existsSync(path.join(root, 'index.html'))) {
    app.log.info({ distDir: root }, 'no web build found; serving the API only');
    return undefined;
  }

  // Root files only, decided once at boot. Only plain files: no directories, no dotfiles.
  const rootFiles = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^[A-Za-z0-9][\w.-]*$/.test(entry.name))
    .map((entry) => entry.name);

  // Decorates reply.sendFile. Cache headers are set per route below (cacheControl: false keeps
  // @fastify/static from overwriting them).
  await app.register(fastifyStatic, { root, serve: false, cacheControl: false, index: false });

  const assets = path.join(root, 'assets');
  if (existsSync(assets)) {
    await app.register(fastifyStatic, {
      root: assets,
      prefix: '/assets/',
      decorateReply: false,
      index: false,
      dotfiles: 'deny',
      maxAge: ONE_YEAR_MS,
      immutable: true,
    });
  }

  for (const name of rootFiles) {
    const urls = name === 'index.html' ? ['/', '/index.html'] : [`/${name}`];
    for (const url of urls) {
      app.get(url, async (_request, reply) => {
        reply.header('Cache-Control', 'no-cache');
        return reply.sendFile(name);
      });
    }
  }

  return {
    fallback(request, reply) {
      if (request.method !== 'GET' && request.method !== 'HEAD') return false;
      if (SERVER_PATH.test(pathnameOf(request))) return false;
      if (!(request.headers.accept ?? '').toLowerCase().includes('text/html')) return false;
      reply.code(200).header('Cache-Control', 'no-cache').sendFile('index.html');
      return true;
    },
  };
}
