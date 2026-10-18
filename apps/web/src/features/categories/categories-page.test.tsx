import type { Category } from '@midas/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeCategory, resetFixtureIds, uuid } from '@/test/fixtures';
import { mockApi, ok, problem } from '@/test/mock-api';
import { renderApp, setViewport, signedInAs, VIEWPORT } from '@/test/helpers';

let categories: Category[];
const PETS = uuid(901);
const GROCERIES = uuid(902);

function seed(): Category[] {
  return [
    makeCategory({
      id: GROCERIES,
      name: 'Groceries',
      system: true,
      icon: 'shopping-cart',
      color: 'green',
    }),
    makeCategory({ name: 'Housing', system: true, icon: 'house', color: 'blue' }),
    makeCategory({ id: PETS, name: 'Pets', system: false, icon: 'paw-print', color: 'teal' }),
    makeCategory({
      name: 'Salary',
      type: 'income',
      system: true,
      icon: 'briefcase',
      color: 'green',
    }),
    makeCategory({
      name: 'Side projects',
      type: 'income',
      system: false,
      icon: 'laptop',
      color: 'violet',
    }),
  ];
}

function categoryApi(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({ 'GET /categories': () => ok({ items: categories }), ...extra });
}

async function openCategories(viewport: number = VIEWPORT.desktop, path = '/categories') {
  setViewport(viewport);
  signedInAs('user');
  const user = userEvent.setup();
  const utils = await renderApp(path);
  return { user, ...utils };
}

beforeEach(() => {
  resetFixtureIds();
  categories = seed();
});

