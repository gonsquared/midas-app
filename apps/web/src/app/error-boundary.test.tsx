import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './error-boundary';

function Boom(): never {
  throw new Error('secret stack detail /srv/app/db.ts');
}

describe('ErrorBoundary', () => {
  it('shows a generic message without leaking error details', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(document.body).not.toHaveTextContent('secret stack detail');
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
