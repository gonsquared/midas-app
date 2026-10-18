import { describe, expect, it } from 'vitest';
import { parseUsersSearch } from './users-search';

describe('parseUsersSearch', () => {
  it('keeps valid filters and drops defaults and junk', () => {
    expect(
      parseUsersSearch({
        q: ' kim ',
        role: 'admin',
        status: 'suspended',
        sort: 'email_asc',
        page: '3',
        pageSize: '50',
      }),
    ).toEqual({
      q: 'kim',
      role: 'admin',
      status: 'suspended',
      sort: 'email_asc',
      page: 3,
      pageSize: 50,
    });
    expect(parseUsersSearch({ sort: 'createdAt_desc', page: '1', pageSize: '25' })).toEqual({});
    expect(
      parseUsersSearch({ role: 'root', status: 'x', sort: 'bad', page: '-2', pageSize: '7' }),
    ).toEqual({});
    expect(parseUsersSearch({ user: 'not-a-uuid' })).toEqual({});
  });
});