describe('category list', () => {
  it('separates expense and income, and yours from defaults, with counts', async () => {
    categoryApi();
    await openCategories();
    expect(await screen.findByRole('heading', { level: 2, name: 'Expense (3)' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Income (2)' })).toBeVisible();
    const expenseSection = screen.getByRole('region', { name: 'Expense (3)' });
    expect(within(expenseSection).getByRole('heading', { name: 'Yours (1)' })).toBeVisible();
    expect(within(expenseSection).getByRole('heading', { name: 'Defaults (2)' })).toBeVisible();
    expect(
      within(expenseSection).getByRole('link', { name: 'Pets, expense category' }),
    ).toBeVisible();
    const groceries = within(expenseSection).getByRole('link', {
      name: 'Groceries, expense category, default, read only',
    });
    expect(within(groceries).getByText('Default')).toBeVisible();
    expect(
      within(expenseSection).queryByRole('button', { name: 'Actions for Groceries' }),
    ).not.toBeInTheDocument();
    expect(within(expenseSection).getByRole('button', { name: 'Actions for Pets' })).toBeVisible();
  });

  it('uses tabs below 1024px and keeps the selected type in the URL', async () => {
    categoryApi();
    const { user, router } = await openCategories(VIEWPORT.tablet);
    const expenseTab = await screen.findByRole('tab', { name: 'Expense, 3' });
    expect(expenseTab).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'Income, 2' }));
    await waitFor(() => expect(router.state.location.search).toEqual({ type: 'income' }));
    expect(
      await screen.findByRole('link', { name: 'Side projects, income category' }),
    ).toBeVisible();
  });

  it('shows an inline error with a retry', async () => {
    mockApi({ 'GET /categories': problem(500, 'INTERNAL_ERROR') });
    await openCategories();
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your categories");
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  it('has no detectable accessibility violations', async () => {
    categoryApi();
    const { container } = await openCategories();
    await screen.findByRole('heading', { name: 'Expense (3)' });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no detectable accessibility violations at mobile width', async () => {
    categoryApi();
    const { container } = await openCategories(VIEWPORT.mobile);
    await screen.findByRole('heading', { level: 1, name: 'Categories' });
    await screen.findAllByRole('link', { name: /Groceries/ });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('opens a read-only view for a default category with a way to create your own', async () => {
    categoryApi();
    const { user } = await openCategories();
    await user.click(await screen.findByRole('link', { name: /^Groceries/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Groceries' });
    expect(dialog).toHaveTextContent("can't be changed or deleted");
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Create your own category' }));
    expect(await screen.findByRole('dialog', { name: 'Create category' })).toBeVisible();
  });
});

describe('create and edit', () => {
  it('previews the chip live and creates with the chosen icon and color', async () => {
    const created = makeCategory({
      name: 'Courses',
      system: false,
      icon: 'book-open',
      color: 'pink',
    });
    const api = categoryApi({
      'POST /categories': () => {
        categories = [...categories, created];
        return ok(created, 201);
      },
    });
    const { user } = await openCategories(VIEWPORT.desktop, '/categories/new');
    const dialog = await screen.findByRole('dialog', { name: 'Create category' });
    const preview = within(dialog).getByRole('group', { name: 'Preview' });
    expect(preview).toHaveTextContent('Category name');
    expect(within(dialog).getByLabelText(/Name/)).toHaveFocus();

    await user.type(within(dialog).getByLabelText(/Name/), 'Courses');
    expect(preview).toHaveTextContent('Courses');
    // The suggested color is the first Core color unused by this user for the type.
    expect(within(dialog).getByRole('radio', { name: 'Blue' })).toBeChecked();
    await user.click(within(dialog).getByRole('radio', { name: 'Pink' }));
    expect(preview.querySelector('[data-cat-color]')).toHaveAttribute('data-cat-color', 'pink');

    await user.type(await within(dialog).findByLabelText('Search icons'), 'reading');
    await user.click(within(dialog).getByRole('radio', { name: 'Book open' }));
    await user.click(within(dialog).getByRole('button', { name: 'Create category' }));
    await waitFor(() => expect(api.callsTo('POST /categories')).toHaveLength(1));
    expect(api.callsTo('POST /categories')[0]?.body).toEqual({
      name: 'Courses',
      type: 'expense',
      icon: 'book-open',
      color: 'pink',
    });
    expect(await screen.findByRole('link', { name: 'Courses, expense category' })).toBeVisible();
  });

  it('lets the keyboard choose a color with arrow keys', async () => {
    categoryApi();
    const { user } = await openCategories(VIEWPORT.desktop, '/categories/new');
    const dialog = await screen.findByRole('dialog', { name: 'Create category' });
    const blue = within(dialog).getByRole('radio', { name: 'Blue' });
    blue.focus();
    await user.keyboard('{ArrowRight}');
    expect(within(dialog).getByRole('radio', { name: 'Yellow' })).toBeChecked();
    expect(within(dialog).getByRole('radio', { name: 'Yellow' })).toHaveFocus();
  });

  it('validates the name and shows a duplicate name on the field', async () => {
    const api = categoryApi({ 'POST /categories': problem(409, 'CATEGORY_NAME_TAKEN') });
    const { user } = await openCategories(VIEWPORT.desktop, '/categories/new');
    const dialog = await screen.findByRole('dialog', { name: 'Create category' });
    await user.click(within(dialog).getByRole('button', { name: 'Create category' }));
    expect(await within(dialog).findByText('Enter a name.')).toBeVisible();
    expect(api.callsTo('POST /categories')).toHaveLength(0);
    await user.type(within(dialog).getByLabelText(/Name/), 'Pets');
    await user.click(within(dialog).getByRole('button', { name: 'Create category' }));
    expect(
      await within(dialog).findByText('You already have an expense category with this name.'),
    ).toBeVisible();
    expect(within(dialog).getByLabelText(/Name/)).toHaveFocus();
  });

  it('edits a custom category, keeps the type read-only and sends only changes', async () => {
    const api = categoryApi();
    api.set(`PATCH /categories/${PETS}`, (request) => {
      const body = request.body as Partial<Category>;
      return ok({ ...categories.find((c) => c.id === PETS)!, ...body });
    });
    const { user } = await openCategories(VIEWPORT.desktop, `/categories/${PETS}/edit`);
    const dialog = await screen.findByRole('dialog', { name: 'Edit category' });
    expect(within(dialog).getByText("Type can't be changed.")).toBeVisible();
    expect(within(dialog).getByLabelText(/Name/)).toHaveValue('Pets');
    expect(within(dialog).getByRole('radio', { name: 'Teal' })).toBeChecked();
    expect(within(dialog).getByRole('button', { name: 'Save changes' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.click(within(dialog).getByRole('radio', { name: 'Red' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.callsTo(`PATCH /categories/${PETS}`)).toHaveLength(1));
    expect(api.callsTo(`PATCH /categories/${PETS}`)[0]?.body).toEqual({ color: 'red' });
  });

  it('asks the user to repair an icon that is no longer available', async () => {
    categories = [
      ...categories,
      makeCategory({
        id: uuid(903),
        name: 'Legacy',
        system: false,
        icon: 'removed-icon',
        color: 'teal',
      }),
    ];
    categoryApi();
    await openCategories(VIEWPORT.desktop, `/categories/${uuid(903)}/edit`);
    const dialog = await screen.findByRole('dialog', { name: 'Edit category' });
    expect(
      within(dialog).getByText('This icon is no longer available. Choose another.'),
    ).toBeVisible();
  });
});

describe('delete flow', () => {
  async function startDelete(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: 'Actions for Pets' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete category' }));
    return screen.findByRole('alertdialog', { name: 'Delete Pets?' });
  }

  it('deletes an unused category after one confirmation', async () => {
    const api = categoryApi();
    api.set(`DELETE /categories/${PETS}`, () => {
      categories = categories.filter((c) => c.id !== PETS);
      return ok({ reassignedTransactions: 0, reassignedTemplates: 0, deletedBudgets: 1 });
    });
    const { user } = await openCategories();
    const dialog = await startDelete(user);
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(dialog).toHaveTextContent("This can't be undone.");
    await user.click(within(dialog).getByRole('button', { name: 'Delete category' }));
    expect((await screen.findAllByText('Pets deleted. Deleted 1 budget.')).length).toBeGreaterThan(
      0,
    );
    expect(api.callsTo(`DELETE /categories/${PETS}`)[0]?.params.has('reassignTo')).toBe(false);
  });

  it('asks where to move transactions when the category is in use, then reassigns', async () => {
    const api = categoryApi();
    api.set(`DELETE /categories/${PETS}`, (request) => {
      if (!request.params.get('reassignTo')) return problem(409, 'CATEGORY_IN_USE');
      categories = categories.filter((c) => c.id !== PETS);
      return ok({ reassignedTransactions: 42, reassignedTemplates: 1, deletedBudgets: 1 });
    });
    const { user } = await openCategories();
    const dialog = await startDelete(user);
    await user.click(within(dialog).getByRole('button', { name: 'Delete category' }));

    const step2 = await screen.findByRole('alertdialog', { name: 'Move Pets to another category' });
    const confirm = within(step2).getByRole('button', { name: 'Delete and reassign' });
    expect(confirm).toHaveAttribute('aria-disabled', 'true');
    expect(within(step2).getByText('Choose a category to continue.')).toBeVisible();
    expect(step2).toHaveTextContent('Budgets for Pets will be deleted.');
    await user.click(confirm);
    expect(api.callsTo(`DELETE /categories/${PETS}`)).toHaveLength(1);

    const picker = within(step2).getByRole('combobox', { name: /Move to/ });
    await user.click(picker);
    const options = await screen.findAllByRole('option');
    // Same type only, never the category itself, defaults and own together.
    expect(options.map((option) => option.textContent)).toEqual(['Groceries', 'Housing']);
    await user.click(screen.getByRole('option', { name: /Housing/ }));
    await user.click(within(step2).getByRole('button', { name: 'Delete and reassign' }));
    await waitFor(() => expect(api.callsTo(`DELETE /categories/${PETS}`)).toHaveLength(2));
    expect(api.callsTo(`DELETE /categories/${PETS}`)[1]?.params.get('reassignTo')).toBeTruthy();
    expect(
      (
        await screen.findAllByText(
          'Pets deleted. Moved 42 transactions and 1 recurring transaction. Deleted 1 budget.',
        )
      ).length,
    ).toBeGreaterThan(0);
  });

  it('can step back from the reassign step without sending a request', async () => {
    const api = categoryApi();
    api.set(`DELETE /categories/${PETS}`, problem(409, 'CATEGORY_IN_USE'));
    const { user } = await openCategories();
    const dialog = await startDelete(user);
    await user.click(within(dialog).getByRole('button', { name: 'Delete category' }));
    const step2 = await screen.findByRole('alertdialog', { name: 'Move Pets to another category' });
    await user.click(within(step2).getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('alertdialog', { name: 'Delete Pets?' })).toBeVisible();
    expect(api.callsTo(`DELETE /categories/${PETS}`)).toHaveLength(1);
  });
});
