import { SUPPORTED_CURRENCIES, SUPPORTED_LOCALES } from '@midas/shared/locale';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { ApiErrorAlert } from '@/components/ui/api-error-alert';
import { Button } from '@/components/ui/button';
import { FieldFrame, NativeSelect } from '@/components/ui/form-field';
import { Segmented } from '@/components/ui/segmented';
import { formatMinor } from '@/lib/money';
import { useSession } from '@/lib/session';
import { isThemePreference } from '@/lib/theme';
import { updateProfile } from './api';
import { SavedStatus, useSavedStatus } from './saved-status';
import { useThemeSetting } from './use-theme-setting';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: <Sun className="size-4" /> },
  { value: 'dark', label: 'Dark', icon: <Moon className="size-4" /> },
  { value: 'system', label: 'System', icon: <Monitor className="size-4" /> },
] as const;

function displayName(type: 'currency' | 'language', code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** One line that shows how money, dates and numbers will read with the chosen settings. */
export function formatSample(currency: string, locale: string, timezone: string): string {
  const money = formatMinor(123456, currency, locale);
  let date: string;
  try {
    date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: timezone }).format(
      new Date(),
    );
  } catch {
    date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date());
  }
  return `${money} · ${date} · ${new Intl.NumberFormat(locale).format(1234.5)}`;
}

export function PreferencesSection() {
  const { user } = useSession();
  const { preference, setTheme } = useThemeSetting();
  const prefs = user?.preferences;
  const [currency, setCurrency] = useState<string>(prefs?.currency ?? 'USD');
  const [locale, setLocale] = useState<string>(prefs?.locale ?? 'en-US');
  const [timezone, setTimezone] = useState(prefs?.timezone ?? 'UTC');
  const [failure, setFailure] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const { saved, flash } = useSavedStatus();
  const zones = useMemo(() => ['UTC', ...Intl.supportedValuesOf('timeZone')], []);

  if (!prefs) return null;
  const dirty =
    currency !== prefs.currency || locale !== prefs.locale || timezone !== prefs.timezone;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending || !dirty) return;
    setFailure(null);
    setPending(true);
    try {
      await updateProfile({ preferences: { currency, locale, timezone } });
      flash();
    } catch (caught) {
      setFailure(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="settings-theme-heading" className="flex flex-col gap-3">
        <h2 id="settings-theme-heading" className="font-display text-heading">
          Theme
        </h2>
        <Segmented
          legend="Theme"
          options={THEME_OPTIONS}
          value={preference}
          onChange={(value) => {
            if (isThemePreference(value)) void setTheme(value);
          }}
        />
        <p className="text-body-sm text-ink-3">Applies right away and is saved to your account.</p>
      </section>
      <form
        noValidate
        aria-labelledby="settings-formats-heading"
        onSubmit={(event) => void onSubmit(event)}
        className="flex flex-col gap-4"
      >
        <h2 id="settings-formats-heading" className="font-display text-heading">
          Currency and formats
        </h2>
        {failure ? <ApiErrorAlert error={failure} /> : null}
        <FieldFrame
          label="Currency"
          helper="Currency only sets defaults for new wallets and budgets. Existing data keeps its currency."
        >
          {(control) => (
            <NativeSelect
              {...control}
              value={currency}
              onChange={setCurrency}
              options={SUPPORTED_CURRENCIES.map((code) => ({
                value: code,
                label: `${code} - ${displayName('currency', code)}`,
              }))}
            />
          )}
        </FieldFrame>
        <FieldFrame label="Language and number format">
          {(control) => (
            <NativeSelect
              {...control}
              value={locale}
              onChange={setLocale}
              options={SUPPORTED_LOCALES.map((tag) => ({
                value: tag,
                label: `${displayName('language', tag)} (${tag})`,
              }))}
            />
          )}
        </FieldFrame>
        <FieldFrame label="Time zone">
          {(control) => (
            <NativeSelect
              {...control}
              value={timezone}
              onChange={setTimezone}
              options={zones.map((zone) => ({ value: zone, label: zone }))}
            />
          )}
        </FieldFrame>
        <p className="text-body-sm text-ink-2" data-testid="format-sample">
          <span className="font-medium">Sample: </span>
          <span className="tabular">{formatSample(currency, locale, timezone)}</span>
        </p>
        <div className="flex items-center gap-3">
          <Button type="submit" loading={pending} aria-disabled={!dirty || undefined}>
            Save changes
          </Button>
          {!dirty ? <span className="text-body-sm text-ink-3">No changes to save.</span> : null}
          <SavedStatus saved={saved} />
        </div>
      </form>
    </div>
  );
}
