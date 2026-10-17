/** All user-facing copy for the auth screens lives here (architecture R15). */
export const authStrings = {
  signInTitle: 'Sign in',
  signInSubmit: 'Sign in',
  invalidCredentials: 'Email or password is incorrect.',
  suspendedTitle: 'This account is suspended',
  suspendedBody:
    'You cannot sign in while the account is suspended. Contact the administrator of this Midas service for help.',
  reasons: {
    expired: 'You were signed out. Sign in to continue.',
    'signed-out': 'You have signed out.',
    reset: 'Password updated. Sign in with your new password.',
  },
  registerTitle: 'Create account',
  registerSubmit: 'Create account',
  emailTaken: 'That email cannot be used. Sign in or reset your password.',
  forgotTitle: 'Forgot password',
  forgotIntro: 'Enter the email you signed up with and we will send a reset link.',
  forgotSubmit: 'Send reset link',
  resetTitle: 'Reset password',
  resetSubmit: 'Update password',
  resetInvalid: 'This link has expired or was already used.',
} as const;

export type AuthReason = keyof typeof authStrings.reasons;

export function isAuthReason(value: unknown): value is AuthReason {
  return typeof value === 'string' && Object.hasOwn(authStrings.reasons, value);
}
