import { isIP } from 'node:net';
import type { AuthSession, LoginRequest, Preferences, RegisterRequest, Role } from '@midas/shared';
import { v7 as uuidv7 } from 'uuid';
import type { Clock } from '../../platform/clock.js';
import { noopAuditRecorder, type AuditRecorder } from '../audit/service.js';
import { isUniqueViolation } from '../../platform/db/errors.js';
import { AppError } from '../../platform/errors.js';
import type { PasswordHasher } from './password-hasher.js';
import type { AuthRepositories, AuthUnitOfWork, UserRecord } from './repository.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  parseRefreshToken,
  type AccessTokenService,
} from './tokens.js';

export const EMAIL_UNIQUE_CONSTRAINT = 'uq_users__email';
const MS_PER_DAY = 86_400_000;
const USER_AGENT_MAX = 512;
/** A superseded refresh token is tolerated this long after rotation (concurrent tabs; ADR-007). */
export const REFRESH_GRACE_MS = 20_000;
const MAX_REFRESH_ATTEMPTS = 3;

export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
  requestId?: string | null;
}

export interface SessionResult {
  session: AuthSession;
  /** Raw refresh token for the httpOnly cookie. */
  refreshToken: string;
  refreshTokenMaxAgeSeconds: number;
}

export type RegisterResult = SessionResult;

/** The authenticated principal attached to a request by the guard. */
export interface AuthContext {
  userId: string;
  sessionId: string;
  role: Role;
  preferences: Preferences;
}

export interface SecurityLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
}

const noopLogger: SecurityLogger = { info: () => undefined, warn: () => undefined };

export interface AuthServiceDeps {
  unitOfWork: AuthUnitOfWork;
  /** Non-transactional repositories for single-statement reads (the per-request guard). */
  repositories: AuthRepositories;
  hasher: PasswordHasher;
  accessTokens: AccessTokenService;
  clock: Clock;
  refreshTokenTtlDays: number;
  sessionAbsoluteTtlDays: number;
  logger?: SecurityLogger;
  /** Best-effort audit trail for auth events (database design C-07). Defaults to a no-op. */
  audit?: AuditRecorder;
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

function normalizeContext(context: RequestContext) {
  return {
    userAgent: context.userAgent ? context.userAgent.slice(0, USER_AGENT_MAX) : null,
    // The column is inet: anything that is not a valid IP is stored as null.
    ip: context.ip !== null && isIP(context.ip) ? context.ip : null,
  };
}

function sessionInvalid(): AppError {
  return new AppError('SESSION_INVALID', 'The session is no longer valid. Sign in again.');
}

export class AuthService {
  private dummyHash: Promise<string> | undefined;
  private readonly logger: SecurityLogger;
  private readonly audit: AuditRecorder;

  constructor(private readonly deps: AuthServiceDeps) {
    this.logger = deps.logger ?? noopLogger;
    this.audit = deps.audit ?? noopAuditRecorder;
  }

  /**
   * Creates the user and its first session in one transaction. New users get theme `system`
   * (column default); system categories are shared rows, so nothing is copied per user.
   * The unique index is the source of truth for duplicates, which closes the check-then-insert race.
   */
  async register(input: RegisterRequest, context: RequestContext): Promise<SessionResult> {
    const { clock, hasher, unitOfWork, refreshTokenTtlDays } = this.deps;

    const passwordHash = await hasher.hash(input.password);
    const sessionId = uuidv7();
    const refresh = generateRefreshToken(sessionId);
    const now = clock.now();
    const { userAgent, ip } = normalizeContext(context);

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
          userAgent,
          ip,
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

    await this.audit.record({
      actorUserId: user.id,
      action: 'auth.registered',
      targetType: 'user',
      targetId: user.id,
      context,
    });
    return this.buildResult(user, sessionId, refresh.token, refreshTokenTtlDays * 86_400, now);
  }

