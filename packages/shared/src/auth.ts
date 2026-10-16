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
