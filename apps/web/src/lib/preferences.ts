import { useMemo } from 'react';
import { useSession } from './session';

export interface FormattingPreferences {
  currency: string;
  locale: string;
  timezone: string;
}

const DEFAULTS: FormattingPreferences = { currency: 'USD', locale: 'en-US', timezone: 'UTC' };

/** The signed-in user's currency, locale and time zone; every formatter reads these. */
export function usePreferences(): FormattingPreferences {
  const { user } = useSession();
  const prefs = user?.preferences;
  return useMemo(
    () =>
      prefs
        ? { currency: prefs.currency, locale: prefs.locale, timezone: prefs.timezone }
        : DEFAULTS,
    [prefs],
  );
}