  /**
   * Verifies credentials. An unknown email costs the same argon2 verification as a wrong password
   * and returns the same error, so neither the response nor its timing reveals which emails exist.
   * A suspended account is reported only after the password was verified.
   */
  async login(input: LoginRequest, context: RequestContext): Promise<SessionResult> {
    const { clock, hasher, unitOfWork, refreshTokenTtlDays } = this.deps;
    const now = clock.now();

    const found = await this.deps.repositories.users.findByEmail(input.email);
    const hashToCheck = found?.passwordHash ?? (await this.getDummyHash());
    const passwordOk = await hasher.verify(hashToCheck, input.password);
    if (!found || !passwordOk) {
      this.logger.info({ event: 'auth.login_failed' }, 'login failed');
      // A known account is named by id; an unknown email is stored only as an HMAC pseudonym.
      const pseudonym = found ? undefined : this.audit.pseudonymize(input.email);
      await this.audit.record({
        actorUserId: found?.id ?? null,
        action: 'auth.login_failed',
        targetType: found ? 'user' : 'system',
        targetId: found?.id ?? null,
        ...(pseudonym !== undefined && { metadata: { emailHmac: pseudonym } }),
        context,
      });
      throw new AppError('INVALID_CREDENTIALS', 'The email or password is incorrect.');
    }
    if (found.status === 'suspended') {
      this.logger.info(
        { event: 'auth.login_blocked_suspended', userId: found.id },
        'login blocked',
      );
      await this.audit.record({
        actorUserId: found.id,
        action: 'auth.login_blocked_suspended',
        targetType: 'user',
        targetId: found.id,
        context,
      });
      throw new AppError('ACCOUNT_SUSPENDED', 'This account has been suspended.');
    }

    const sessionId = uuidv7();
    const refresh = generateRefreshToken(sessionId);
    const { userAgent, ip } = normalizeContext(context);
    await unitOfWork(async ({ users, sessions }) => {
      await users.markLoggedIn(found.id, now);
      await sessions.insert({
        id: sessionId,
        userId: found.id,
        refreshTokenHash: refresh.hash,
        expiresAt: new Date(now.getTime() + refreshTokenTtlDays * MS_PER_DAY),
        userAgent,
        ip,
      });
    });

    this.logger.info({ event: 'auth.login_succeeded', userId: found.id, sessionId }, 'login ok');
    await this.audit.record({
      actorUserId: found.id,
      action: 'auth.login_succeeded',
      targetType: 'session',
      targetId: sessionId,
      context,
    });
    const { passwordHash: _omit, ...user } = found;
    return this.buildResult(user, sessionId, refresh.token, refreshTokenTtlDays * 86_400, now);
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.deps.hasher.hash('midas-timing-equalisation-password');
    return this.dummyHash;
  }

  private async buildResult(
    user: UserRecord,
    sessionId: string,
    refreshToken: string,
    maxAgeSeconds: number,
    now: Date,
  ): Promise<SessionResult> {
    const access = await this.deps.accessTokens.issue({ userId: user.id, sessionId }, now);
    return {
      session: {
        accessToken: access.token,
        accessTokenExpiresAt: access.expiresAt.toISOString(),
        user: toUserDto(user),
      },
      refreshToken,
      refreshTokenMaxAgeSeconds: maxAgeSeconds,
    };
  }

