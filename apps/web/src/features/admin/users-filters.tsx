import type { AdminUserSort, Role, UserStatus } from '@midas/shared';
import { FieldFrame, NativeSelect } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { DEFAULT_SORT, type UsersSearch } from './users-search';

const SORTS: Array<{ value: AdminUserSort; label: string }> = [
  { value: 'createdAt_desc', label: 'Newest' },
  { value: 'createdAt_asc', label: 'Oldest' },
  { value: 'email_asc', label: 'Email A to Z' },
  { value: 'lastLoginAt_desc', label: 'Last sign-in' },
];

export function UsersFilters({
  search,
  text,
  onText,
  onChange,
}: {
  search: UsersSearch;
  text: string;
  onText: (value: string) => void;
  onChange: (patch: Partial<UsersSearch>) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <FieldFrame id="user-search" label="Search name or email">
        {(control) => (
          <Input
            {...control}
            type="search"
            autoComplete="off"
            value={text}
            maxLength={100}
            onChange={(event) => onText(event.target.value)}
          />
        )}
      </FieldFrame>
      <FieldFrame id="user-role" label="Role">
        {(control) => (
          <NativeSelect
            {...control}
            value={search.role ?? ''}
            onChange={(v) => onChange({ role: (v || undefined) as Role | undefined })}
            options={[
              { value: '', label: 'Any role' },
              { value: 'user', label: 'User' },
              { value: 'admin', label: 'Admin' },
            ]}
          />
        )}
      </FieldFrame>
      <FieldFrame id="user-status" label="Status">
        {(control) => (
          <NativeSelect
            {...control}
            value={search.status ?? ''}
            onChange={(v) => onChange({ status: (v || undefined) as UserStatus | undefined })}
            options={[
              { value: '', label: 'Any status' },
              { value: 'active', label: 'Active' },
              { value: 'suspended', label: 'Suspended' },
            ]}
          />
        )}
      </FieldFrame>
      <FieldFrame id="user-sort" label="Sort">
        {(control) => (
          <NativeSelect
            {...control}
            value={search.sort ?? DEFAULT_SORT}
            onChange={(v) => onChange({ sort: v as AdminUserSort })}
            options={SORTS}
          />
        )}
      </FieldFrame>
    </div>
  );
}
