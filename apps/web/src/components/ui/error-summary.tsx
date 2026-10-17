import type { Ref } from 'react';
import { Alert } from './alert';

export interface SummaryError {
  /** Id of the control to focus. */
  id: string;
  message: string;
  label: string;
}

/**
 * Lists two or more invalid fields as links to the controls (WCAG 3.3.1). role alert so it is
 * announced when it appears after a failed submit.
 */
export function ErrorSummary({
  errors,
  ref,
}: {
  errors: readonly SummaryError[];
  ref?: Ref<HTMLDivElement>;
}) {
  if (errors.length < 2) return null;
  return (
    <Alert ref={ref} variant="danger" title={`${errors.length} things need fixing`} tabIndex={-1}>
      <ul className="list-disc space-y-0.5 pl-5">
        {errors.map((error) => (
          <li key={error.id}>
            <a
              href={`#${error.id}`}
              className="text-ink underline underline-offset-2"
              onClick={(event) => {
                event.preventDefault();
                document.getElementById(error.id)?.focus();
              }}
            >
              {error.label}: {error.message}
            </a>
          </li>
        ))}
      </ul>
    </Alert>
  );
}
