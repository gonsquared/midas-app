/*
 * Client-side validation for the auth forms. This is UX only: the API validates everything again
 * and stays the authority (including password strength). The numeric limits mirror
 * @midas/shared; validation.test.ts fails if they drift.
 */
export const EMAIL_MAX = 254;
export const DISPLAY_NAME_MAX = 80;
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Control and invisible formatting characters are rejected by the API.
const FORBIDDEN_NAME_CHARS = /[\p{Cc}\p{Cf}]/u;

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export function validateEmail(value: string): string | undefined {
  const email = value.trim();
  if (!email) return 'Enter your email address.';
  if (email.length > EMAIL_MAX) return `Use ${EMAIL_MAX} characters or fewer.`;
  if (!EMAIL_SHAPE.test(email)) return 'Enter an email address like name@example.com.';
  return undefined;
}

export function validateDisplayName(value: string): string | undefined {
  const name = value.trim();
  if (!name) return 'Enter your name.';
  if (name.length > DISPLAY_NAME_MAX) return `Use ${DISPLAY_NAME_MAX} characters or fewer.`;
  if (FORBIDDEN_NAME_CHARS.test(name)) return 'Remove special or invisible characters.';
  return undefined;
}

export function validateNewPassword(value: string): string | undefined {
  if (!value) return 'Enter a password.';
  if (value.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (value.length > PASSWORD_MAX) return `Use ${PASSWORD_MAX} characters or fewer.`;
  return undefined;
}

export type LoginField = 'email' | 'password';

export function validateLogin(input: { email: string; password: string }): FieldErrors<LoginField> {
  const errors: FieldErrors<LoginField> = {};
  // Sign-in is deliberately lenient about the email shape (the server answers a malformed address
  // like an unknown one), so only emptiness is checked here.
  if (!input.email.trim()) errors.email = 'Enter your email address.';
  if (!input.password) errors.password = 'Enter your password.';
  return errors;
}

export type RegisterField = 'displayName' | 'email' | 'password';

export function validateRegister(input: {
  displayName: string;
  email: string;
  password: string;
}): FieldErrors<RegisterField> {
  const errors: FieldErrors<RegisterField> = {};
  const name = validateDisplayName(input.displayName);
  const email = validateEmail(input.email);
  const password = validateNewPassword(input.password);
  if (name) errors.displayName = name;
  if (email) errors.email = email;
  if (password) errors.password = password;
  return errors;
}
