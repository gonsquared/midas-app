import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ThemeProvider, useTheme } from './theme-provider';

function Probe() {
  const { preference, resolved, setPreference } = useTheme();
  return (
    <div>
      <p data-testid="state">{`${preference}:${resolved}`}</p>
      <button onClick={() => setPreference('dark')}>dark</button>
      <button onClick={() => setPreference('light')}>light</button>
    </div>
  );
}

describe('ThemeProvider', () => {
  it('applies data-theme and persists the choice locally', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('state')).toHaveTextContent('system:light');
    await user.click(screen.getByText('dark'));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(localStorage.getItem('midas.theme')).toBe('dark');
    await user.click(screen.getByText('light'));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  });

  it('restores the stored preference on mount', () => {
    localStorage.setItem('midas.theme', 'dark');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('state')).toHaveTextContent('dark:dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });
});
