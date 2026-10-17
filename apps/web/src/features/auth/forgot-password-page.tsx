import { Link } from '@tanstack/react-router';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/page-header';
import { Alert } from '@/components/ui/alert';
import { ApiErrorAlert } from '@/components/ui/api-error-alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/input';
import { ApiError } from '@/lib/api-client';
import { focusFirstInvalid } from '@/lib/focus';
import { formatClock, useCountdown } from '@/lib/use-countdown';
import { requestPasswordReset } from './api';
import { authStrings } from './strings';
import { validateEmail } from './validation';

const linkClass = 'text-primary underline underline-offset-2 hover:text-primary-hover';
const RESEND_COOLDOWN_SECONDS = 60;

export function ForgotPasswordPage() {
  const formRef = useRef<HTMLFormElement>(null);
  const confirmationRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const cooldown = useCountdown();

  useEffect(() => {
    if (attempt > 0) focusFirstInvalid(formRef.current);
  }, [attempt]);

  useEffect(() => {
    if (sentTo) confirmationRef.current?.focus();
  }, [sentTo]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending || cooldown.remaining > 0) return;
    const invalid = validateEmail(email);
    setError(invalid);
    setFailure(null);
    if (invalid) {
      setAttempt((count) => count + 1);
      return;
    }
    setPending(true);
    try {
      await requestPasswordReset(email);
      setSentTo(email.trim());
      cooldown.start(RESEND_COOLDOWN_SECONDS);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 429) {
        cooldown.start(caught.retryAfterSeconds ?? RESEND_COOLDOWN_SECONDS);
      }
      setFailure(caught);
    } finally {
      setPending(false);
    }
  }

  const waiting = cooldown.remaining > 0;

  return (
    <>
      <PageHeader title={authStrings.forgotTitle}>
        {sentTo ? undefined : authStrings.forgotIntro}
      </PageHeader>
      {sentTo ? (
        <Alert ref={confirmationRef} tabIndex={-1} variant="success" className="mb-4">
          If an account exists for {sentTo}, we have sent a link. It expires in 30 minutes.
        </Alert>
      ) : null}
      <form
        ref={formRef}
        noValidate
        onSubmit={(event) => void onSubmit(event)}
        className="flex flex-col gap-4"
      >
        {failure ? (
          waiting ? (
            <Alert variant="danger">
              Too many attempts. Try again in {formatClock(cooldown.remaining)}.
            </Alert>
          ) : (
            <ApiErrorAlert error={failure} />
          )
        ) : null}
        <Field
          label="Email"
          type="email"
          name="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={error}
        />
        <Button
          type="submit"
          size="lg"
          loading={pending}
          aria-disabled={waiting || undefined}
          className="w-full"
        >
          {waiting && sentTo
            ? `Send again in ${formatClock(cooldown.remaining)}`
            : sentTo
              ? 'Send again'
              : authStrings.forgotSubmit}
        </Button>
      </form>
      <p className="mt-6 text-body-sm">
        <Link to="/login" className={linkClass}>
          Back to sign in
        </Link>
      </p>
    </>
  );
}
