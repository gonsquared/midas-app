import { Copy } from 'lucide-react';
import { useState, type ReactNode, type Ref } from 'react';
import { ApiError, getErrorMessage, NETWORK_ERROR_CODE } from '@/lib/api-client';
import { Alert } from './alert';
import { Button } from './button';

export interface ApiErrorAlertProps {
  error: unknown;
  /** Replaces the generic text for 4xx problems the caller does not special-case. */
  message?: string;
  action?: ReactNode;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}

/**
 * Maps a failed request to friendly copy. Server text is rendered as text only. A 5xx shows the
 * request id with a copy button so support can find the failure without exposing internals.
 */
export function ApiErrorAlert({ error, message, action, className, ref }: ApiErrorAlertProps) {
  const [copied, setCopied] = useState(false);
  const requestId =
    error instanceof ApiError && error.status >= 500 && error.code !== NETWORK_ERROR_CODE
      ? error.requestId
      : undefined;
  const text = message ?? getErrorMessage(error);
  return (
    <Alert
      ref={ref}
      tabIndex={-1}
      variant="danger"
      {...(className ? { className } : {})}
      action={
        <>
          {action}
          {requestId ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(requestId)
                  .then(() => setCopied(true))
                  .catch(() => undefined);
              }}
            >
              <Copy aria-hidden="true" className="size-4" />
              {copied ? 'Copied' : 'Copy reference'}
            </Button>
          ) : null}
        </>
      }
    >
      <p>{text}</p>
      {requestId ? <p className="text-ink-3">Reference: {requestId}</p> : null}
    </Alert>
  );
}
