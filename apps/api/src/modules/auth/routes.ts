import {
  ForgotPasswordRequestSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
  ResetPasswordRequestSchema,
  VerifyResetTokenRequestSchema,
} from '@midas/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from '../../platform/config.js';
import { AppError, validationError } from '../../platform/errors.js';
import { createLimiter, hashKey, ipKey } from '../../platform/rate-limit.js';
import { parseRefreshToken } from './tokens.js';
import { assertCsrfProtected, bearerToken, readCookie } from './guard.js';
import type { PasswordService } from './password-service.js';
import type { AuthService, RequestContext } from './service.js';

export const REFRESH_COOKIE = 'midas_rt';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

export function refreshCookie(token: string, maxAgeSeconds: number): string {
  return `${REFRESH_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=${REFRESH_COOKIE_PATH}; Max-Age=${maxAgeSeconds}`;
}

export function clearedRefreshCookie(): string {
  return refreshCookie('', 0);
}

export interface AuthRoutesOptions {
  service: AuthService;
  passwords: PasswordService;
  config: Pick<Config, 'rateLimit' | 'appBaseUrl'>;
}

function requestContext(request: FastifyRequest): RequestContext {
  const userAgent = request.headers['user-agent'];
  return { ip: request.ip, userAgent: typeof userAgent === 'string' ? userAgent : null };
}

function sendSession(
  reply: FastifyReply,
  status: number,
  result: { session: unknown; refreshToken: string; refreshTokenMaxAgeSeconds: number },
) {
  return reply
    .code(status)
    .header('Cache-Control', 'no-store')
    .header('Set-Cookie', refreshCookie(result.refreshToken, result.refreshTokenMaxAgeSeconds))
    .send(result.session);
}

export function authRoutes(app: FastifyInstance, options: AuthRoutesOptions): void {
  const { service, passwords, config } = options;
  const { rateLimit } = config;
  const appOrigin = new URL(config.appBaseUrl).origin;
  const ip = (request: FastifyRequest) => ipKey(request.ip);
  const maxKeys = rateLimit.maxKeys;

  const loginPerIp = createLimiter(app, {
    name: 'login-ip',
    max: rateLimit.loginIpMax,
    windowSeconds: 60,
    key: ip,
    maxKeys,
  });
  const loginPerEmail = createLimiter(app, {
    name: 'login-email',
    max: rateLimit.loginMax,
    windowSeconds: 60,
    key: ip,
    maxKeys,
  });
  const forgotPerEmail = createLimiter(app, {
    name: 'forgot-email',
    max: rateLimit.forgotEmailMax,
    windowSeconds: 3600,
    key: ip,
    maxKeys,
  });
  // Per account across all IPs (credential stuffing from a botnet), keyed on the email hash alone.
  const loginPerAccount = createLimiter(app, {
    name: 'login-account',
    max: rateLimit.loginAccountMax,
    windowSeconds: 3600,
    key: ip,
    maxKeys,
  });
  // Per session when the cookie names one (shared NATs do not share a bucket); IP otherwise.
  const refreshLimiter = createLimiter(app, {
    name: 'refresh',
    max: rateLimit.refreshMax,
    windowSeconds: 60,
    key: (request) => {
      const token = readCookie(request.headers.cookie, REFRESH_COOKIE);
      const parsed = token ? parseRefreshToken(token) : null;
      return parsed ? `sid:${hashKey(parsed.sessionId)}` : `ip:${ip(request)}`;
    },
    maxKeys,
  });
  const forgotPerIp = createLimiter(app, {
    name: 'forgot-ip',
    max: rateLimit.forgotIpMax,
    windowSeconds: 3600,
    key: ip,
    maxKeys,
  });
  const resetPerIp = createLimiter(app, {
    name: 'reset-ip',
    max: rateLimit.resetMax,
    windowSeconds: 3600,
    key: ip,
    maxKeys,
  });

  // 5 registrations per hour per IP by default (architecture 9, configurable through env).
  app.post(
    '/api/v1/auth/register',
    {
      config: {
        rateLimit: {
          max: rateLimit.registerMax,
          timeWindow: rateLimit.registerWindowSeconds * 1000,
          cache: maxKeys,
        },
      },
    },
    async (request, reply) => {
      const parsed = RegisterRequestSchema.safeParse(request.body);
      if (!parsed.success) throw validationError(parsed.error);

      const result = await service.register(parsed.data, requestContext(request));

      // Log the id only: never the email, password, tokens or request body.
      request.log.info({ userId: result.session.user.id }, 'user registered');
      return sendSession(reply, 201, result);
    },
  );

  // Limits (architecture 9): 5/min per IP + email and 20/min per IP. The IP limit also counts
  // malformed bodies; the per-email limit needs a parsed email.
  app.post('/api/v1/auth/login', async (request, reply) => {
    await loginPerIp(request, reply);
    const parsed = LoginRequestSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error);
    await loginPerEmail(request, reply, `${ip(request)}:${hashKey(parsed.data.email)}`);
    await loginPerAccount(request, reply, hashKey(parsed.data.email));

    const result = await service.login(parsed.data, requestContext(request));
    return sendSession(reply, 200, result);
  });

  app.post('/api/v1/auth/refresh', async (request, reply) => {
    assertCsrfProtected(request, appOrigin);
    await refreshLimiter(request, reply);
    const token = readCookie(request.headers.cookie, REFRESH_COOKIE);
    try {
      if (!token)
        throw new AppError('SESSION_INVALID', 'The session is no longer valid. Sign in again.');
      const result = await service.refresh(token);
      return sendSession(reply, 200, result);
    } catch (error) {
      // A failed refresh always clears the cookie (api-contract 1.6).
      reply.header('Set-Cookie', clearedRefreshCookie());
      throw error;
    }
  });

  app.post('/api/v1/auth/logout', async (request, reply) => {
    // A bearer token is not CSRF-prone; the cookie path needs the CSRF checks.
    let sessionId: string | undefined;
    const bearer = bearerToken(request.headers.authorization);
    if (bearer) {
      sessionId = await service
        .authenticate(bearer)
        .then((context) => context.sessionId)
        .catch(() => undefined);
    }
    if (sessionId === undefined) assertCsrfProtected(request, appOrigin);

    await service.logout({
      sessionId,
      refreshToken: readCookie(request.headers.cookie, REFRESH_COOKIE),
    });
    return reply
      .code(204)
      .header('Cache-Control', 'no-store')
      .header('Set-Cookie', clearedRefreshCookie())
      .send();
  });

  app.post('/api/v1/auth/password/forgot', async (request, reply) => {
    await forgotPerIp(request, reply);
    const parsed = ForgotPasswordRequestSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error);
    // 3/hour per email hash; identical for known and unknown addresses.
    await forgotPerEmail(request, reply, hashKey(parsed.data.email));

    passwords.requestReset(parsed.data.email);
    return reply.code(202).header('Cache-Control', 'no-store').send({ status: 'accepted' });
  });

  app.post('/api/v1/auth/password/reset/verify', async (request, reply) => {
    await resetPerIp(request, reply);
    const parsed = VerifyResetTokenRequestSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error);
    await passwords.verifyResetToken(parsed.data.token);
    return reply.code(204).header('Cache-Control', 'no-store').send();
  });

  app.post('/api/v1/auth/password/reset', async (request, reply) => {
    await resetPerIp(request, reply);
    const parsed = ResetPasswordRequestSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error);
    await passwords.resetPassword(parsed.data);
    return reply.code(204).header('Cache-Control', 'no-store').send();
  });
}