  /**
   * Rotates the refresh token (compare-and-swap, database design C-04). A superseded token seen
   * inside the grace window rotates again; outside it, the token was replayed, so the whole
   * session is revoked (reuse detection, ADR-007). Tokens carry their session id, so a replayed
   * token older than the immediately previous one (no hash match any more) still revokes the
   * session it names. Malformed tokens are rejected without touching the database.
   */
  async refresh(presentedToken: string, context?: RequestContext): Promise<SessionResult> {
    const { clock, unitOfWork, refreshTokenTtlDays, sessionAbsoluteTtlDays } = this.deps;
    const now = clock.now();
    const parsed = parseRefreshToken(presentedToken);
    if (!parsed) throw sessionInvalid();
    const presented = hashRefreshToken(presentedToken);
    const graceStart = new Date(now.getTime() - REFRESH_GRACE_MS);

    let reuse: { userId: string; sessionId: string } | null = null;
    const outcome = await unitOfWork(async ({ sessions, users }) => {
      reuse = null;
      for (let attempt = 0; attempt < MAX_REFRESH_ATTEMPTS; attempt++) {
        const found = await sessions.findByRefreshHash(presented);
        if (!found || found.id !== parsed.sessionId) {
          // Unknown token for a well-formed id: if that session is live, the token is an old,
          // already rotated one (or a forgery naming the session), so end the session.
          const named = await sessions.findById(parsed.sessionId);
          if (named && named.revokedAt === null && named.expiresAt > now) {
            await sessions.revoke(named.id, 'reuse_detected', now);
            this.logger.warn(
              { event: 'auth.session_reuse_detected', userId: named.userId, sessionId: named.id },
              'refresh token reuse detected, session revoked',
            );
            reuse = { userId: named.userId, sessionId: named.id };
          }
          return null;
        }
        if (found.revokedAt !== null || found.expiresAt <= now) return null;

        if (found.userStatus !== 'active') {
          await sessions.revoke(found.id, 'suspended', now);
          return null;
        }
        const absoluteEnd = found.createdAt.getTime() + sessionAbsoluteTtlDays * MS_PER_DAY;
        if (now.getTime() >= absoluteEnd) return null;
        const expiresAt = new Date(
          Math.min(now.getTime() + refreshTokenTtlDays * MS_PER_DAY, absoluteEnd),
        );
        const next = generateRefreshToken(found.id);
        const base = {
          sessionId: found.id,
          presentedHash: presented,
          newHash: next.hash,
          now,
          expiresAt,
        };

        let rotated: boolean;
        if (found.currentRefreshTokenHash.equals(presented)) {
          rotated = await sessions.rotate(base);
        } else {
          const withinGrace = found.rotatedAt !== null && found.rotatedAt >= graceStart;
          if (!withinGrace) {
            await sessions.revoke(found.id, 'reuse_detected', now);
            this.logger.warn(
              { event: 'auth.session_reuse_detected', userId: found.userId, sessionId: found.id },
              'refresh token reuse detected, session revoked',
            );
            reuse = { userId: found.userId, sessionId: found.id };
            return null;
          }
          rotated = await sessions.rotateWithinGrace({ ...base, graceStart });
        }
        // Lost a race against a concurrent refresh: look the session up again and retry.
        if (!rotated) continue;

        const user = await users.findById(found.userId);
        if (!user) return null;
        return {
          user,
          sessionId: found.id,
          token: next.token,
          maxAgeSeconds: Math.max(1, Math.floor((expiresAt.getTime() - now.getTime()) / 1000)),
        };
      }
      return null;
    });

    const reused = reuse as { userId: string; sessionId: string } | null;
    if (reused) {
      await this.audit.record({
        actorUserId: reused.userId,
        action: 'auth.session_reuse_detected',
        targetType: 'session',
        targetId: reused.sessionId,
        ...(context && { context }),
      });
    }
    if (!outcome) throw sessionInvalid();
    return this.buildResult(
      outcome.user,
      outcome.sessionId,
      outcome.token,
      outcome.maxAgeSeconds,
      now,
    );
  }

  /** Revokes the session named by an access token and/or a refresh cookie. Idempotent. */
  async logout(
    input: {
      sessionId?: string | undefined;
      /** Owner of `sessionId`, for the audit trail. */
      userId?: string | undefined;
      refreshToken?: string | undefined;
    },
    context?: RequestContext,
  ): Promise<void> {
    const now = this.deps.clock.now();
    const ended: Array<{ userId: string | null; sessionId: string }> = [];
    await this.deps.unitOfWork(async ({ sessions }) => {
      ended.length = 0;
      let revoked = false;
      if (input.sessionId !== undefined) {
        const done = await sessions.revoke(input.sessionId, 'logout', now);
        if (done) ended.push({ userId: input.userId ?? null, sessionId: input.sessionId });
        revoked = done || revoked;
      }
      if (input.refreshToken !== undefined && parseRefreshToken(input.refreshToken)) {
        const found = await sessions.findByRefreshHash(hashRefreshToken(input.refreshToken));
        if (found) {
          const done = await sessions.revoke(found.id, 'logout', now);
          if (done) ended.push({ userId: found.userId, sessionId: found.id });
          revoked = done || revoked;
        }
      }
      if (revoked) this.logger.info({ event: 'auth.logout' }, 'session revoked on logout');
    });
    for (const session of ended) {
      await this.audit.record({
        actorUserId: session.userId,
        action: 'auth.logout',
        targetType: 'session',
        targetId: session.sessionId,
        ...(context && { context }),
      });
    }
  }

  /**
   * Verifies the access token (signature, algorithm, issuer, audience, expiry) and then loads the
   * session and owner from the database (AP-02), so revocation, expiry, suspension and role changes
   * take effect on the next request. Every failure is the same 401.
   */
  async authenticate(accessToken: string): Promise<AuthContext> {
    const now = this.deps.clock.now();
    let claims: { userId: string; sessionId: string };
    try {
      claims = await this.deps.accessTokens.verify(accessToken, now);
    } catch {
      throw new AppError('UNAUTHENTICATED', 'Authentication is required.');
    }
    const active = await this.deps.repositories.sessions.findActive(
      claims.sessionId,
      claims.userId,
      now,
    );
    if (!active) throw new AppError('UNAUTHENTICATED', 'Authentication is required.');
    return {
      userId: active.userId,
      sessionId: active.sessionId,
      role: active.role,
      preferences: active.preferences,
    };
  }
}
