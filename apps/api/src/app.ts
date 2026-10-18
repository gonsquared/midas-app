import { randomUUID } from 'node:crypto';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, {
  LogController,
  type FastifyError,
  type FastifyInstance,
  type FastifyRequest,
} from 'fastify';
import type { Kysely } from 'kysely';
import { argon2Hasher, type PasswordHasher } from './modules/auth/password-hasher.js';
import type { AuthRepositories, AuthUnitOfWork } from './modules/auth/repository.js';
import { createAuthGuard } from './modules/auth/guard.js';
import { PasswordService } from './modules/auth/password-service.js';
import {
  createPasswordResetTokensRepository,
  createSessionsRepository,
  createUsersRepository,
} from './modules/auth/repository.js';
import { authRoutes } from './modules/auth/routes.js';
import { AuthService } from './modules/auth/service.js';
import { createAccessTokenService } from './modules/auth/tokens.js';
import { createAuthUnitOfWork } from './modules/auth/unit-of-work.js';
import { CategoryService } from './modules/categories/service.js';
import { categoryRoutes } from './modules/categories/routes.js';
import { healthRoutes } from './modules/health/routes.js';
import { TransactionService } from './modules/transactions/service.js';
import { transactionRoutes } from './modules/transactions/routes.js';
import { TransferService } from './modules/transfers/service.js';
import { transferRoutes } from './modules/transfers/routes.js';
import { ProfileService } from './modules/users/service.js';
import { userRoutes } from './modules/users/routes.js';
import { WalletService } from './modules/wallets/service.js';
import { walletRoutes } from './modules/wallets/routes.js';
import { BackgroundTasks } from './platform/background.js';
import { systemClock, type Clock } from './platform/clock.js';
import type { Config } from './platform/config.js';
import type { Database } from './platform/db/database.js';
import { checkDatabase as probeDatabase } from './platform/db/health.js';
import { AppError, buildProblem } from './platform/errors.js';
import { serializeError, serializeRequest } from './platform/logging.js';
import { createMailer, type Mailer } from './platform/mailer/mailer.js';
import { createLimiter, ipKey } from './platform/rate-limit.js';

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
  /** Non-transactional repositories used by the per-request guard. Defaults to the pool. */
  authRepositories?: AuthRepositories;
  mailer?: Mailer;
  /** Test seam: lets tests wait for work that runs after the response (email). */
  background?: BackgroundTasks;
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
 * True for requests that belong to the API. Decided from the route Fastify matched (its registered
 * path, after percent-decoding and normalisation), never from the raw URL: `/%61pi/v1/wallets`
 * reaches the same handler as `/api/v1/wallets` but does not start with `/api/`. A request that
 * matches no route (404) is treated as API traffic, which is the safe side.
 */
