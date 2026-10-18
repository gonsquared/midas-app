import { Download } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { useAnnounce } from '@/components/ui/announcer';
import { Button, type ButtonVariant } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { ApiError, api, getErrorMessage } from '@/lib/api-client';
import { saveBlob } from '@/lib/download';
import { todayLocalDate } from '@/lib/dates';
import { usePreferences } from '@/lib/preferences';
import { toExportQuery, type TransactionFilters } from './filters';

export interface ExportButtonProps {
  /** The filters currently applied; the CSV contains exactly what the list shows. */
  filters: TransactionFilters;
  label?: string;
  variant?: ButtonVariant;
  className?: string;
}

function exportErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 429) {
    return error.retryAfterSeconds
      ? `You have exported a lot just now. Try again in ${error.retryAfterSeconds} seconds.`
      : 'You have exported a lot just now. Wait a minute and try again.';
  }
  if (error instanceof ApiError && error.status === 400) {
    return 'These filters could not be exported. Adjust them and try again.';
  }
  return getErrorMessage(error);
}

/**
 * Downloads the filtered ledger as CSV (E5-F3-S2). The file is fetched with the in-memory bearer
 * token and saved from a Blob, so the token never appears in a URL.
 */
export function ExportButton({
  filters,
  label = 'Export CSV',
  variant = 'secondary',
  className,
}: ExportButtonProps) {
  const { timezone } = usePreferences();
  const announce = useAnnounce();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function exportCsv() {
    if (pending) return;
    setPending(true);
    setError(null);
    announce('Preparing your export.');
    try {
      const { blob, filename } = await api.download('/transactions/export', {
        query: toExportQuery(filters),
      });
      const fallback = `midas-transactions-${todayLocalDate(timezone).replaceAll('-', '')}.csv`;
      saveBlob(blob, filename ?? fallback);
      announce('Export ready. The download has started.');
      toast({ variant: 'success', title: 'Export ready.', description: filename ?? fallback });
    } catch (caught) {
      setError(caught);
      announce('The export failed.', 'assertive');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={className ?? 'flex flex-col items-start gap-2 sm:items-end'}>
      <Button variant={variant} loading={pending} onClick={() => void exportCsv()}>
        {pending ? null : <Download aria-hidden="true" className="size-4" />}
        {pending ? 'Preparing export' : label}
      </Button>
      {error ? (
        <Alert
          variant="danger"
          className="max-w-md"
          action={
            <Button variant="secondary" size="sm" onClick={() => void exportCsv()}>
              Try again
            </Button>
          }
        >
          {exportErrorMessage(error)}
        </Alert>
      ) : null}
    </div>
  );
}
