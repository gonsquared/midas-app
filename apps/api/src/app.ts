import { randomUUID } from 'node:crypto';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { LogController, type FastifyError, type FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { argon2Hasher, type PasswordHasher } from './modules/auth/password-hasher.js';
import type { AuthUnitOfWork } from './modules/auth/repository.js';
import { authRoutes } from './modules/auth/routes.js';
import { AuthService } from './modules/auth/service.js';
import { createAccessTokenService } from './modules/auth/tokens.js';
import { createAuthUnitOfWork } from './modules/auth/unit-of-work.js';
import { healthRoutes } from './modules/health/routes.js';
import { systemClock, type Clock } from './platform/clock.js';
import type { Config } from './platform/config.js';
import type { Database } from './platform/db/database.js';
import { checkDatabase as probeDatabase } from './platform/db/health.js';
import { AppError, buildProblem } from './platform/errors.js';
import { serializeError } from './platform/logging.js';

/** Accepted inbound request id format (api-contract 1.6). */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;
const PROBLEM_JSON = 'application/problem+json; charset=utf-8';

export interface AppDeps {
  config: Config;
  db: Kysely<Database>;
  clock?: Clock;
  /** Test seams. Defaults are the production implementations. */
  hasher?: PasswordHasher;
  authUnitOfWork?: AuthUnitOfWork;
  checkDatabase?: () => Promise<boolean>;
  /** Test seam: capture structured log lines. */
  logStream?: { write(line: string): void };
}

const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.accessToken',
  '*.refreshToken',
];

/**
 * Builds the Fastify instance. Nothing listens here, so tests drive it through `inject()`
 * (architecture 13.1).
 */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config } = deps;
  const clock = deps.clock ?? systemClock;
  const startedAt = clock.now().getTime();

  const app = Fastify({
    logger: {
      level: config.logLevel,
      serializers: { err: serializeError },
      redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
      ...(deps.logStream && { stream: deps.logStream }),
    },
    requestIdHeader: false,
    logController: new LogController({ requestIdLogLabel: 'requestId' }),
    genReqId: (request) => {
      const inbound = request.headers['x-request-id'];
      return typeof inbound === 'string' && REQUEST_ID_PATTERN.test(inbound)
        ? inbound
        : randomUUID();
    },
    // N hops: trust the N nearest proxies (proxy-addr hop index starts at 0 for the socket peer).
    trustProxy: config.trustProxy > 0 ? (_address, hop) => hop < config.trustProxy : false,
    bodyLimit: 64 * 1024,
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Request-Id', request.id);
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        objectSrc: ["'none'"],
      },
    },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
    hsts: config.env === 'production' ? { maxAge: 15_552_000, includeSubDomains: true } : false,
  });

  await app.register(rateLimit, {
    global: false,
    enableDraftSpec: true,
    keyGenerator: (request) => request.ip,
    allowList: () => !config.rateLimit.enabled,
    errorResponseBuilder: (_request, context) =>
      new AppError('RATE_LIMITED', 'Too many requests. Try again later.', {
        retryAfterSeconds: Math.max(1, Math.ceil(context.ttl / 1000)),
      }),
  });

  app.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    const base = { instance: request.url.split('?')[0] ?? request.url, requestId: request.id };

    if (error instanceof AppError) {
      request.log.info({ code: error.code }, 'request rejected');
      if (error.retryAfterSeconds !== undefined) {
        reply.header('Retry-After', String(error.retryAfterSeconds));
      }
      return reply
        .code(error.status)
        .type(PROBLEM_JSON)
        .send(
          buildProblem({ code: error.code, detail: error.detail, errors: error.errors, ...base }),
        );
    }

    // Fastify's own 4xx errors: malformed JSON, empty body, oversized body, wrong media type.
    const fastifyError = error as FastifyError;
    if (fastifyError.statusCode !== undefined && fastifyError.statusCode < 500) {
      request.log.info({ fastifyCode: fastifyError.code }, 'request rejected');
      return reply
        .code(400)
        .type(PROBLEM_JSON)
        .send(
          buildProblem({
            code: 'VALIDATION_FAILED',
            detail: 'The request could not be processed.',
            ...base,
          }),
        );
    }

    // Unexpected: full detail goes to the log, never to the client.
    request.log.error({ err: error }, 'unhandled error');
    return reply
      .code(500)
      .type(PROBLEM_JSON)
      .send(
        buildProblem({ code: 'INTERNAL_ERROR', detail: 'An unexpected error occurred.', ...base }),
      );
  });

  app.setNotFoundHandler((request, reply) =>
    reply
      .code(404)
      .type(PROBLEM_JSON)
      .send(
        buildProblem({
          code: 'NOT_FOUND',
          detail: 'The requested resource was not found.',
          instance: request.url.split('?')[0] ?? request.url,
          requestId: request.id,
        }),
      ),
  );

  healthRoutes(app, {
    version: config.appVersion,
    checkDatabase: deps.checkDatabase ?? (() => probeDatabase(deps.db)),
    startedAt,
    now: () => clock.now().getTime(),
  });

  const authService = new AuthService({
    unitOfWork: deps.authUnitOfWork ?? createAuthUnitOfWork(deps.db),
    hasher: deps.hasher ?? argon2Hasher,
    accessTokens: createAccessTokenService({
      secret: config.auth.jwtAccessSecret,
      ttlSeconds: config.auth.accessTokenTtlSeconds,
    }),
    clock,
    refreshTokenTtlDays: config.auth.refreshTokenTtlDays,
  });
  authRoutes(app, { service: authService, config });

  return app;
}
