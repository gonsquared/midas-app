import { isPasswordStrong } from '@midas/shared';
import { AppError } from '../../platform/errors.js';

/** Words from the account that zxcvbn must treat as guessable. */
export function passwordUserInputs(user: { email: string; displayName: string }): string[] {
  return [
    user.email,
    user.displayName,
    ...user.email.split(/[^a-z0-9]+/),
    ...user.displayName.split(/\s+/),
  ].filter((value) => value.length >= 3);
}

export function weakPasswordError(field: string): AppError {
  return new AppError('VALIDATION_FAILED', 'The request is invalid.', {
    errors: [
      {
        field,
        code: 'WEAK_PASSWORD',
        message: 'Password is too easy to guess. Use a longer or less predictable passphrase.',
      },
    ],
  });
}

export function assertStrongPassword(
  password: string,
  user: { email: string; displayName: string },
  field: string,
): void {
  if (!isPasswordStrong(password, passwordUserInputs(user))) throw weakPasswordError(field);
}
