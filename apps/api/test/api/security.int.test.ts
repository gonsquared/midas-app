import { ProblemSchema } from '@midas/shared';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createIntegrationContext,
  refreshHeaders,
  registerUser,
  type IntegrationContext,
} from '../support/api.js';
import { describeDb, truncateAll } from '../support/db.js';
import {
  createCategory,
  createTransaction,
  createTransfer,
  createWallet,
  expectLedgerConsistent,
  getWallet,
  systemCategory,
} from '../support/ledger.js';

/** Anything that would help an attacker: stack frames, file paths, SQL, driver or host details. */
const LEAK =
  /stack|node_modules|\.[cm]?[jt]s:\d|at \w+ \(|\bSELECT\b|\bINSERT\b|\bUPDATE\b|syntax error|pg_|postgres|ECONN|SQLSTATE|kysely|fastify|FST_ERR/i;
const PROBLEM_KEYS = ['code', 'detail', 'instance', 'requestId', 'status', 'title', 'type'];
const DEAD_ID = '0197f8a0-0000-7000-8000-00000000dead';

function expectGenericProblem(res: LightMyRequestResponse): void {
  expect(res.headers['content-type']).toContain('application/problem+json');
  const body = res.json<Record<string, unknown>>();
  const keys = Object.keys(body).filter((k) => k !== 'errors' && k !== 'retryAfterSeconds');
  expect(keys.sort()).toEqual(PROBLEM_KEYS);
  expect(res.body).not.toMatch(LEAK);
  expect(res.headers['x-powered-by']).toBeUndefined();
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

describeDb('security: ledger API attack scenarios (real PostgreSQL)', () => {
  let ctx: IntegrationContext;

  beforeAll(async () => {
    ctx = await createIntegrationContext();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await truncateAll(ctx.owner);
  });

  const call = (method: Method, url: string, headers: Record<string, string>, payload?: unknown) =>
    ctx.app.inject({
      method,
      url,
      headers,
      ...(payload !== undefined && { payload: payload as object }),
    });

  async function aliceWorld() {
    const alice = await registerUser(ctx.app);
    const mallory = await registerUser(ctx.app);
    const wallet = await createWallet(ctx.app, alice, { openingBalanceMinor: 5000 });
    const wallet2 = await createWallet(ctx.app, alice, { openingBalanceMinor: 0 });
    const expense = await systemCategory(ctx.app, alice, 'expense');
    const custom = await createCategory(ctx.app, alice, { name: 'Alice only' });
    const tx = await createTransaction(ctx.app, alice, {
      type: 'expense',
      walletId: wallet.id,
      categoryId: custom.id,
      amountMinor: 700,
      note: 'secret note',
    });
    const transfer = await createTransfer(ctx.app, alice, {
      fromWalletId: wallet.id,
      toWalletId: wallet2.id,
      amountMinor: 300,
    });
    return { alice, mallory, wallet, wallet2, expense, custom, tx, transfer };
  }

  describe('broken access control (IDOR)', () => {
    it('should answer a foreign id exactly like a missing id, so ids cannot be probed', async () => {
      const { mallory, wallet, custom, tx, transfer } = await aliceWorld();
      const targets: Array<[Method, string, string, unknown?]> = [
        ['GET', `/api/v1/wallets/${wallet.id}`, `/api/v1/wallets/${DEAD_ID}`],
        ['PATCH', `/api/v1/wallets/${wallet.id}`, `/api/v1/wallets/${DEAD_ID}`, { name: 'x' }],
        ['DELETE', `/api/v1/categories/${custom.id}`, `/api/v1/categories/${DEAD_ID}`],
        [
          'PATCH',
          `/api/v1/categories/${custom.id}`,
          `/api/v1/categories/${DEAD_ID}`,
          { name: 'x' },
        ],
        ['GET', `/api/v1/transactions/${tx.id}`, `/api/v1/transactions/${DEAD_ID}`],
        [
          'PATCH',
          `/api/v1/transactions/${tx.id}`,
          `/api/v1/transactions/${DEAD_ID}`,
          { note: 'x' },
        ],
        ['DELETE', `/api/v1/transactions/${tx.id}`, `/api/v1/transactions/${DEAD_ID}`],
        ['GET', `/api/v1/transfers/${transfer.id}`, `/api/v1/transfers/${DEAD_ID}`],
        ['DELETE', `/api/v1/transfers/${transfer.id}`, `/api/v1/transfers/${DEAD_ID}`],
      ];
      const shape = (res: LightMyRequestResponse) => {
        const { requestId: _r, instance: _i, ...rest } = res.json<Record<string, unknown>>();
        return { status: res.statusCode, ...rest };
      };
      for (const [method, foreign, missing, payload] of targets) {
        const a = await call(method, foreign, mallory.headers, payload);
        const b = await call(method, missing, mallory.headers, payload);
        expect(a.statusCode, `${method} ${foreign}`).toBe(404);
        expect(shape(a)).toEqual(shape(b));
        expect(a.body).not.toContain('secret note');
      }
    });

    it('should not let a user attach another users wallet or category to their own transaction', async () => {
      const { alice, mallory, wallet, expense, custom, tx } = await aliceWorld();
      const mine = await createWallet(ctx.app, mallory);
      const myTx = await createTransaction(ctx.app, mallory, {
        type: 'expense',
        walletId: mine.id,
        categoryId: expense.id,
      });
      const before = await getWallet(ctx.app, alice, wallet.id);
      const create = (walletId: string, categoryId: string) =>
        call('POST', '/api/v1/transactions', mallory.headers, {
          type: 'expense',
          walletId,
          categoryId,
          amountMinor: 1,
          occurredOn: '2026-10-01',
        });
      const attempts = [
        call('PATCH', `/api/v1/transactions/${myTx.id}`, mallory.headers, { walletId: wallet.id }),
        call('PATCH', `/api/v1/transactions/${myTx.id}`, mallory.headers, {
          categoryId: custom.id,
        }),
        create(wallet.id, expense.id),
        create(mine.id, custom.id),
      ];
      for (const res of await Promise.all(attempts)) {
        expect(res.statusCode).toBe(422);
        expect(ProblemSchema.parse(res.json()).code).toBe('INVALID_REFERENCE');
      }
      expect(await getWallet(ctx.app, alice, wallet.id)).toEqual(before);
      expect((await call('GET', `/api/v1/transactions/${tx.id}`, alice.headers)).statusCode).toBe(
        200,
      );
      await expectLedgerConsistent(ctx.owner);
    });

    it('should return no rows when foreign wallet, category or transfer ids are used as list filters', async () => {
      const { mallory, wallet, custom } = await aliceWorld();
      for (const query of [
        `walletId=${wallet.id}`,
        `categoryId=${custom.id}`,
        'type=transfer',
        'q=secret',
      ]) {
        const res = await call('GET', `/api/v1/transactions?${query}`, mallory.headers);
        expect(res.statusCode).toBe(200);
        expect(res.json().items).toEqual([]);
        expect(res.body).not.toContain('secret note');
      }
    });

    it('should never expose another users wallets or categories in lists', async () => {
      const { mallory } = await aliceWorld();
      const wallets = await call('GET', '/api/v1/wallets?includeArchived=true', mallory.headers);
      expect(wallets.json().items).toEqual([]);
      const categories = await call('GET', '/api/v1/categories', mallory.headers);
      expect(categories.body).not.toContain('Alice only');
    });
  });

  describe('token tampering on ledger endpoints', () => {
    it('should reject an access token whose payload was edited to impersonate another user', async () => {
      const { alice, mallory, wallet } = await aliceWorld();
      const [header, payload, signature] = mallory.accessToken.split('.');
      const claims = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString()) as Record<
        string,
        unknown
      >;
      claims.sub = alice.id;
      const forged = `${header}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${signature}`;
      const res = await call('GET', `/api/v1/wallets/${wallet.id}`, {
        authorization: `Bearer ${forged}`,
      });
      expect(res.statusCode).toBe(401);
      expect(ProblemSchema.parse(res.json()).code).toBe('UNAUTHENTICATED');
      expect(res.body).not.toContain(wallet.name);
    });

    it('should reject a refresh token presented as a bearer credential', async () => {
      const { alice } = await aliceWorld();
      const res = await call('GET', '/api/v1/wallets', {
        authorization: `Bearer ${alice.refreshToken}`,
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('injection and mass assignment', () => {
    it.each([
      ['wallets', '/api/v1/wallets', '{"name":"w","type":"cash"'],
      [
        'categories',
        '/api/v1/categories',
        '{"name":"c","type":"expense","icon":"tag","color":"blue"',
      ],
      ['transactions', '/api/v1/transactions', '{"type":"expense"'],
      ['transfers', '/api/v1/transfers', '{"amountMinor":1'],
    ])(
      'should reject prototype pollution in a %s body and leave Object.prototype clean',
      async (_name, url, head) => {
        const { alice } = await aliceWorld();
        for (const polluted of [
          `${head},"__proto__":{"isAdmin":true}}`,
          `${head},"constructor":{"prototype":{"isAdmin":true}}}`,
        ]) {
          const res = await ctx.app.inject({
            method: 'POST',
            url,
            headers: { ...alice.headers, 'content-type': 'application/json' },
            payload: polluted,
          });
          expect(res.statusCode).toBe(400);
          expectGenericProblem(res);
        }
        expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'isAdmin')).toBe(false);
        expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
      },
    );

    it('should reject prototype pollution in a profile PATCH', async () => {
      const { alice } = await aliceWorld();
      const res = await ctx.app.inject({
        method: 'PATCH',
        url: '/api/v1/me',
        headers: { ...alice.headers, 'content-type': 'application/json' },
        payload: '{"preferences":{"__proto__":{"role":"admin"}}}',
      });
      expect(res.statusCode).toBe(400);
      const me = await call('GET', '/api/v1/me', alice.headers);
      expect(me.json().role).toBe('user');
    });

    it('should store SQL metacharacters in names, notes and search text as inert data', async () => {
      const { alice, wallet } = await aliceWorld();
      const payloads = [
        "x'; DROP TABLE transactions;--",
        "' UNION SELECT password_hash FROM users--",
        "%' OR '1'='1",
      ];
      const expense = await systemCategory(ctx.app, alice, 'expense');
      for (const [i, text] of payloads.entries()) {
        const cat = await call('POST', '/api/v1/categories', alice.headers, {
          name: text.slice(0, 40),
          type: 'expense',
          icon: 'tag',
          color: 'blue',
        });
        expect(cat.statusCode, text).toBe(201);
        const created = await call('POST', '/api/v1/transactions', alice.headers, {
          type: 'expense',
          walletId: wallet.id,
          categoryId: expense.id,
          amountMinor: 10 + i,
          occurredOn: '2026-10-02',
          note: text,
        });
        expect(created.statusCode, text).toBe(201);
        expect(created.json().note).toBe(text);
        const found = await call(
          'GET',
          `/api/v1/transactions?q=${encodeURIComponent(text)}`,
          alice.headers,
        );
        expect(found.statusCode).toBe(200);
        expect(found.json().items.map((x: { note: string }) => x.note)).toEqual([text]);
        expect(found.body).not.toMatch(/argon2|\$2[aby]\$/);
      }
      const all = await call('GET', '/api/v1/transactions?limit=100', alice.headers);
      expect(all.json().items.length).toBeGreaterThanOrEqual(4);
    });

    it('should reject SQL text where an id, enum or date is expected with 400 not 500', async () => {
      const { alice } = await aliceWorld();
      const sqli = encodeURIComponent("1' OR '1'='1");
      for (const url of [
        `/api/v1/wallets/${sqli}`,
        `/api/v1/transactions/${sqli}`,
        `/api/v1/transactions?walletId=${sqli}`,
        `/api/v1/transactions?type=${sqli}`,
        `/api/v1/transactions?from=${sqli}`,
        `/api/v1/transactions?sort=${sqli}`,
        `/api/v1/transactions?cursor=${sqli}`,
        `/api/v1/categories?type=${sqli}`,
      ]) {
        const res = await call('GET', url, alice.headers);
        expect(res.statusCode, url).toBe(400);
        expectGenericProblem(res);
      }
    });

    it('should ignore client-supplied ownership and audit fields (mass assignment)', async () => {
      const { alice, mallory } = await aliceWorld();
      const res = await call('POST', '/api/v1/wallets', mallory.headers, {
        name: 'Hijack',
        type: 'cash',
        userId: alice.id,
        id: DEAD_ID,
        createdAt: '2000-01-01T00:00:00Z',
      });
      expect(res.statusCode).toBe(400);
      const rows = await ctx.owner.query('select count(*)::int as n from wallets where name = $1', [
        'Hijack',
      ]);
      expect(rows.rows[0].n).toBe(0);
    });
  });

  describe('error shape and information leakage', () => {
    it('should return generic problem bodies for every class of bad request', async () => {
      const { alice } = await aliceWorld();
      const raw = (url: string, contentType: string, payload: string) =>
        ctx.app.inject({
          method: 'POST',
          url,
          headers: { ...alice.headers, 'content-type': contentType },
          payload,
        });
      const responses = await Promise.all([
        call('GET', '/api/v1/does-not-exist', alice.headers),
        call('GET', '/api/v1/wallets/not-a-uuid', alice.headers),
        call('POST', '/api/v1/wallets', alice.headers, { name: 1 }),
        call('DELETE', `/api/v1/wallets/${DEAD_ID}`, alice.headers),
        raw('/api/v1/wallets', 'application/json', '{not json'),
        raw('/api/v1/wallets', 'text/plain', 'name=x'),
        raw(
          '/api/v1/transactions',
          'application/json',
          JSON.stringify({ note: 'x'.repeat(70 * 1024) }),
        ),
        ctx.app.inject({ method: 'PUT', url: '/api/v1/wallets', headers: alice.headers }),
      ]);
      for (const res of responses) {
        expect([400, 404, 405, 413, 415]).toContain(res.statusCode);
        expectGenericProblem(res);
        expect(res.headers['cache-control']).toBe('no-store');
      }
    });

    it('should return a generic body without driver or host details when the database fails', async () => {
      const probe = await createIntegrationContext();
      try {
        const user = await registerUser(probe.app);
        // Destroy the app pool (not the owner pool): the next query must fail inside the handler.
        await probe.client.db.destroy();
        const res = await probe.app.inject({
          method: 'GET',
          url: '/api/v1/wallets',
          headers: user.headers,
        });
        expect(res.statusCode).toBeGreaterThanOrEqual(500);
        expectGenericProblem(res);
        expect(res.body).not.toMatch(/127\.0\.0\.1|localhost|midas_app|pool/i);
      } finally {
        await probe.app.close();
        await probe.owner.end();
      }
    });

    it('should not echo a rejected current password back in the response', async () => {
      const { alice } = await aliceWorld();
      const secret = 'MySecretPassphrase-should-not-echo-1';
      const res = await call('POST', '/api/v1/me/password', alice.headers, {
        currentPassword: secret,
        newPassword: 'short',
      });
      expect(res.statusCode).toBe(400);
      expect(res.body).not.toContain(secret);
      expectGenericProblem(res);
    });
  });

  describe('rate limiting', () => {
    const limited = (env: Record<string, string>) =>
      createIntegrationContext({ RATE_LIMIT_ENABLED: 'true', ...env });

    it('should throttle password reset token guessing on verify and reset from one IP', async () => {
      const lim = await limited({ RATE_LIMIT_RESET_MAX: '3' });
      try {
        const codes: number[] = [];
        for (let i = 0; i < 5; i++) {
          const res =
            i % 2 === 0
              ? await lim.app.inject({
                  method: 'POST',
                  url: '/api/v1/auth/password/reset/verify',
                  payload: { token: 'A'.repeat(43) },
                })
              : await lim.app.inject({
                  method: 'POST',
                  url: '/api/v1/auth/password/reset',
                  payload: {
                    token: 'B'.repeat(43),
                    newPassword: 'a completely different passphrase 77',
                  },
                });
          codes.push(res.statusCode);
          if (res.statusCode === 429) {
            expect(res.headers['retry-after']).toBeDefined();
            expect(ProblemSchema.parse(res.json()).code).toBe('RATE_LIMITED');
          }
        }
        expect(codes).toEqual([400, 400, 400, 429, 429]);
      } finally {
        await lim.close();
      }
    });

    it('should throttle refresh attempts from one client', async () => {
      const lim = await limited({ RATE_LIMIT_REFRESH_MAX: '3' });
      try {
        const codes: number[] = [];
        for (let i = 0; i < 5; i++) {
          const res = await lim.app.inject({
            method: 'POST',
            url: '/api/v1/auth/refresh',
            headers: refreshHeaders('A'.repeat(43)),
          });
          codes.push(res.statusCode);
        }
        expect(codes).toEqual([401, 401, 401, 429, 429]);
      } finally {
        await lim.close();
      }
    });

    it('should cap authenticated writes per user without affecting other users', async () => {
      const lim = await limited({ RATE_LIMIT_USER_WRITE_MAX: '3' });
      try {
        const noisy = await registerUser(lim.app);
        const quiet = await registerUser(lim.app);
        const codes: number[] = [];
        for (let i = 0; i < 5; i++) {
          const res = await lim.app.inject({
            method: 'POST',
            url: '/api/v1/wallets',
            headers: noisy.headers,
            payload: { name: `w${i}`, type: 'cash' },
          });
          codes.push(res.statusCode);
        }
        expect(codes).toEqual([201, 201, 201, 429, 429]);
        const other = await lim.app.inject({
          method: 'POST',
          url: '/api/v1/wallets',
          headers: quiet.headers,
          payload: { name: 'fine', type: 'cash' },
        });
        expect(other.statusCode).toBe(201);
      } finally {
        await lim.close();
      }
    });

    it('should cap authenticated reads per user', async () => {
      const lim = await limited({ RATE_LIMIT_USER_READ_MAX: '3' });
      try {
        const user = await registerUser(lim.app);
        const codes: number[] = [];
        for (let i = 0; i < 4; i++) {
          const res = await lim.app.inject({
            method: 'GET',
            url: '/api/v1/wallets',
            headers: user.headers,
          });
          codes.push(res.statusCode);
        }
        expect(codes).toEqual([200, 200, 200, 429]);
      } finally {
        await lim.close();
      }
    });
  });

  describe('percent-encoded API prefix', () => {
    it.each(['/%61pi/v1/wallets', '/%41pi/v1/wallets'])(
      'should keep the auth guard and no-store on %s (alias of /api/v1/wallets)',
      async (url) => {
        const user = await registerUser(ctx.app);
        const anonymous = await ctx.app.inject({ method: 'GET', url });
        // Either the guard rejects it or the route does not exist: never data, always uncached.
        expect([401, 404]).toContain(anonymous.statusCode);
        expect(anonymous.headers['cache-control']).toBe('no-store');
        const authed = await ctx.app.inject({ method: 'GET', url, headers: user.headers });
        expect([200, 404]).toContain(authed.statusCode);
        expect(authed.headers['cache-control']).toBe('no-store');
      },
    );

    it('should throttle the aliased path with the same per-IP budget as /api/', async () => {
      const lim = await createIntegrationContext({
        RATE_LIMIT_ENABLED: 'true',
        RATE_LIMIT_GLOBAL_IP_MAX: '2',
      });
      try {
        const codes: number[] = [];
        for (let i = 0; i < 3; i++) {
          const res = await lim.app.inject({ method: 'GET', url: '/%61pi/v1/wallets' });
          codes.push(res.statusCode);
        }
        expect(codes[2]).toBe(429);
        const mixed = await lim.app.inject({ method: 'GET', url: '/api/v1/wallets' });
        expect(mixed.statusCode).toBe(429);
      } finally {
        await lim.close();
      }
    });
  });
});
