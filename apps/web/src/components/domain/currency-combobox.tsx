import { SUPPORTED_CURRENCIES } from '@midas/shared/locale';
import { useMemo } from 'react';
import { Combobox, type ComboboxProps } from '@/components/ui/combobox';

function currencyName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'currency' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Searchable currency list ("USD - US Dollar"); search matches the code or the name. */
export function CurrencyCombobox(props: Omit<ComboboxProps, 'options'>) {
  const options = useMemo(
    () =>
      SUPPORTED_CURRENCIES.map((code) => ({
        value: code,
        label: `${code} - ${currencyName(code)}`,
      })),
    [],
  );
  return <Combobox {...props} options={options} emptyText="No currency matches." />;
}
