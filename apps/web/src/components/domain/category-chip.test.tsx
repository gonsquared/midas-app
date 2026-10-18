import { CATEGORY_COLORS, CATEGORY_ICONS } from '@midas/shared/categories';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATEGORY_ICON_COMPONENTS } from './category-icons';
import { CategoryChip } from './category-chip';

describe('category icon map', () => {
  it('has exactly the allowlist keys and every entry resolves to a component', () => {
    expect(Object.keys(CATEGORY_ICON_COMPONENTS).sort()).toEqual([...CATEGORY_ICONS].sort());
    for (const icon of CATEGORY_ICONS) {
      expect(CATEGORY_ICON_COMPONENTS[icon], icon).toBeTruthy();
    }
  });
});

describe('category color tokens', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/styles/category-colors.css'), 'utf8')
    // A Windows checkout may have CRLF line endings.
    .replace(/\r\n/g, '\n');

  it('carries one light and one dark rule per palette key that match the shared palette', () => {
    for (const [key, token] of Object.entries(CATEGORY_COLORS)) {
      const light = [
        "[data-cat-color='" + key + "'] {",
        '  --cat: ' + token.light.toLowerCase() + ';',
        '}',
      ].join('\n');
      const dark = [
        "[data-theme='dark'] [data-cat-color='" + key + "'] {",
        '  --cat: ' + token.dark.toLowerCase() + ';',
        '}',
      ].join('\n');
      expect(css, key + ' light').toContain(light);
      expect(css, key + ' dark').toContain(dark);
    }
    expect((css.match(/--cat: #/g) ?? []).length).toBe(Object.keys(CATEGORY_COLORS).length * 2);
  });
});

describe('CategoryChip', () => {
  it('sets only data attributes (no inline style) and hides the chip when the name is adjacent', () => {
    const { container } = render(<CategoryChip icon="paw-print" color="teal" name="Pets" />);
    const root = container.firstElementChild!;
    expect(root).toHaveAttribute('data-cat-color', 'teal');
    expect(container.querySelector('[style]')).toBeNull();
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByText('Pets')).toBeVisible();
  });

  it('falls back to the tag icon on slate for unknown keys', () => {
    const { container } = render(
      <CategoryChip icon="removed-icon" color="chartreuse" label="Old" />,
    );
    expect(container.firstElementChild).toHaveAttribute('data-cat-color', 'slate');
    expect(screen.getByRole('img', { name: 'Old' })).toBeInTheDocument();
  });

  it('marks retired categories in text', () => {
    render(<CategoryChip icon="tag" color="slate" name="Legacy" retired />);
    expect(screen.getByText('Retired')).toBeVisible();
  });
});
