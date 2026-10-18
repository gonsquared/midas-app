import { describe, expect, it } from 'vitest';
import {
  ChangePasswordRequestSchema,
  ForgotPasswordRequestSchema,
  LoginRequestSchema,
  ResetPasswordRequestSchema,
  UpdateProfileRequestSchema,
} from './auth.js';

describe('LoginRequestSchema', () => {
  it('trims and lowercases the email but does not validate its shape', () => {
    expect(LoginRequestSchema.parse({ email: '  Not-An-Email ', password: 'x' })).toEqual({
      email: 'not-an-email',
      password: 'x',
    });
  });

  it.each([
    ['unknown field', { email: 'a@b.co', password: 'x', role: 'admin' }],
    ['empty password', { email: 'a@b.co', password: '' }],
    ['huge password', { email: 'a@b.co', password: 'x'.repeat(129) }],
    ['empty email', { email: ' ', password: 'x' }],
    ['non-string', { email: 5, password: 'x' }],
  ])('rejects %s', (_name, input) => {
    expect(LoginRequestSchema.safeParse(input).success).toBe(false);
  });
});

describe('password reset schemas', () => {
  it('forgot requires a well-formed email and nothing else', () => {
    expect(ForgotPasswordRequestSchema.safeParse({ email: 'a@example.com' }).success).toBe(true);
    expect(ForgotPasswordRequestSchema.safeParse({ email: 'nope' }).success).toBe(false);
    expect(ForgotPasswordRequestSchema.safeParse({ email: 'a@example.com', x: 1 }).success).toBe(
      false,
    );
  });

  it('reset enforces the password length bounds and a bounded token', () => {
    const token = 'a'.repeat(43);
    expect(
      ResetPasswordRequestSchema.safeParse({ token, newPassword: 'x'.repeat(12) }).success,
    ).toBe(true);
    expect(
      ResetPasswordRequestSchema.safeParse({ token, newPassword: 'x'.repeat(11) }).success,
    ).toBe(false);
    expect(
      ResetPasswordRequestSchema.safeParse({ token, newPassword: 'x'.repeat(129) }).success,
    ).toBe(false);
    expect(
      ResetPasswordRequestSchema.safeParse({ token: 'a'.repeat(257), newPassword: 'x'.repeat(12) })
        .success,
    ).toBe(false);
  });
});

describe('profile schemas', () => {
  it('accepts partial updates and validates currency, locale and time zone', () => {
    expect(UpdateProfileRequestSchema.safeParse({}).success).toBe(true);
    expect(
      UpdateProfileRequestSchema.safeParse({
        preferences: { currency: 'EUR', locale: 'de-DE', timezone: 'Europe/Berlin', theme: 'dark' },
      }).success,
    ).toBe(true);
    expect(UpdateProfileRequestSchema.safeParse({ preferences: { currency: 'ZZZ' } }).success).toBe(
      false,
    );
    expect(UpdateProfileRequestSchema.safeParse({ preferences: { locale: 'en_US' } }).success).toBe(
      false,
    );
    expect(
      UpdateProfileRequestSchema.safeParse({ preferences: { timezone: 'Nowhere/Land' } }).success,
    ).toBe(false);
    expect(UpdateProfileRequestSchema.safeParse({ email: 'a@b.co' }).success).toBe(false);
  });

  it('password change needs both passwords and bounds the new one', () => {
    expect(
      ChangePasswordRequestSchema.safeParse({ currentPassword: 'x', newPassword: 'y'.repeat(12) })
        .success,
    ).toBe(true);
    expect(
      ChangePasswordRequestSchema.safeParse({ currentPassword: '', newPassword: 'y'.repeat(12) })
        .success,
    ).toBe(false);
    expect(
      ChangePasswordRequestSchema.safeParse({ currentPassword: 'x', newPassword: 'short' }).success,
    ).toBe(false);
  });
});