export function isApiRequest(request: FastifyRequest): boolean {
  const registered = request.routeOptions?.url;
  return registered === undefined ? true : registered.startsWith('/api/');
}

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
      serializers: { err: serializeError, req: serializeRequest },
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

  app.decorateRequest('auth', null);

  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Request-Id', request.id);
    // API responses carry personal financial data and tokens: never cache them.
    if (isApiRequest(request)) reply.header('Cache-Control', 'no-store');
  });

  // Bodyless POSTs (archive, logout) often still send a JSON content type. Treat an empty body
  // as "no body" instead of a parse error; everything else uses Fastify's hardened JSON parser
  // (rejects __proto__ and constructor payloads).
  const strictJsonParser = app.getDefaultJsonParser('error', 'error');
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    if (body === '') {
      done(null, undefined);
      return;
    }
    strictJsonParser(request, body as string, done);
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
    keyGenerator: (request) => ipKey(request.ip),
    cache: config.rateLimit.maxKeys,
    allowList: () => !config.rateLimit.enabled,
    errorResponseBuilder: (_request, context) =>
      new AppError('RATE_LIMITED', 'Too many requests. Try again later.', {
        retryAfterSeconds: Math.max(1, Math.ceil(context.ttl / 1000)),
      }),
  });

  // CORS exists only for a separate dev origin; in production the SPA is same-origin and the
  // list is empty (config forces that), so no CORS headers are ever sent.
  if (config.cors.origins.length > 0) {
    await app.register(cors, {
      origin: config.cors.origins,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id', 'X-CSRF-Protection'],
      exposedHeaders: [
        'X-Request-Id',
        'RateLimit-Limit',
        'RateLimit-Remaining',
        'RateLimit-Reset',
        'Retry-After',
      ],
      maxAge: 600,
    });
  }

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

  const background =
    deps.background ??
    new BackgroundTasks((error) => app.log.error({ err: error }, 'background task failed'));
  app.addHook('onClose', async () => {
    await background.drain();
  });
  const mailer = deps.mailer ?? createMailer(config, app.log);

  const authRepositories: AuthRepositories = deps.authRepositories ?? {
    users: createUsersRepository(deps.db),
    sessions: createSessionsRepository(deps.db),
    resetTokens: createPasswordResetTokensRepository(deps.db),
  };
  const unitOfWork = deps.authUnitOfWork ?? createAuthUnitOfWork(deps.db);
  const hasher = deps.hasher ?? argon2Hasher;
  const authService = new AuthService({
    unitOfWork,
    repositories: authRepositories,
    hasher,
    accessTokens: createAccessTokenService({
      secret: config.auth.jwtAccessSecret,
      ttlSeconds: config.auth.accessTokenTtlSeconds,
    }),
    clock,
    refreshTokenTtlDays: config.auth.refreshTokenTtlDays,
    sessionAbsoluteTtlDays: config.auth.sessionAbsoluteTtlDays,
    logger: app.log,
  });
  const passwordService = new PasswordService({
    unitOfWork,
    repositories: authRepositories,
    hasher,
    clock,
    mailer,
    background,
    appBaseUrl: config.appBaseUrl,
    logger: app.log,
  });

  // Coarse per-IP ceiling over the whole API, before any route runs.
  const globalIpLimiter = createLimiter(app, {
    name: 'global-ip',
    max: config.rateLimit.globalIpMax,
    windowSeconds: 60,
    key: (request) => ipKey(request.ip),
    maxKeys: config.rateLimit.maxKeys,
  });
  app.addHook('onRequest', async (request, reply) => {
    if (isApiRequest(request)) await globalIpLimiter(request, reply);
  });

  // Public routes (each applies its own rate limits).
  authRoutes(app, { service: authService, passwords: passwordService, config });

  // Everything else lives in one scope whose hooks authenticate every request and apply the
  // per-user limits (architecture 9). A route added here cannot skip them.
  await app.register(async (protectedScope) => {
    protectedScope.addHook('onRequest', createAuthGuard(authService));
    const readLimiter = createLimiter(protectedScope, {
      name: 'user-read',
      max: config.rateLimit.userReadMax,
      windowSeconds: 60,
      key: (request) => request.auth?.userId ?? ipKey(request.ip),
      maxKeys: config.rateLimit.maxKeys,
    });
    const writeLimiter = createLimiter(protectedScope, {
      name: 'user-write',
      max: config.rateLimit.userWriteMax,
      windowSeconds: 60,
      key: (request) => request.auth?.userId ?? ipKey(request.ip),
      maxKeys: config.rateLimit.maxKeys,
    });
    protectedScope.addHook('onRequest', async (request, reply) => {
      const isRead = request.method === 'GET' || request.method === 'HEAD';
      await (isRead ? readLimiter : writeLimiter)(request, reply);
    });

    userRoutes(protectedScope, {
      profiles: new ProfileService(authRepositories),
      passwords: passwordService,
      passwordChangeMax: config.rateLimit.passwordChangeMax,
    });
    walletRoutes(protectedScope, new WalletService({ db: deps.db, clock }));
    categoryRoutes(protectedScope, new CategoryService({ db: deps.db }));
    transactionRoutes(protectedScope, new TransactionService({ db: deps.db }));
    transferRoutes(protectedScope, new TransferService({ db: deps.db }));
  });

  return app;
}
