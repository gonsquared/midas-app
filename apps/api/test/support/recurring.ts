import type { RecurringTemplate } from '@midas/shared';
import { vi } from 'vitest';
import { RecurringGenerator, type GeneratorDeps } from '../../src/modules/recurring/generator.js';
import { registerUser, type IntegrationContext, type TestUser } from './api.js';
import { createWallet, systemCategory } from './ledger.js';

/** Shared helpers for the recurring-template tests. */
export function recurringHelpers(getContext: () => IntegrationContext) {
  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    user: TestUser,
    payload?: unknown,
  ) =>
    getContext().app.inject({
      method,
      url,
      headers: user.headers,
      ...(payload !== undefined && { payload: payload as object }),
    });
  const code = (res: { json: () => unknown }) => (res.json() as { code: string }).code;

  async function setup(userOverrides: Record<string, unknown> = {}) {
    const user = await registerUser(getContext().app, { currency: 'USD', ...userOverrides });
    const wallet = await createWallet(getContext().app, user, { name: 'Main', currency: 'USD' });
    const rent = await systemCategory(getContext().app, user, 'expense', 'Housing');
    const create = async (overrides: Record<string, unknown> = {}) => {
      const res = await call('POST', '/api/v1/recurring-templates', user, {
        name: 'Rent',
        type: 'expense',
        walletId: wallet.id,
        categoryId: rent.id,
        amountMinor: 120000,
        frequency: 'monthly',
        startDate: '2026-11-15',
        ...overrides,
      });
      if (res.statusCode !== 201) throw new Error(`create failed: ${res.body}`);
      return res.json<RecurringTemplate>();
    };
    return { user, wallet, rent, create };
  }

  return { call, code, setup };
}

/** Generator test kit: a logger spy, a generator factory on the app database, and row readers. */
export function generatorKit(getContext: () => IntegrationContext) {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const reset = () => {
    logger.info.mockClear();
    logger.warn.mockClear();
    logger.error.mockClear();
  };
  const generator = (overrides: Partial<GeneratorDeps> = {}) =>
    new RecurringGenerator({
      db: getContext().client.db,
      clock: getContext().clock,
      maxCatchup: 31,
      maxFailures: 5,
      logger,
      ...overrides,
    });
  const generated = async (templateId: string) =>
    (
      await getContext().owner.query(
        `select occurred_on::text as d, amount_minor::int as amount, note, wallet_id
           from transactions where recurring_template_id = $1 order by occurred_on`,
        [templateId],
      )
    ).rows as Array<{ d: string; amount: number; note: string | null; wallet_id: string }>;
  const templateRow = async (id: string) =>
    (
      await getContext().owner.query(
        `select *, next_run_on::text as next_run_text from recurring_templates where id = $1`,
        [id],
      )
    ).rows[0];
  const runs = async (templateId: string) =>
    (
      await getContext().owner.query(
        `select occurrence_date::text as d, status, error_code, attempts::int as attempts, transaction_id
           from recurring_runs where template_id = $1 order by occurrence_date`,
        [templateId],
      )
    ).rows as Array<{
      d: string;
      status: string;
      error_code: string | null;
      attempts: number;
      transaction_id: string | null;
    }>;
  return { logger, reset, generator, generated, templateRow, runs };
}
