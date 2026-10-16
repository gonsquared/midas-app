import { RegisterRequestSchema } from '@midas/shared';
import type { FastifyInstance } from 'fastify';
import type { Config } from '../../platform/config.js';
import { validationError } from '../../platform/errors.js';
import type { AuthService } from './service.js';

export const REFRESH_COOKIE = 'midas_rt';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

export function refreshCookie(token: string, maxAgeSeconds: number): string {
  return `${REFRESH_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=${REFRESH_COOKIE_PATH}; Max-Age=${maxAgeSeconds}`;
}

export interface AuthRoutesOptions {
  service: AuthService;
  config: Pick<Config, 'rateLimit'>;
}

export function authRoutes(app: FastifyInstance, options: AuthRoutesOptions): void {
  const { service, config } = options;

  // 5 registrations per hour per IP by default (architecture 9, configurable through env).
  app.post(
    '/api/v1/auth/register',
    {
      config: {
        rateLimit: {
          max: config.rateLimit.registerMax,
          timeWindow: config.rateLimit.registerWindowSeconds * 1000,
        },
      },
    },
    async (request, reply) => {
      const parsed = RegisterRequestSchema.safeParse(request.body);
      if (!parsed.success) throw validationError(parsed.error);

      const userAgent = request.headers['user-agent'];
      const result = await service.register(parsed.data, {
        ip: request.ip,
        userAgent: typeof userAgent === 'string' ? userAgent : null,
      });

      // Log the id only: never the email, password, tokens or request body.
      request.log.info({ userId: result.session.user.id }, 'user registered');

      return reply
        .code(201)
        .header('Cache-Control', 'no-store')
        .header('Set-Cookie', refreshCookie(result.refreshToken, result.refreshTokenMaxAgeSeconds))
        .send(result.session);
    },
  );
}
