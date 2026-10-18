import { SUPPORTED_CURRENCIES, SUPPORTED_LOCALES } from '@midas/shared/locale';
import { Link, useRouter } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/page-header';
import { Alert } from '@/components/ui/alert';
import { ApiErrorAlert } from '@/components/ui/api-error-alert';
import { Button } from '@/components/ui/button';
import { ErrorSummary, type SummaryError } from '@/components/ui/error-summary';
import { FieldFrame, NativeSelect } from '@/components/ui/form-field';
import { Field } from '@/components/ui/input';
import { focusFirstInvalid } from '@/lib/focus';
import { applyProblemToForm } from '@/lib/problem-form';
import { useCountdown, formatClock } from '@/lib/use-countdown';
import { register } from './api';
import { PasswordField } from './password-field';
import { PasswordStrength } from './password-strength';
import { describeRegional, detectRegionalDefaults } from './regional';
import { authStrings } from './strings';
import { validateRegister, type FieldErrors, type RegisterField } from './validation';

const linkClass = 'text-primary underline underline-offset-2 hover:text-primary-hover';
const FIELD_LABELS: Record<RegisterField, string> = {
  displayName: 'Name',
  email: 'Email',
  password: 'Password',
};

function localeLabel(tag: string): string {
  try {
    return `${new Intl.DisplayNames(['en'], { type: 'language' }).of(tag) ?? tag} (${tag})`;
  } catch {
    return tag;
  }
}

export function RegisterPage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const defaults = useMemo(() => detectRegionalDefaults(), []);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [regional, setRegional] = useState(defaults);
  const [regionalOpen, setRegionalOpen] = useState(false);
  const [errors, setErrors] = useState<FieldErrors<RegisterField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [emailTaken, setEmailTaken] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const countdown = useCountdown();
  const blocked = countdown.remaining > 0;

  useEffect(() => {
    if (attempt > 0) focusFirstInvalid(formRef.current);
  }, [attempt]);

  const summary: SummaryError[] = (Object.keys(errors) as RegisterField[]).flatMap((field) => {
    const message = errors[field];
    return message ? [{ id: `register-${field}`, label: FIELD_LABELS[field], message }] : [];
  });

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending || blocked) return;
    const found = validateRegister({ displayName, email, password });
    setErrors(found);
    setFormError(null);
    setFailure(null);
    setEmailTaken(false);
    if (Object.keys(found).length > 0) {
      setAttempt((count) => count + 1);
      return;
    }
    setPending(true);
    try {
      await register({ displayName, email, password, ...regional });
      setPassword('');
      router.history.push('/dashboard');
    } catch (error) {
      const mapped = applyProblemToForm(error, {
        fieldMap: { displayName: 'displayName', email: 'email', password: 'password' },
        codeRules: { EMAIL_TAKEN: { field: 'email', message: authStrings.emailTaken } },
      });
      const next = mapped.fields as FieldErrors<RegisterField>;
      setErrors(next);
      setEmailTaken(mapped.code === 'EMAIL_TAKEN');
      if (mapped.status === 429) countdown.start(mapped.retryAfterSeconds ?? 30);
      if (Object.keys(next).length > 0) setAttempt((count) => count + 1);
      else setFailure(error);
      setFormError(mapped.form);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <PageHeader title={authStrings.registerTitle} />
      <form
        ref={formRef}
        noValidate
        onSubmit={(event) => void onSubmit(event)}
        className="flex flex-col gap-4"
      >
        <ErrorSummary errors={summary} ref={summaryRef} />
        {failure ? (
          blocked ? (
            <Alert variant="danger">
              Too many attempts. Try again in {formatClock(countdown.remaining)}.
            </Alert>
          ) : (
            <ApiErrorAlert error={failure} {...(formError ? { message: formError } : {})} />
          )
        ) : null}
        <Field
          id="register-displayName"
          label="Name"
          name="displayName"
          autoComplete="name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          error={errors.displayName}
        />
        <div className="flex flex-col gap-1">
          <Field
            id="register-email"
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
          {emailTaken ? (
            <p className="text-body-sm text-ink-2">
              <Link to="/login" className={linkClass}>
                Sign in
              </Link>{' '}
              or{' '}
              <Link to="/forgot-password" className={linkClass}>
                reset your password
              </Link>
              .
            </p>
          ) : null}
        </div>
        <PasswordField
          id="register-password"
          label="Password"
          name="password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          error={errors.password}
        >
          <PasswordStrength password={password} userInputs={[email, displayName]} />
        </PasswordField>
        <div className="flex flex-col gap-2 rounded-md border border-line p-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-body-sm text-ink-2">
              <span className="font-medium text-ink">Regional defaults: </span>
              {describeRegional(regional)}
            </p>
            <button
              type="button"
              aria-expanded={regionalOpen}
              {...(regionalOpen ? { 'aria-controls': 'register-regional' } : {})}
              onClick={() => setRegionalOpen((open) => !open)}
              className={`${linkClass} shrink-0 text-body-sm`}
            >
              Change
            </button>
          </div>
          {regionalOpen ? (
            <div id="register-regional" className="flex flex-col gap-3">
              <FieldFrame label="Currency">
                {(control) => (
                  <NativeSelect
                    {...control}
                    value={regional.currency}
                    onChange={(currency) => setRegional({ ...regional, currency })}
                    options={SUPPORTED_CURRENCIES.map((code) => ({ value: code, label: code }))}
                  />
                )}
              </FieldFrame>
              <FieldFrame label="Language and number format">
                {(control) => (
                  <NativeSelect
                    {...control}
                    value={regional.locale}
                    onChange={(locale) => setRegional({ ...regional, locale })}
                    options={SUPPORTED_LOCALES.map((tag) => ({
                      value: tag,
                      label: localeLabel(tag),
                    }))}
                  />
                )}
              </FieldFrame>
              <FieldFrame label="Time zone">
                {(control) => (
                  <NativeSelect
                    {...control}
                    value={regional.timezone}
                    onChange={(timezone) => setRegional({ ...regional, timezone })}
                    options={['UTC', ...Intl.supportedValuesOf('timeZone')].map((zone) => ({
                      value: zone,
                      label: zone,
                    }))}
                  />
                )}
              </FieldFrame>
            </div>
          ) : null}
        </div>
        <Button
          type="submit"
          size="lg"
          loading={pending}
          aria-disabled={blocked || undefined}
          className="w-full"
        >
          {blocked
            ? `Try again in ${formatClock(countdown.remaining)}`
            : authStrings.registerSubmit}
        </Button>
      </form>
      <p className="mt-6 text-body-sm text-ink-2">
        Already have an account?{' '}
        <Link to="/login" className={linkClass}>
          Sign in
        </Link>
      </p>
    </>
  );
}
