import { ChangePasswordRequestSchema, UpdateProfileRequestSchema } from '@midas/shared';
import type { FastifyInstance } from 'fastify';
import { validationError } from '../../platform/errors.js';
import { createLimiter } from '../../platform/rate-limit.js';
import { requireAuth } from '../auth/guard.js';
import type { PasswordService } from '../auth/password-service.js';
import type { ProfileService } from './service.js';

export interface UserRoutesOptions {
  profiles: ProfileService;
  passwords: PasswordService;
  passwordChangeMax: number;
}

/** Registered inside the guarded scope: every handler can rely on `request.auth`. */
export function userRoutes(app: FastifyInstance, options: UserRoutesOptions): void {
  const { profiles, passwords } = options;
  const passwordChangeLimiter = createLimiter(app, {
    name: 'password-change',
    max: options.passwordChangeMax,
    windowSeconds: 3600,
    key: (request) => requireAuth(request).userId,
  });

  app.get('/api/v1/me', async (request) => profiles.get(requireAuth(request).userId));

  app.patch('/api/v1/me', async (request) => {
    const parsed = UpdateProfileRequestSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error);
    return profiles.update(requireAuth(request).userId, parsed.data);
  });

  app.post('/api/v1/me/password', async (request, reply) => {
    // Brute-force guard for the current-password check, on top of the general per-user limit.
    await passwordChangeLimiter(request, reply);
    const parsed = ChangePasswordRequestSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error);
    await passwords.changePassword(requireAuth(request), parsed.data);
    return reply.code(204).send();
  });
}
