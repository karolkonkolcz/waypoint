'use server';

import { createClient } from '@/lib/supabase/server';

export type SaveProfileResult = { ok: true } | { error: string };

export async function ensureSignedInProfile(): Promise<SaveProfileResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in' };

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
 * Upsert the signed-in user's profile name. There is no auto-insert trigger on
 * auth.users (see 0001_init.sql), so the profiles row may not exist yet — we
 * upsert id + email together with the chosen display name.
 */
export async function saveDisplayName(name: string): Promise<SaveProfileResult> {
  const trimmed = name.trim();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in' };

  const { error } = await supabase
    .from('profiles')
    .upsert(
      { id: user.id, email: user.email ?? '', display_name: trimmed || null },
      { onConflict: 'id' },
    );

  if (error) return { error: error.message };
  return { ok: true };
}
