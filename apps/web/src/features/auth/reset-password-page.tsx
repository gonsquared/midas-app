import { Link, useRouter } from '@tanstack/react-router';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/page-header';
import { Alert } from '@/components/ui/alert';
import { ApiErrorAlert } from '@/components/ui/api-error-alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ApiError } from '@/lib/api-client';
import { focusFirstInvalid } from '@/lib/focus';
import { resetPassword, verifyResetToken } from './api';
import { PasswordField } from './password-field';
import { PasswordStrength } from './password-strength';
import { readResetToken } from './reset-token';
import { authStrings } from './strings';
import { validateNewPassword } from './validation';

const linkClass = 'text-primary underline underline-offset-2 hover:text-primary-hover';
type Phase = 'verifying' | 'valid' | 'invalid' | 'unavailable';

export function ResetPasswordPage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  // Read once: the fragment is stripped from the address bar right after.
  const [token] = useState(() => readResetToken(router.state.location.hash));
  const [phase, setPhase] = useState<Phase>(token ? 'verifying' : 'invalid');
  const [verifyFailure, setVerifyFailure] = useState<unknown>(null);
  const [attemptKey, setAttemptKey] = useState(0);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [failure, setFailure] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (router.state.location.hash) {
      router.history.replace(router.state.location.pathname);
    }
  }, [router]);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    setPhase('verifying');
    verifyResetToken(token)
      .then(() => {
        if (!cancelled) setPhase('valid');
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        if (caught instanceof ApiError && caught.code === 'RESET_TOKEN_INVALID') {
          setPhase('invalid');
        } else {
          setVerifyFailure(caught);
          setPhase('unavailable');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, attemptKey]);

  useEffect(() => {
    if (attempt > 0) focusFirstInvalid(formRef.current);
  }, [attempt]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending || !token) return;
    const invalid = validateNewPassword(password);
    setError(invalid);
    setFailure(null);
    if (invalid) {
      setAttempt((count) => count + 1);
      return;
    }
    setPending(true);
    try {
      await resetPassword(token, password);
      setPassword('');
      router.history.push('/login?reason=reset');
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'RESET_TOKEN_INVALID') {
        setPhase('invalid');
      } else if (
        caught instanceof ApiError &&
        caught.fieldErrors.some((entry) => entry.field === 'newPassword')
      ) {
        setError(caught.fieldErrors.find((entry) => entry.field === 'newPassword')?.message);
        setAttempt((count) => count + 1);
      } else {
        setFailure(caught);
      }
    } finally {
      setPending(false);
    }
  }

  if (phase === 'verifying') {
    return (
      <>
        <PageHeader title={authStrings.resetTitle} />
        <p role="status" aria-busy="true" className="flex items-center gap-2 text-body text-ink-2">
          <Spinner />
          Checking your link...
        </p>
      </>
    );
  }

  if (phase === 'invalid') {
    return (
      <>
        <PageHeader title={authStrings.resetTitle} />
        <Alert variant="warning">{authStrings.resetInvalid}</Alert>
        <div className="mt-4 flex flex-col items-start gap-3">
          <Button asChild>
            <Link to="/forgot-password">Request a new link</Link>
          </Button>
          <Link to="/login" className={`${linkClass} text-body-sm`}>
            Back to sign in
          </Link>
        </div>
      </>
    );
  }

  if (phase === 'unavailable') {
    return (
      <>
        <PageHeader title={authStrings.resetTitle} />
        <ApiErrorAlert
          error={verifyFailure}
          action={
            <Button variant="secondary" size="sm" onClick={() => setAttemptKey((key) => key + 1)}>
              Try again
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title={authStrings.resetTitle} />
      <form
        ref={formRef}
        noValidate
        onSubmit={(event) => void onSubmit(event)}
        className="flex flex-col gap-4"
      >
        {failure ? <ApiErrorAlert error={failure} /> : null}
        <PasswordField
          label="New password"
          name="newPassword"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          error={error}
        >
          <PasswordStrength password={password} />
        </PasswordField>
        <Button type="submit" size="lg" loading={pending} className="w-full">
          {authStrings.resetSubmit}
        </Button>
      </form>
    </>
  );
}
