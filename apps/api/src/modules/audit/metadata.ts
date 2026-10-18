/**
 * Audit metadata hygiene (ADR-018, database design 7.11). The log never holds passwords, tokens,
 * hashes, amounts, notes or transaction details. Callers pass small, hand-built objects; this
 * function is the safety net that drops anything that looks like a secret or financial value and
 * keeps the payload far below the 4 KB database cap.
 */
const FORBIDDEN_KEY =
  /pass(word|phrase)?|token|secret|authorization|cookie|amount|note|balance|payload/i;
const MAX_DEPTH = 3;
const MAX_STRING = 200;
const MAX_BYTES = 3_500;

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function clean(value: unknown, depth: number): Json | undefined {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') return value.slice(0, MAX_STRING);
  if (depth >= MAX_DEPTH) return undefined;
  if (Array.isArray(value)) {
    return value
      .slice(0, 20)
      .map((item) => clean(item, depth + 1))
      .filter((item): item is Json => item !== undefined);
  }
  if (typeof value === 'object') {
    const out: { [key: string]: Json } = {};
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_KEY.test(key)) continue;
      const cleaned = clean(item, depth + 1);
      if (cleaned !== undefined) out[key] = cleaned;
    }
    return out;
  }
  return undefined;
}

export function sanitizeAuditMetadata(metadata: Record<string, unknown> | undefined): {
  [key: string]: Json;
} {
  const cleaned = clean(metadata ?? {}, 0) as { [key: string]: Json };
  if (Buffer.byteLength(JSON.stringify(cleaned), 'utf8') > MAX_BYTES) return { truncated: true };
  return cleaned;
}
