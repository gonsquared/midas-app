import { createHash, randomBytes } from 'node:crypto';
import type { ChangePasswordRequest, ResetPasswordRequest } from '@midas/shared';
import type { BackgroundTasks } from '../../platform/background.js';
import type { Clock } from '../../platform/clock.js';
import { isUniqueViolation } from '../../platform/db/errors.js';
import { AppError } from '../../platform/errors.js';
import type { Mailer } from '../../platform/mailer/mailer.js';
import { passwordResetMessage, RESET_TOKEN_TTL_MINUTES } from '../../platform/mailer/templates.js';
import { assertStrongPassword } from './password-policy.js';
import type { PasswordHasher } from './password-hasher.js';
import type { AuthRepositories, AuthUnitOfWork } from './repository.js';
import { noopAuditRecorder, type AuditRecorder } from '../audit/service.js';
import type { RequestContext, SecurityLogger } from './service.js';

/** At most one outstanding reset token per user (database design 9.2). */
export const RESET_OUTSTANDING_CONSTRAINT = 'uq_password_reset_tokens__user_outstanding';

export function generateResetToken(): { token: string; hash: Buffer } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashResetToken(token) };
}

/** Only this digest is stored; the raw token exists in the email and nowhere else. */
export function hashResetToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

export interface PasswordServiceDeps {
  unitOfWork: AuthUnitOfWork;
  repositories: AuthRepositories;
  hasher: PasswordHasher;
  clock: Clock;
  mailer: Mailer;
  background: BackgroundTasks;
  appBaseUrl: string;
  logger: SecurityLogger;
  /** Best-effort audit trail (database design C-07). Defaults to a no-op. */
  audit?: AuditRecorder;
}

function resetTokenInvalid(): AppError {
  return new AppError('RESET_TOKEN_INVALID', 'The reset link is invalid or has expired.');
}

export class PasswordService {
  private readonly audit: AuditRecorder;

  constructor(private readonly deps: PasswordServiceDeps) {
    this.audit = deps.audit ?? noopAuditRecorder;
  }

