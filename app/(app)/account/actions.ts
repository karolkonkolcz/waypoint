'use server';

import { createClient } from '@/lib/supabase/server';

export type SaveProfileResult = { ok: true } | { error: string };

export async function ensureSignedInProfile(): Promise<SaveProfileResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Nejsi přihlášený/á' };

  const { error } = await supabase
    .from('profiles')
    .upsert(
      { id: user.id, email: user.email ?? '' },
      { onConflict: 'id' },
    );

  if (error) return { error: error.message };
  return { ok: true };
}

/**
 * Upsert the signed-in user's profile name. The handle_new_user trigger
 * normally seeds the profiles row on signup (see 0012_security_hardening.sql),
 * but we upsert id + email defensively in case it doesn't exist yet.
 */
export async function saveDisplayName(name: string): Promise<SaveProfileResult> {
  const trimmed = name.trim();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Nejsi přihlášený/á' };

  const { error } = await supabase
    .from('profiles')
    .upsert(
      { id: user.id, email: user.email ?? '', display_name: trimmed || null },
      { onConflict: 'id' },
    );

  if (error) return { error: error.message };
  return { ok: true };
}
