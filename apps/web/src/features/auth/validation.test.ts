import {
  DISPLAY_NAME_MAX_LENGTH,
  EMAIL_MAX_LENGTH,
  LoginRequestSchema,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@midas/shared';
import { describe, expect, it } from 'vitest';
import {
  DISPLAY_NAME_MAX,
  EMAIL_MAX,
  PASSWORD_MAX,
  PASSWORD_MIN,
  validateDisplayName,
  validateEmail,
  validateLogin,
  validateNewPassword,
  validateRegister,
} from './validation';

describe('limits mirror the shared package', () => {
  it('has not drifted', () => {
    expect(PASSWORD_MIN).toBe(PASSWORD_MIN_LENGTH);
    expect(PASSWORD_MAX).toBe(PASSWORD_MAX_LENGTH);
    expect(EMAIL_MAX).toBe(EMAIL_MAX_LENGTH);
    expect(DISPLAY_NAME_MAX).toBe(DISPLAY_NAME_MAX_LENGTH);
  });
});

describe('validateEmail', () => {
  it('accepts normal addresses and rejects malformed ones', () => {
    expect(validateEmail(' kim@example.com ')).toBeUndefined();
    expect(validateEmail('')).toMatch(/Enter your email/);
    expect(validateEmail('kim')).toMatch(/name@example.com/);
    expect(validateEmail('kim@x')).toMatch(/name@example.com/);
    expect(validateEmail(`${'a'.repeat(250)}@example.com`)).toMatch(/254/);
  });
});

describe('validateDisplayName', () => {
  it('requires a trimmed name without invisible characters', () => {
    expect(validateDisplayName('Kim Morgan')).toBeUndefined();
    expect(validateDisplayName('   ')).toMatch(/Enter your name/);
    expect(validateDisplayName('x'.repeat(81))).toMatch(/80/);
    expect(validateDisplayName(`Kim${String.fromCharCode(0x202e)}Morgan`)).toMatch(/invisible/);
    expect(validateDisplayName('Kim\u0000')).toMatch(/invisible/);
  });
});

describe('validateNewPassword', () => {
  it('enforces the length window only (strength is the server job)', () => {
    expect(validateNewPassword('')).toMatch(/Enter a password/);
    expect(validateNewPassword('short')).toMatch(/at least 12/);
    expect(validateNewPassword('x'.repeat(129))).toMatch(/128/);
    expect(validateNewPassword('x'.repeat(12))).toBeUndefined();
  });
});

describe('form validators', () => {
  it('login only requires both values', () => {
    expect(validateLogin({ email: '', password: '' })).toEqual({
      email: 'Enter your email address.',
      password: 'Enter your password.',
    });
    expect(validateLogin({ email: 'not-an-email', password: 'x' })).toEqual({});
    expect(LoginRequestSchema.safeParse({ email: 'not-an-email', password: 'x' }).success).toBe(
      true,
    );
  });

  it('register reports every invalid field', () => {
    const errors = validateRegister({ displayName: '', email: 'bad', password: 'short' });
    expect(Object.keys(errors).sort()).toEqual(['displayName', 'email', 'password']);
    expect(
      validateRegister({
        displayName: 'Kim',
        email: 'kim@example.com',
        password: 'correct horse battery staple',
      }),
    ).toEqual({});
  });
});
