import { DisplayNameSchema, EmailSchema } from '@midas/shared';
import type { Kysely } from 'kysely';
import { createAdmin, promoteUser } from './modules/admin/bootstrap.js';
import { argon2Hasher } from './modules/auth/password-hasher.js';
import { assertStrongPassword } from './modules/auth/password-policy.js';
import { systemClock } from './platform/clock.js';
import type { Database } from './platform/db/database.js';

/** First line of a text stream without its line ending (for `--password-stdin`). */
export async function readFirstLine(stream: NodeJS.ReadableStream): Promise<string> {
  let data = '';
  for await (const chunk of stream) {
    data += String(chunk);
    if (data.includes('\n')) break;
  }
  return (data.split(/\r?\n/)[0] ?? '').trimEnd();
}

/** Reads a secret from a terminal without echoing it. */
export function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      reject(new Error('No terminal available. Use --password-stdin.'));
      return;
    }
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const finish = (error?: Error) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
      process.stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\u0003') return finish(new Error('Cancelled.'));
        if (char === '\r' || char === '\n') return finish();
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.on('data', onData);
  });
}

export function parseEmailArg(value: string | true | undefined): string {
  const parsed = EmailSchema.safeParse(typeof value === 'string' ? value : '');
  if (!parsed.success) throw new Error('Provide a valid address with --email <email>.');
  return parsed.data;
}

/**
 * `cli admin:create` (ADR-013): creates a new admin account with a password that passes the same
 * policy as registration. It refuses an email that already exists (use `admin:promote` for that,
 * an explicit audited operator action). The authoritative check is inside the transaction; the
 * early lookup only avoids prompting for a password that would be dropped. Never logs the password.
 */
export async function runAdminCreate(
  db: Kysely<Database>,
  input: { email: string; displayName: string | undefined; readPassword: () => Promise<string> },
): Promise<'created'> {
  const emailExists = new Error(
    'An account with that email already exists. Use admin:promote --email <email> to make it an admin.',
  );
  const existing = await db
    .selectFrom('users')
    .select('id')
    .where('email', '=', input.email)
    .executeTakeFirst();
  if (existing) throw emailExists;
  const displayNameResult = DisplayNameSchema.safeParse(
    input.displayName ?? input.email.split('@')[0] ?? 'Administrator',
  );
  const displayName = displayNameResult.success ? displayNameResult.data : 'Administrator';

  const password = await input.readPassword();
  try {
    assertStrongPassword(password, { email: input.email, displayName }, 'password');
  } catch {
    throw new Error('The password is too weak. Use a longer, less predictable passphrase.');
  }
  const passwordHash = await argon2Hasher.hash(password);
  const outcome = await createAdmin(
    { db, clock: systemClock },
    { email: input.email, displayName, passwordHash },
  );
  if (outcome === 'email_exists') throw emailExists;
  return outcome;
}

export async function runAdminPromote(db: Kysely<Database>, email: string): Promise<string> {
  return promoteUser({ db, clock: systemClock }, email);
}
