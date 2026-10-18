import { Check } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

/** "Saved" confirmation that stays for 5 seconds (ui-design 7.3). */
export function useSavedStatus(durationMs = 5000): { saved: boolean; flash: () => void } {
  const [saved, setSaved] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const flash = useCallback(() => {
    setSaved(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSaved(false), durationMs);
  }, [durationMs]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return { saved, flash };
}

export function SavedStatus({ saved, message = 'Saved' }: { saved: boolean; message?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-1 text-body-sm text-success">
      {saved ? (
        <>
          <Check aria-hidden="true" className="size-4" />
          {message}
        </>
      ) : null}
    </span>
  );
}
