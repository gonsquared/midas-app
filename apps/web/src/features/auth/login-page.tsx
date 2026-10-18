import { Link, useRouter } from '@tanstack/react-router';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/page-header';
import { Alert } from '@/components/ui/alert';
import { ApiErrorAlert } from '@/components/ui/api-error-alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/input';
import { ApiError } from '@/lib/api-client';
import { focusFirstInvalid } from '@/lib/focus';
import { safeReturnPath } from '@/lib/redirect';
import { formatClock, useCountdown } from '@/lib/use-countdown';
import { login } from './api';
import { PasswordField } from './password-field';
import { authStrings, type AuthReason } from './strings';
import { validateLogin, type FieldErrors, type LoginField } from './validation';

const linkClass = 'text-primary underline underline-offset-2 hover:text-primary-hover';

export function LoginPage({ reason, redirect }: { reason?: AuthReason; redirect?: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors<LoginField>>({});
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [credentialsRejected, setCredentialsRejected] = useState(false);
  const [suspended, setSuspended] = useState(false);
  const countdown = useCountdown();
  const blocked = countdown.remaining > 0;

  useEffect(() => {
    if (attempt > 0) focusFirstInvalid(formRef.current);
  }, [attempt]);

  useEffect(() => {
    if (credentialsRejected) passwordRef.current?.focus();
  }, [credentialsRejected]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending || blocked) return;
    const found = validateLogin({ email, password });
    setErrors(found);
    setFailure(null);
    setCredentialsRejected(false);
    if (Object.keys(found).length > 0) {
      setAttempt((count) => count + 1);
      return;
    }
    setPending(true);
    try {
      await login(email, password);
      setPassword('');
      router.history.push(safeReturnPath(redirect));
    } catch (error) {
      if (error instanceof ApiError && error.code === 'INVALID_CREDENTIALS') {
        setCredentialsRejected(true);
      } else if (error instanceof ApiError && error.code === 'ACCOUNT_SUSPENDED') {
        setSuspended(true);
      } else if (error instanceof ApiError && error.status === 429) {
        countdown.start(error.retryAfterSeconds ?? 30);
        setFailure(error);
      } else {
        setFailure(error);
      }
    } finally {
      setPending(false);
    }
  }

  if (suspended) {
    return (
      <>
        <PageHeader title={authStrings.suspendedTitle} />
        <Alert variant="warning">{authStrings.suspendedBody}</Alert>
        <Button
          variant="secondary"
          className="mt-4"
          onClick={() => {
            setSuspended(false);
            setPassword('');
          }}
        >
          Use a different account
        </Button>
      </>
    );
  }

  return (
    <>
      <PageHeader title={authStrings.signInTitle} />
      {reason ? (
        <Alert variant={reason === 'reset' ? 'success' : 'info'} className="mb-4">
          {authStrings.reasons[reason]}
        </Alert>
      ) : null}
      <form
        ref={formRef}
        noValidate
        onSubmit={(event) => void onSubmit(event)}
        className="flex flex-col gap-4"
      >
        {credentialsRejected ? (
          <Alert variant="danger">{authStrings.invalidCredentials}</Alert>
        ) : null}
        {failure ? (
          blocked ? (
            <Alert variant="danger">
              Too many attempts. Try again in {formatClock(countdown.remaining)}.
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
          error={errors.email}
        />
        <PasswordField
          label="Password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          error={errors.password}
          ref={passwordRef}
        />
        <div className="-mt-2 text-right text-body-sm">
          <Link to="/forgot-password" className={linkClass}>
            Forgot password?
          </Link>
        </div>
        <Button
          type="submit"
          size="lg"
          loading={pending}
          aria-disabled={blocked || undefined}
          className="w-full"
        >
          {blocked ? `Try again in ${formatClock(countdown.remaining)}` : authStrings.signInSubmit}
        </Button>
      </form>
      <p className="mt-6 text-body-sm text-ink-2">
        New to Midas?{' '}
        <Link to="/register" className={linkClass}>
          Create an account
        </Link>
      </p>
    </>
  );
}
