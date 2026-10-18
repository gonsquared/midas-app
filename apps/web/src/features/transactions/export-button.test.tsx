import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { AppProviders } from '@/app/providers';
import { createQueryClient } from '@/lib/query-client';
import { mockApi, problem } from '@/test/mock-api';
import { ExportButton } from './export-button';
import type { TransactionFilters } from './filters';

const filters: TransactionFilters = {
  from: '2026-10-01',
  to: '2026-10-31',
  wallet: ['00000000-0000-4000-8000-000000000001'],
  category: [],
  type: ['expense'],
  q: 'shop',
  sort: 'date_desc',
};

function csvResponse(): Response {
  return new Response('﻿date,type\n2026-10-16,expense\n', {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="midas-transactions-20261016.csv"',
    },
  });
}

function renderButton() {
  return render(
    <AppProviders queryClient={createQueryClient()}>
      <ExportButton filters={filters} />
    </AppProviders>,
  );
}

let created: Blob[];
beforeEach(() => {
  created = [];
  URL.createObjectURL = vi.fn((blob: Blob) => {
    created.push(blob);
    return 'blob:test';
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('ExportButton', () => {
  it('downloads the filtered result without pagination and names the file from the server', async () => {
    const api = mockApi({ 'GET /transactions/export': csvResponse() });
    const user = userEvent.setup();
    const { container } = renderButton();
    expect(await axe(container)).toHaveNoViolations();
    await user.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(created).toHaveLength(1));
    const call = api.callsTo('GET /transactions/export')[0]!;
    expect(call.params.get('from')).toBe('2026-10-01');
    expect(call.params.get('to')).toBe('2026-10-31');
    expect(call.params.getAll('walletId')).toEqual(['00000000-0000-4000-8000-000000000001']);
    expect(call.params.getAll('type')).toEqual(['expense']);
    expect(call.params.get('q')).toBe('shop');
    expect(call.params.has('limit')).toBe(false);
    expect(call.params.has('cursor')).toBe(false);
    expect(await created[0]!.text()).toContain('2026-10-16,expense');
    expect((await screen.findAllByText('Export ready.')).length).toBeGreaterThan(0);
  });

  it('shows progress and ignores a second click while preparing', async () => {
    let release: (r: Response) => void = () => undefined;
    const api = mockApi({
      'GET /transactions/export': () => new Promise<Response>((r) => (release = r)),
    });
    const user = userEvent.setup();
    renderButton();
    await user.click(screen.getByRole('button', { name: 'Export CSV' }));
    const busy = await screen.findByRole('button', { name: 'Preparing export' });
    expect(busy).toHaveAttribute('aria-busy', 'true');
    await user.click(busy);
    expect(api.callsTo('GET /transactions/export')).toHaveLength(1);
    release(csvResponse());
    await waitFor(() => expect(created).toHaveLength(1));
  });

  it('explains a rate limit and offers a retry', async () => {
    mockApi({
      'GET /transactions/export': problem(429, 'RATE_LIMITED', {
        headers: { 'Retry-After': '30' },
      }),
    });
    const user = userEvent.setup();
    renderButton();
    await user.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(await screen.findByText(/Try again in 30 seconds/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
    expect(created).toHaveLength(0);
  });
});
