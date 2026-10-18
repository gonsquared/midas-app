import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiErrorAlert } from '@/components/ui/api-error-alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/input';
import { validateDisplayName } from '@/features/auth/validation';
import { focusFirstInvalid } from '@/lib/focus';
import { applyProblemToForm } from '@/lib/problem-form';
import { useSession } from '@/lib/session';
import { updateProfile } from './api';
import { SavedStatus, useSavedStatus } from './saved-status';

export function ProfileSection() {
  const { user } = useSession();
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState(user?.displayName ?? '');
  const [error, setError] = useState<string | undefined>();
  const [failure, setFailure] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const { saved, flash } = useSavedStatus();

  useEffect(() => {
    if (attempt > 0) focusFirstInvalid(formRef.current);
  }, [attempt]);

  if (!user) return null;
  const dirty = name.trim() !== user.displayName;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending || !dirty) return;
    const invalid = validateDisplayName(name);
    setError(invalid);
    setFailure(null);
    if (invalid) {
      setAttempt((count) => count + 1);
      return;
    }
    setPending(true);
    try {
      const updated = await updateProfile({ displayName: name.trim() });
      setName(updated.displayName);
      flash();
    } catch (caught) {
      const mapped = applyProblemToForm(caught, { fieldMap: { displayName: 'displayName' } });
      if (mapped.fields['displayName']) {
        setError(mapped.fields['displayName']);
        setAttempt((count) => count + 1);
      } else {
        setFailure(caught);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      ref={formRef}
      noValidate
      aria-labelledby="settings-profile-heading"
      onSubmit={(event) => void onSubmit(event)}
      className="flex flex-col gap-4"
    >
      <h2 id="settings-profile-heading" className="font-display text-heading">
        Profile
      </h2>
      {failure ? <ApiErrorAlert error={failure} /> : null}
      <Field
        label="Display name"
        name="displayName"
        autoComplete="name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        error={error}
      />
      <div className="flex flex-col gap-1">
        <span className="text-body-sm font-medium text-ink-2">Email</span>
        <p className="text-body text-ink" dir="auto">
          {user.email}
        </p>
        <p className="text-body-sm text-ink-3">Email changes are not supported yet.</p>
      </div>
      <div className="flex items-center gap-3">
        <Button
          type="submit"
          loading={pending}
          aria-disabled={!dirty || undefined}
          aria-describedby={dirty ? undefined : 'profile-no-changes'}
        >
          Save changes
        </Button>
        {!dirty ? (
          <span id="profile-no-changes" className="text-body-sm text-ink-3">
            No changes to save.
          </span>
        ) : null}
        <SavedStatus saved={saved} />
      </div>
    </form>
  );
}
