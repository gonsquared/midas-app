import type {
  AdminUser,
  AuditLogEntry,
  Budget,
  Category,
  RecurringTemplate,
  Transaction,
  Wallet,
} from '@midas/shared';

let counter = 0;

/** Deterministic, valid v4-shaped UUIDs for fixtures. */
export function uuid(n?: number): string {
  const value = n ?? ++counter;
  return `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
}

const STAMP = '2026-10-01T00:00:00.000Z';

export function makeWallet(overrides: Partial<Wallet> = {}): Wallet {
  return {
    id: uuid(),
    name: 'Checking',
    type: 'bank',
    currency: 'USD',
    openingBalanceMinor: 100000,
    balanceMinor: 118000,
    archived: false,
    archivedAt: null,
    hasTransactions: true,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...overrides,
  };
}

export function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: uuid(),
    name: 'Groceries',
    type: 'expense',
    icon: 'shopping-cart',
    color: 'green',
    system: true,
    retired: false,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...overrides,
  };
}

export function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  const wallet = overrides.wallet ?? makeWallet();
  return {
    id: uuid(),
    type: 'expense',
    wallet: {
      id: wallet.id,
      name: wallet.name,
      currency: wallet.currency,
      archived: wallet.archived,
    },
    category: null,
    amountMinor: 5420,
    currency: wallet.currency,
    occurredOn: '2026-10-16',
    note: null,
    transfer: null,
    recurringTemplateId: null,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...overrides,
  };
}

export function resetFixtureIds(): void {
  counter = 0;
}

export interface BudgetOptions extends Partial<Budget> {
  /** Category name for a category budget. */
  name?: string;
  overall?: boolean;
  spentMinor?: number;
  /** A budget that starts after the viewed period: no status. */
  notStarted?: boolean;
}

/** A monthly budget for October 2026 with a computed status (threshold 80%). */
export function makeBudget(options: BudgetOptions = {}): Budget {
  const { name, overall, spentMinor = 0, notStarted, ...overrides } = options;
  const amountMinor = overrides.amountMinor ?? 40000;
  const threshold = overrides.warningThresholdPct ?? 80;
  const state =
    spentMinor >= amountMinor
      ? 'exceeded'
      : spentMinor * 100 >= amountMinor * threshold
        ? 'warning'
        : 'ok';
  const category = makeCategory({ name: name ?? 'Groceries' });
  return {
    id: uuid(),
    scope: overall ? 'overall' : 'category',
    category: overall
      ? null
      : {
          id: category.id,
          name: category.name,
          type: category.type,
          icon: category.icon,
          color: category.color,
          system: category.system,
          retired: category.retired,
        },
    period: 'monthly',
    amountMinor,
    currency: 'USD',
    warningThresholdPct: threshold,
    startDate: notStarted ? '2026-12-01' : '2026-10-01',
    status: notStarted
      ? null
      : {
          periodStart: '2026-10-01',
          periodEnd: '2026-10-31',
          spentMinor,
          remainingMinor: amountMinor - spentMinor,
          percentUsed: Math.round((spentMinor / amountMinor) * 1000) / 10,
          state,
        },
    createdAt: STAMP,
    updatedAt: STAMP,
    ...overrides,
  };
}

export function makeTemplate(overrides: Partial<RecurringTemplate> = {}): RecurringTemplate {
  const wallet = makeWallet();
  const category = makeCategory({ name: 'Rent', icon: 'house', color: 'blue' });
  return {
    id: uuid(),
    name: 'Rent',
    type: 'expense',
    wallet: { id: wallet.id, name: wallet.name, currency: wallet.currency, archived: false },
    category: {
      id: category.id,
      name: category.name,
      type: category.type,
      icon: category.icon,
      color: category.color,
      system: category.system,
      retired: false,
    },
    amountMinor: 120000,
    currency: 'USD',
    note: null,
    frequency: 'monthly',
    interval: 1,
    startDate: '2026-01-01',
    endDate: null,
    nextRunOn: '2026-11-01',
    status: 'active',
    lastRunAt: null,
    lastError: null,
    consecutiveFailures: 0,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...overrides,
  };
}

export function makeAdminUser(overrides: Partial<AdminUser> = {}): AdminUser {
  const n = ++counter;
  return {
    id: uuid(1000 + n),
    email: `user${n}@example.com`,
    displayName: `User ${n}`,
    role: 'user',
    status: 'active',
    createdAt: STAMP,
    lastLoginAt: '2026-10-16T08:30:00.000Z',
    suspendedAt: null,
    ...overrides,
  };
}

export function makeAuditEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: uuid(),
    occurredAt: '2026-10-16T08:30:12.000Z',
    actor: { id: uuid(9001), email: 'kim@example.com' },
    action: 'admin.user_suspended',
    target: { type: 'user', id: uuid(9002) },
    ip: '203.0.113.9',
    userAgent: 'Mozilla/5.0',
    requestId: 'req-1',
    metadata: { sessionsRevoked: 2, hasReason: true },
    ...overrides,
  };
}
