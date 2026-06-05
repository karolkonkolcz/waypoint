import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

/**
 * First-time users have no display name (and possibly no profiles row at all,
 * since there is no auto-insert trigger). Send them through onboarding before
 * the requested destination.
 */
async function postAuthPath(
  supabase: SupabaseClient<Database>,
  next: string,
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return next;

  const { data } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();

  if (!data?.display_name) return '/onboarding';
  return next;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const code       = searchParams.get('code');        // PKCE flow
  const token_hash = searchParams.get('token_hash');  // OTP / email link flow
  const type       = searchParams.get('type') as EmailOtpType | null;
  const next       = searchParams.get('next') ?? '/';

  const supabase = await createClient();

  // PKCE flow — new Supabase default
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(await postAuthPath(supabase, next), origin));
    }
    console.error('[auth/confirm] PKCE exchange error:', error.message);
  }

  // OTP / magic-link token_hash flow
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(new URL(await postAuthPath(supabase, next), origin));
    }
    console.error('[auth/confirm] OTP verify error:', error.message);
  }

  return NextResponse.redirect(
    new URL('/login?error=Invalid+or+expired+link', origin),
  );
}
