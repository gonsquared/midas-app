const DEFAULT_REVOKE_DELAY_MS = 10_000;

/**
 * Saves a Blob through a temporary object URL and a download link. The URL is a same-document
 * `blob:` URL, so it needs no CSP allowance, and it is revoked shortly after the click.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), DEFAULT_REVOKE_DELAY_MS);
}
