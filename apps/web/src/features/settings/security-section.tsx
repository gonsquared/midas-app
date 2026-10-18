import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiErrorAlert } from '@/components/ui/api-error-alert';
import { Button } from '@/components/ui/button';
import { useSignOut } from '@/features/auth/hooks';
import { PasswordField } from '@/features/auth/password-field';
import { PasswordStrength } from '@/features/auth/password-strength';
import { validateNewPassword } from '@/features/auth/validation';
import { focusFirstInvalid } from '@/lib/focus';
import { applyProblemToForm } from '@/lib/problem-form';
import { useSession } from '@/lib/session';
import { changePassword } from './api';
import { SavedStatus, useSavedStatus } from './saved-status';

type Field = 'current' | 'next';

export function SecuritySection() {
  const { user } = useSession();
  const signOut = useSignOut();
  const formRef = useRef<HTMLFormElement>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [failure, setFailure] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const { saved, flash } = useSavedStatus();

  useEffect(() => {
    if (attempt > 0) focusFirstInvalid(formRef.current);
  }, [attempt]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const found: Partial<Record<Field, string>> = {};
    if (!current) found.current = 'Enter your current password.';
    const invalidNext = validateNewPassword(next);
    if (invalidNext) found.next = invalidNext;
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length > 0) {
      setAttempt((count) => count + 1);
      return;
    }
    setPending(true);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      flash();
    } catch (caught) {
      const mapped = applyProblemToForm(caught, {
        fieldMap: { newPassword: 'next', currentPassword: 'current' },
        codeRules: {
          INVALID_CURRENT_PASSWORD: {
            field: 'current',
            message: 'That is not your current password.',
          },
        },
      });
      const fields = mapped.fields as Partial<Record<Field, string>>;
      setErrors(fields);
      if (Object.keys(fields).length > 0) setAttempt((count) => count + 1);
      else setFailure(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <form
        ref={formRef}
        noValidate
        aria-labelledby="settings-security-heading"
        onSubmit={(event) => void onSubmit(event)}
        className="flex flex-col gap-4"
      >
        <h2 id="settings-security-heading" className="font-display text-heading">
          Change password
        </h2>
        {failure ? <ApiErrorAlert error={failure} /> : null}
        <PasswordField
          label="Current password"
          name="currentPassword"
          autoComplete="current-password"
          value={current}
          onChange={setCurrent}
          error={errors.current}
        />
        <PasswordField
          label="New password"
          name="newPassword"
          autoComplete="new-password"
          value={next}
          onChange={setNext}
          error={errors.next}
          helper="Other devices will be signed out. You will stay signed in here."
        >
          <PasswordStrength
            password={next}
            userInputs={user ? [user.email, user.displayName] : []}
          />
        </PasswordField>
        <div className="flex items-center gap-3">
          <Button type="submit" loading={pending}>
            Update password
          </Button>
          <SavedStatus saved={saved} message="Password updated. Other devices were signed out." />
        </div>
      </form>
      <section aria-labelledby="settings-session-heading" className="flex flex-col gap-2">
        <h2 id="settings-session-heading" className="font-display text-heading">
          Session
        </h2>
        <div>
          <Button variant="secondary" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </section>
    </div>
  );
}
