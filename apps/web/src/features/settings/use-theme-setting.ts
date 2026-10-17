import { useCallback } from 'react';
import { useTheme } from '@/app/theme-provider';
import { useAnnounce } from '@/components/ui/announcer';
import { useToast } from '@/components/ui/toast';
import type { ThemePreference } from '@/lib/theme';
import { updateProfile } from './api';

const LABELS: Record<ThemePreference, string> = { light: 'Light', dark: 'Dark', system: 'System' };

/**
 * Theme is the one setting that applies and saves immediately. The change takes effect first
 * (and is kept on this device); saving to the account happens in the background and a failure
 * is reported without undoing what the user can already see.
 */
export function useThemeSetting(): {
  preference: ThemePreference;
  setTheme: (next: ThemePreference) => Promise<void>;
} {
  const { preference, setPreference } = useTheme();
  const announce = useAnnounce();
  const { toast } = useToast();

  const setTheme = useCallback(
    async (next: ThemePreference) => {
      setPreference(next);
      announce(`Theme set to ${LABELS[next]}`);
      try {
        await updateProfile({ preferences: { theme: next } });
      } catch {
        toast({
          variant: 'danger',
          title: 'Theme not saved to your account',
          description: 'It is applied on this device. Try again from Settings.',
        });
      }
    },
    [announce, setPreference, toast],
  );

  return { preference, setTheme };
}
