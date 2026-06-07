import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '@/lib/supabase/types';

export type WelcomePhoto = Pick<
  Tables<'welcome_photos'>,
  'id' | 'public_url' | 'alt_text' | 'location_label' | 'sort_order'
>;

export async function getActiveWelcomePhoto(
  supabase: SupabaseClient<Database>,
): Promise<WelcomePhoto | null> {
  const { data, error } = await supabase
    .from('welcome_photos')
    .select('id, public_url, alt_text, location_label, sort_order')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data;
}
