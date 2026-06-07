import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

/**
 * First-time users have no profiles row yet, since there is no auto-insert
 * trigger on auth.users. Create the durable profile shell immediately, then
 * send them through onboarding before the requested destination.
 */
export async function postAuthPath(
  supabase: SupabaseClient<Database>,
  next: string,
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return next;

  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (!data) {
    await supabase
      .from('profiles')
      .insert({ id: user.id, email: user.email ?? '' });
    return '/onboarding';
  }

  return next;
}
