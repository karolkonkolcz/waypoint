import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

/**
 * The handle_new_user trigger on auth.users creates the profiles row on signup
 * (see 0012_security_hardening.sql), but we also upsert here so the flow stays
 * resilient if that trigger is ever absent. First-time users (no row found) are
 * routed through onboarding before the requested destination.
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
