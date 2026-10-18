import { z } from 'zod';
import { RoleSchema, ThemeSchema, UserStatusSchema } from './enums.js';
import { CurrencyCodeSchema, LocaleSchema, TimeZoneSchema } from './locale.js';
import { isPasswordStrong, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './password.js';

export const EMAIL_MAX_LENGTH = 254;
export const DISPLAY_NAME_MAX_LENGTH = 80;

/** Control (\p{Cc}, includes NUL) and format/bidi (\p{Cf}) characters are not allowed. */
const FORBIDDEN_NAME_CHARS = /[\p{Cc}\p{Cf}]/u;
export const DisplayNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(DISPLAY_NAME_MAX_LENGTH)
  .refine((value) => !FORBIDDEN_NAME_CHARS.test(value), {
    message: 'Must not contain control or invisible formatting characters.',
  });

/** Trimmed, lowercased, RFC-shaped email (api-contract 4, architecture 9). */
export const EmailSchema = z.string().trim().toLowerCase().max(EMAIL_MAX_LENGTH).pipe(z.email());

export const PreferencesSchema = z.object({
  currency: CurrencyCodeSchema,
  locale: LocaleSchema,
  timezone: TimeZoneSchema,
  theme: ThemeSchema,
});
export type Preferences = z.infer<typeof PreferencesSchema>;

export const UserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string(),
  role: RoleSchema,
  status: UserStatusSchema,
  preferences: PreferencesSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type User = z.infer<typeof UserSchema>;

export const AuthSessionSchema = z.object({
  accessToken: z.string(),
  accessTokenExpiresAt: z.iso.datetime(),
  user: UserSchema,
});
export type AuthSession = z.infer<typeof AuthSessionSchema>;

export const RegisterRequestSchema = z
  .strictObject({
    email: EmailSchema,
    password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
    displayName: DisplayNameSchema,
    currency: CurrencyCodeSchema.default('USD'),
    locale: LocaleSchema.default('en-US'),
    timezone: TimeZoneSchema.default('UTC'),
  })
  .check((ctx) => {
    const { email, password, displayName } = ctx.value;
    if (
      typeof email !== 'string' ||
      typeof displayName !== 'string' ||
      typeof password !== 'string' ||
      password.length < PASSWORD_MIN_LENGTH ||
      password.length > PASSWORD_MAX_LENGTH
    ) {
      return;
    }
    // Only evaluated once the cheap length rules passed (zod skips .check on a failed base).
    const userInputs = [
      email,
      displayName,
      ...email.split(/[^a-z0-9]+/),
      ...displayName.split(/\s+/),
    ];
    if (
      !isPasswordStrong(
        password,
        userInputs.filter((value) => value.length >= 3),
      )
    ) {
      ctx.issues.push({
        code: 'custom',
        input: password,
        path: ['password'],
        message: 'Password is too easy to guess. Use a longer or less predictable passphrase.',
        params: { code: 'WEAK_PASSWORD' },
      });
    }
  });
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

/**
 * Login is deliberately lenient about the email shape (trim and lowercase only): a malformed
 * address must produce the same 401 as an unknown one, never a distinguishable 400.
 */
export const LoginRequestSchema = z.strictObject({
  email: z.string().trim().toLowerCase().min(1).max(EMAIL_MAX_LENGTH),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const ForgotPasswordRequestSchema = z.strictObject({ email: EmailSchema });
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>;

/** Reset tokens are 43 base64url characters; anything longer is rejected before hashing. */
export const ResetTokenSchema = z.string().min(1).max(256);
export const VerifyResetTokenRequestSchema = z.strictObject({ token: ResetTokenSchema });
export type VerifyResetTokenRequest = z.infer<typeof VerifyResetTokenRequestSchema>;

/** Strength (zxcvbn with the user's email and name) is checked by the service. */
export const ResetPasswordRequestSchema = z.strictObject({
  token: ResetTokenSchema,
  newPassword: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
});
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

export const ForgotPasswordResponseSchema = z.object({ status: z.literal('accepted') });

export const UpdatePreferencesSchema = z.strictObject({
  currency: CurrencyCodeSchema.optional(),
  locale: LocaleSchema.optional(),
  timezone: TimeZoneSchema.optional(),
  theme: ThemeSchema.optional(),
});

export const UpdateProfileRequestSchema = z.strictObject({
  displayName: DisplayNameSchema.optional(),
  preferences: UpdatePreferencesSchema.optional(),
});
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;

export const ChangePasswordRequestSchema = z.strictObject({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;
