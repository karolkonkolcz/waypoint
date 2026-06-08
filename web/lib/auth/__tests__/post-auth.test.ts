import { describe, expect, it } from 'vitest';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { postAuthPath } from '../post-auth';

const USER = { id: 'user-001', email: 'hiker@example.com' } as User;

function makeSupabaseStub(options: {
  user: User | null;
  profileExists: boolean;
}) {
  let insertedProfile: { id: string; email: string } | null = null;

  const client = {
    auth: {
      getUser: async () => ({ data: { user: options.user } }),
    },
    from: (table: string) => {
      expect(table).toBe('profiles');
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: options.profileExists ? { id: options.user?.id } : null,
            }),
          }),
        }),
        insert: async (row: { id: string; email: string }) => {
          insertedProfile = row;
          return { error: null };
        },
      };
    },
  } as unknown as SupabaseClient<Database>;

  return {
    client,
    insertedProfile: () => insertedProfile,
  };
}

describe('postAuthPath', () => {
  it('returns the requested path when no user is signed in', async () => {
    const supabase = makeSupabaseStub({ user: null, profileExists: false });

    await expect(postAuthPath(supabase.client, '/today')).resolves.toBe('/today');
    expect(supabase.insertedProfile()).toBeNull();
  });

  it('returns the requested path for users that already have a profile', async () => {
    const supabase = makeSupabaseStub({ user: USER, profileExists: true });

    await expect(postAuthPath(supabase.client, '/today')).resolves.toBe('/today');
    expect(supabase.insertedProfile()).toBeNull();
  });

  it('creates a profile shell and sends first-time users to onboarding', async () => {
    const supabase = makeSupabaseStub({ user: USER, profileExists: false });

    await expect(postAuthPath(supabase.client, '/today')).resolves.toBe('/onboarding');
    expect(supabase.insertedProfile()).toEqual({
      id: USER.id,
      email: USER.email,
    });
  });
});