  /**
   * Always succeeds from the caller point of view. The lookup, token creation and email run after
   * the response, so neither the body nor the timing depends on whether the email is registered.
   */
  requestReset(email: string, context?: RequestContext): void {
    this.deps.background.run(async () => {
      const { repositories, unitOfWork, clock, mailer, appBaseUrl, logger } = this.deps;
      const user = await repositories.users.findByEmail(email);
      if (!user || user.status !== 'active') {
        logger.info({ event: 'auth.password_reset_requested', known: false }, 'reset requested');
        return;
      }
      const now = clock.now();
      const { token, hash } = generateResetToken();
      try {
        await unitOfWork(async ({ resetTokens }) => {
          // A new request invalidates earlier links (architecture 9).
          await resetTokens.deleteOutstanding(user.id);
          await resetTokens.insert({
            userId: user.id,
            tokenHash: hash,
            expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MINUTES * 60_000),
          });
        });
      } catch (error) {
        // A concurrent request for the same account won the race and already issued a link.
        // Not an error: the endpoint answered 202 either way (database design 9.2).
        if (isUniqueViolation(error, RESET_OUTSTANDING_CONSTRAINT)) {
          logger.info(
            { event: 'auth.password_reset_coalesced', userId: user.id },
            'concurrent reset request already issued a link',
          );
          return;
        }
        throw error;
      }
      logger.info(
        { event: 'auth.password_reset_requested', known: true, userId: user.id },
        'reset requested',
      );
      await this.audit.record({
        actorUserId: user.id,
        action: 'auth.password_reset_requested',
        targetType: 'user',
        targetId: user.id,
        ...(context && { context }),
      });
      // After commit, never inside the transaction (database design 9.2).
      await mailer.send(
        passwordResetMessage({ to: user.email, displayName: user.displayName, appBaseUrl, token }),
      );
    });
  }

  /** Checks a token without consuming it. */
  async verifyResetToken(token: string): Promise<void> {
    const valid = await this.deps.repositories.resetTokens.isValid(
      hashResetToken(token),
      this.deps.clock.now(),
    );
    if (!valid) throw resetTokenInvalid();
  }

  /**
   * Consumes the token with one guarded UPDATE, sets the new password and revokes every session
   * in the same transaction (database design C-08). A weak password rolls the consumption back,
   * so the user can retry with the same link.
   */
  async resetPassword(input: ResetPasswordRequest, context?: RequestContext): Promise<void> {
    const { repositories, unitOfWork, clock, hasher, logger } = this.deps;
    const tokenHash = hashResetToken(input.token);
    if (!(await repositories.resetTokens.isValid(tokenHash, clock.now())))
      throw resetTokenInvalid();

    const passwordHash = await hasher.hash(input.newPassword);
    const now = clock.now();
    const userId = await unitOfWork(async ({ resetTokens, users, sessions }) => {
      const consumedFor = await resetTokens.consume(tokenHash, now);
      if (consumedFor === null) throw resetTokenInvalid();
      const user = await users.findById(consumedFor);
      if (!user) throw resetTokenInvalid();
      assertStrongPassword(input.newPassword, user, 'newPassword');
      await users.updatePassword(user.id, passwordHash);
      await sessions.revokeAllForUser(user.id, 'password_reset', now);
      return user.id;
    });
    logger.info({ event: 'auth.password_reset_completed', userId }, 'password reset completed');
    await this.audit.record({
      actorUserId: userId,
      action: 'auth.password_reset_completed',
      targetType: 'user',
      targetId: userId,
      ...(context && { context }),
    });
  }

  /** Changes the password of the signed-in user and revokes every other session. */
  async changePassword(
    principal: { userId: string; sessionId: string },
    input: ChangePasswordRequest,
    context?: RequestContext,
  ): Promise<void> {
    const { unitOfWork, repositories, hasher, clock, logger } = this.deps;

    // Everything expensive (argon2 verify, zxcvbn, argon2 hash) runs before the transaction, so
    // the users row lock and the pool connection are held only for the cheap part.
    const [user, currentHash] = await Promise.all([
      repositories.users.findById(principal.userId),
      repositories.users.findPasswordHash(principal.userId),
    ]);
    if (!user) throw new AppError('UNAUTHENTICATED', 'Authentication is required.');
    if (currentHash === null || !(await hasher.verify(currentHash, input.currentPassword))) {
      throw new AppError('INVALID_CURRENT_PASSWORD', 'The current password is incorrect.');
    }
    if (input.newPassword === input.currentPassword) {
      throw new AppError('VALIDATION_FAILED', 'The request is invalid.', {
        errors: [
          {
            field: 'newPassword',
            code: 'SAME_AS_CURRENT',
            message: 'The new password must be different from the current one.',
          },
        ],
      });
    }
    assertStrongPassword(input.newPassword, user, 'newPassword');
    const newHash = await hasher.hash(input.newPassword);

    await unitOfWork(async ({ users, sessions }) => {
      // Optimistic version check: if the credential changed while we were hashing (a concurrent
      // change or reset), the password we verified is no longer the current one.
      const lockedHash = await users.findPasswordHashForUpdate(principal.userId);
      if (lockedHash !== currentHash) {
        throw new AppError('INVALID_CURRENT_PASSWORD', 'The current password is incorrect.');
      }
      await users.updatePassword(principal.userId, newHash);
      await sessions.revokeAllForUser(
        principal.userId,
        'password_changed',
        clock.now(),
        principal.sessionId,
      );
    });
    logger.info({ event: 'user.password_changed', userId: principal.userId }, 'password changed');
    await this.audit.record({
      actorUserId: principal.userId,
      action: 'user.password_changed',
      targetType: 'user',
      targetId: principal.userId,
      ...(context && { context }),
    });
  }
}
