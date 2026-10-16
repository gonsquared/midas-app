import { isIP } from 'node:net';
import type { AuthSession, RegisterRequest } from '@midas/shared';
import { v7 as uuidv7 } from 'uuid';
import type { Clock } from '../../platform/clock.js';
import { isUniqueViolation } from '../../platform/db/errors.js';
import { AppError } from '../../platform/errors.js';
import type { PasswordHasher } from './password-hasher.js';
import type { AuthUnitOfWork, UserRecord } from './repository.js';
import { generateRefreshToken, type AccessTokenService } from './tokens.js';

export const EMAIL_UNIQUE_CONSTRAINT = 'uq_users__email';
const MS_PER_DAY = 86_400_000;
const USER_AGENT_MAX = 512;

export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
}

export interface RegisterResult {
  session: AuthSession;
  /** Raw refresh token for the httpOnly cookie. */
  refreshToken: string;
  refreshTokenMaxAgeSeconds: number;
}

export interface AuthServiceDeps {
  unitOfWork: AuthUnitOfWork;
  hasher: PasswordHasher;
  accessTokens: AccessTokenService;
  clock: Clock;
  refreshTokenTtlDays: number;
}

export function toUserDto(user: UserRecord): AuthSession['user'] {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    preferences: user.preferences,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export class AuthService {
  constructor(private readonly deps: AuthServiceDeps) {}

  /**
   * Creates the user and its first session in one transaction. New users get theme `system`
   * (column default); system categories are shared rows, so nothing is copied per user.
   * The unique index is the source of truth for duplicates, which closes the check-then-insert race.
   */
  async register(input: RegisterRequest, context: RequestContext): Promise<RegisterResult> {
    const { clock, hasher, accessTokens, unitOfWork, refreshTokenTtlDays } = this.deps;

    const passwordHash = await hasher.hash(input.password);
    const refresh = generateRefreshToken();
    const now = clock.now();
    const sessionId = uuidv7();

    let user: UserRecord;
    try {
      user = await unitOfWork(async ({ users, sessions }) => {
        const created = await users.insert({
          id: uuidv7(),
          email: input.email,
          passwordHash,
          displayName: input.displayName,
          preferences: {
            currency: input.currency,
            locale: input.locale,
            timezone: input.timezone,
          },
        });
        await sessions.insert({
          id: sessionId,
          userId: created.id,
          refreshTokenHash: refresh.hash,
          expiresAt: new Date(now.getTime() + refreshTokenTtlDays * MS_PER_DAY),
          userAgent: context.userAgent ? context.userAgent.slice(0, USER_AGENT_MAX) : null,
          // The column is inet: anything that is not a valid IP is stored as null.
          ip: context.ip !== null && isIP(context.ip) ? context.ip : null,
        });
        return created;
      });
    } catch (error) {
      if (isUniqueViolation(error, EMAIL_UNIQUE_CONSTRAINT)) {
        throw new AppError('EMAIL_TAKEN', 'An account with this email already exists.', {
          errors: [
            {
              field: 'email',
              code: 'EMAIL_TAKEN',
              message: 'An account with this email already exists.',
            },
          ],
        });
      }
      throw error;
    }

    const access = await accessTokens.issue({ userId: user.id, sessionId }, now);
    return {
      session: {
        accessToken: access.token,
        accessTokenExpiresAt: access.expiresAt.toISOString(),
        user: toUserDto(user),
      },
      refreshToken: refresh.token,
      refreshTokenMaxAgeSeconds: refreshTokenTtlDays * 86_400,
    };
  }
}
