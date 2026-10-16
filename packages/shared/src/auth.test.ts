import { describe, expect, it } from 'vitest';
import { RegisterRequestSchema } from './auth.js';

const valid = {
  email: '  Jane.Doe@Example.com ',
  password: 'correct horse battery staple 42',
  displayName: ' Jane Doe ',
};

function issues(input: unknown) {
  const result = RegisterRequestSchema.safeParse(input);
  return result.success ? [] : result.error.issues;
}

describe('RegisterRequestSchema', () => {
  it('normalises email and name and applies defaults', () => {
    const parsed = RegisterRequestSchema.parse(valid);
    expect(parsed).toMatchObject({
      email: 'jane.doe@example.com',
      displayName: 'Jane Doe',
      currency: 'USD',
      locale: 'en-US',
      timezone: 'UTC',
    });
  });

  it('rejects unknown fields (mass assignment)', () => {
    const found = issues({ ...valid, role: 'admin' });
    expect(found.some((i) => i.code === 'unrecognized_keys')).toBe(true);
  });

  it('flags a weak password with WEAK_PASSWORD', () => {
    const found = issues({ ...valid, password: 'password1234' });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ path: ['password'], params: { code: 'WEAK_PASSWORD' } });
  });

  it('treats a password equal to the email as weak', () => {
    const found = issues({
      ...valid,
      email: 'zebrafish.quokka@example.com',
      password: 'zebrafish.quokka@example.com',
    });
    expect(found.some((i) => i.path[0] === 'password')).toBe(true);
  });

  it('rejects short and overlong passwords', () => {
    expect(issues({ ...valid, password: 'short' }).map((i) => i.code)).toContain('too_small');
    expect(issues({ ...valid, password: 'a'.repeat(129) }).map((i) => i.code)).toContain('too_big');
  });

  it('rejects bad email, empty name, unsupported currency and unknown timezone', () => {
    const paths = issues({
      ...valid,
      email: 'not-an-email',
      displayName: '   ',
      currency: 'XXX',
      timezone: 'Mars/Base',
    }).map((i) => i.path[0]);
    expect(paths).toEqual(expect.arrayContaining(['email', 'displayName', 'currency', 'timezone']));
  });

  it('rejects emails longer than 254 characters', () => {
    const long = `${'a'.repeat(250)}@example.com`;
    expect(issues({ ...valid, email: long }).some((i) => i.path[0] === 'email')).toBe(true);
  });
});

describe('RegisterRequestSchema displayName characters', () => {
  it.each([
    ['NUL', 'Jane\u0000Doe'],
    ['a C0 control character', 'Jane\u0007Doe'],
    ['a newline', 'Jane\nDoe'],
    ['a DEL/C1 control character', 'Jane\u0085Doe'],
    ['a bidi override', 'Jane‮Doe'],
    ['a zero-width space', 'Jane​Doe'],
  ])('rejects %s', (_name, displayName) => {
    expect(issues({ ...valid, displayName }).some((i) => i.path[0] === 'displayName')).toBe(true);
  });

  it('still accepts ordinary international names', () => {
    const parsed = RegisterRequestSchema.parse({
      ...valid,
      displayName: 'José Núñez-O’Brien 李雷',
    });
    expect(parsed.displayName).toBe('José Núñez-O’Brien 李雷');
  });
});
