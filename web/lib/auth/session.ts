import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

/**
 * Reads the persisted browser session without validating it over the network.
 * Use this for offline-first UI reads; server actions still validate auth.
 */
export async function getLocalSessionUser(): Promise<User | null> {
  try {
    const { data } = await createClient().auth.getSession();
    return data.session?.user ?? null;
  } catch {
    return null;
  }
}

export async function getLocalUserId(): Promise<string | null> {
  const user = await getLocalSessionUser();
  return user?.id ?? null;
}
