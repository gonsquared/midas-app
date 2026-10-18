import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

const LABELS = ['Weak', 'Weak', 'Fair', 'Good', 'Strong'] as const;
const BAR_STYLES = ['bg-danger', 'bg-danger', 'bg-warning-mark', 'bg-success', 'bg-success'];

/**
 * Live strength meter. The zxcvbn dictionaries are about 2 MB, so the checker is loaded lazily the
 * first time a password is typed. This is guidance only: the server decides (WEAK_PASSWORD).
 */
export function PasswordStrength({
  password,
  userInputs = [],
}: {
  password: string;
  userInputs?: readonly string[];
}) {
  const [score, setScore] = useState<number | null>(null);
  const inputsKey = JSON.stringify(userInputs);

  useEffect(() => {
    if (!password) {
      setScore(null);
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void import('@midas/shared/password')
        .then(({ passwordScore }) => {
          if (!cancelled) setScore(passwordScore(password, JSON.parse(inputsKey) as string[]));
        })
        .catch(() => {
          if (!cancelled) setScore(null);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [password, inputsKey]);

  if (!password) return null;
  const level = score ?? 0;
  return (
    <div className="flex flex-col gap-1" data-testid="password-strength">
      <div aria-hidden="true" className="flex gap-1">
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className={cn(
              'h-1.5 flex-1 rounded-full bg-sunken',
              score !== null && index < Math.max(level, 1) && BAR_STYLES[level],
            )}
          />
        ))}
      </div>
      <p role="status" className="text-body-sm text-ink-2">
        {score === null ? 'Checking strength...' : `Strength: ${LABELS[level]}.`}{' '}
        <span className="text-ink-3">Use 12 or more characters. Avoid common words.</span>
      </p>
    </div>
  );
}
