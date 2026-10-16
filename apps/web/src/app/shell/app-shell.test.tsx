import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { describe, expect, it } from 'vitest';
import { renderApp, setViewport, signedInAs, VIEWPORT } from '@/test/helpers';

describe('app shell: desktop', () => {
  it('has landmarks, a skip link as the first tab stop, and marks the current page', async () => {
    setViewport(VIEWPORT.desktop);
    signedInAs('user');
    const user = userEvent.setup();
    await renderApp('/dashboard');

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getAllByRole('main')).toHaveLength(1);
    const primary = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(primary).getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(primary).getByRole('link', { name: 'Wallets' })).not.toHaveAttribute(
      'aria-current',
    );

    await user.tab();
    const skip = screen.getByRole('link', { name: 'Skip to main content' });
    expect(skip).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('hides Administration from non-admins and shows it to admins', async () => {
    setViewport(VIEWPORT.desktop);
    signedInAs('user');
    const first = await renderApp('/dashboard');
    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(screen.queryByRole('navigation', { name: 'Administration' })).not.toBeInTheDocument();
    first.unmount();

    signedInAs('admin');
    await renderApp('/dashboard');
    const admin = await screen.findByRole('navigation', { name: 'Administration' });
    expect(
      within(admin)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Overview', 'Users', 'Default categories', 'Audit log']);
  });

  it('moves focus to the new h1, updates the title and announces on navigation', async () => {
    setViewport(VIEWPORT.desktop);
    signedInAs('user');
    const user = userEvent.setup();
    await renderApp('/dashboard');
    await screen.findByRole('heading', { name: 'Dashboard' });

    await user.click(screen.getByRole('link', { name: 'Wallets' }));
    const heading = await screen.findByRole('heading', { level: 1, name: 'Wallets' });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(document.title).toBe('Wallets | Midas');
    expect(screen.getByRole('status')).toHaveTextContent('Wallets');
  });

  it('has no detectable accessibility violations', async () => {
    setViewport(VIEWPORT.desktop);
    signedInAs('admin');
    const { container } = await renderApp('/dashboard');
    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows the brass admin edge label inside /admin', async () => {
    setViewport(VIEWPORT.desktop);
    signedInAs('admin');
    await renderApp('/admin/users');
    await screen.findByRole('heading', { level: 1, name: 'Users' });
    expect(within(screen.getByRole('banner')).getByText('Administration')).toBeInTheDocument();
  });
});
