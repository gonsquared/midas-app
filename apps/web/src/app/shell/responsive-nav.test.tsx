import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { renderApp, setViewport, signedInAs, VIEWPORT } from '@/test/helpers';

describe('tablet icon rail', () => {
  it('keeps accessible names, and expands and collapses with the keyboard', async () => {
    setViewport(VIEWPORT.tablet);
    signedInAs('user');
    const user = userEvent.setup();
    await renderApp('/dashboard');
    await screen.findByRole('heading', { name: 'Dashboard' });

    const primary = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(primary).getByRole('link', { name: 'Transactions' })).toBeInTheDocument();
    expect(screen.queryByText('Money')).not.toBeInTheDocument();

    const expand = screen.getByRole('button', { name: 'Expand navigation' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    await user.click(expand);
    expect(screen.getByRole('button', { name: 'Collapse navigation' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText('Money')).toBeVisible();

    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Expand navigation' })).toHaveFocus();
    expect(screen.queryByText('Money')).not.toBeInTheDocument();
  });

  it('shows the tooltip label when an icon link receives keyboard focus', async () => {
    setViewport(VIEWPORT.tablet);
    signedInAs('user');
    const user = userEvent.setup();
    await renderApp('/dashboard');
    await screen.findByRole('heading', { name: 'Dashboard' });
    await user.tab();
    await user.tab();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveFocus();
    expect(await screen.findByRole('tooltip', { name: 'Dashboard' })).toBeInTheDocument();
  });
});

describe('tablet rail dismissal', () => {
  it('collapses on an outside pointer press and ignores an already-handled Escape', async () => {
    setViewport(VIEWPORT.tablet);
    signedInAs('user');
    const user = userEvent.setup();
    await renderApp('/dashboard');
    await screen.findByRole('heading', { name: 'Dashboard' });
    await user.click(screen.getByRole('button', { name: 'Expand navigation' }));
    expect(screen.getByText('Money')).toBeVisible();

    const handled = new KeyboardEvent('keydown', {
      key: 'Escape',
      cancelable: true,
      bubbles: true,
    });
    handled.preventDefault();
    document.body.dispatchEvent(handled);
    expect(screen.getByText('Money')).toBeVisible();

    await user.click(screen.getByRole('heading', { name: 'Dashboard' }));
    await waitFor(() => expect(screen.queryByText('Money')).not.toBeInTheDocument());
  });
});

describe('mobile bottom bar', () => {
  it('does not inject <style> elements when the More sheet opens (strict style-src)', async () => {
    setViewport(VIEWPORT.mobile);
    signedInAs('user');
    const user = userEvent.setup();
    await renderApp('/dashboard');
    await screen.findByRole('heading', { name: 'Dashboard' });
    const before = document.querySelectorAll('style').length;
    const observer = new MutationObserver(() => undefined);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    await user.click(screen.getByRole('button', { name: 'More' }));
    await screen.findByRole('dialog', { name: 'More' });
    const addedStyles = observer
      .takeRecords()
      .flatMap((record) => [...record.addedNodes])
      .filter((node) => node.nodeName === 'STYLE');
    observer.disconnect();
    expect(addedStyles).toHaveLength(0);
    expect(document.querySelectorAll('style').length).toBe(before);
  });

  it('renders Home, Activity, Add, Budgets and More with visible labels', async () => {
    setViewport(VIEWPORT.mobile);
    signedInAs('user');
    await renderApp('/dashboard');
    await screen.findByRole('heading', { name: 'Dashboard' });

    const bar = screen.getByRole('navigation', { name: 'Primary' });
    for (const name of ['Home', 'Activity', 'Budgets']) {
      expect(within(bar).getByRole('link', { name })).toBeVisible();
    }
    expect(within(bar).getByRole('button', { name: 'Add' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'More' })).toBeInTheDocument();
    expect(within(bar).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  });

  it('opens the More sheet with the remaining destinations, theme and sign out', async () => {
    setViewport(VIEWPORT.mobile);
    signedInAs('admin');
    const user = userEvent.setup();
    await renderApp('/dashboard');
    await screen.findByRole('heading', { name: 'Dashboard' });

    await user.click(screen.getByRole('button', { name: 'More' }));
    const sheet = await screen.findByRole('dialog', { name: 'More' });
    for (const name of ['Wallets', 'Recurring', 'Reports', 'Categories', 'Settings']) {
      expect(within(sheet).getByRole('link', { name })).toBeInTheDocument();
    }
    expect(within(sheet).getByRole('navigation', { name: 'Administration' })).toBeInTheDocument();
    const dark = within(sheet).getByRole('button', { name: 'Dark' });
    expect(dark).toHaveAttribute('aria-pressed', 'false');
    await user.click(dark);
    expect(dark).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(within(sheet).getByRole('button', { name: 'Sign out' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'More' })).toHaveFocus();
  });

  it('has no detectable accessibility violations', async () => {
    setViewport(VIEWPORT.mobile);
    signedInAs('user');
    const { container } = await renderApp('/dashboard');
    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(await axe(container)).toHaveNoViolations();
  });
});
