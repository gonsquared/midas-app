/** Reset tokens are 43 base64url characters; anything else is rejected before any request. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{16,256}$/;

/**
 * Reads the reset token from the URL fragment (`#token=...`). The fragment is never sent to a
 * server or logged; the page removes it from the address bar as soon as it has been read.
 */
export function readResetToken(hash: string): string | null {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const token = params.get('token');
  return token !== null && TOKEN_SHAPE.test(token) ? token : null;
}
