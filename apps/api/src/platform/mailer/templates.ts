import type { MailMessage } from './mailer.js';

/** Escapes text for inclusion in an HTML element or double-quoted attribute. */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll(String.fromCharCode(39), '&#39;');
}

export const RESET_TOKEN_TTL_MINUTES = 30;

/**
 * The link carries the token in the URL fragment, which browsers never send to servers or in
 * Referer headers (architecture 9).
 */
export function passwordResetMessage(input: {
  to: string;
  displayName: string;
  appBaseUrl: string;
  token: string;
}): MailMessage {
  const link = `${input.appBaseUrl.replace(/\/$/, '')}/reset-password#token=${encodeURIComponent(input.token)}`;
  const text = [
    `Hi ${input.displayName},`,
    '',
    `Use this link to choose a new Midas password. It works once and expires in ${RESET_TOKEN_TTL_MINUTES} minutes:`,
    link,
    '',
    'If you did not ask for this, you can ignore this email. Your password stays the same.',
  ].join('\n');
  const html =
    `<p>Hi ${escapeHtml(input.displayName)},</p>` +
    `<p>Use this link to choose a new Midas password. It works once and expires in ${RESET_TOKEN_TTL_MINUTES} minutes:</p>` +
    `<p><a href="${escapeHtml(link)}">Reset your password</a></p>` +
    '<p>If you did not ask for this, you can ignore this email. Your password stays the same.</p>';
  return { to: input.to, subject: 'Reset your Midas password', text, html, tag: 'password-reset' };
}
