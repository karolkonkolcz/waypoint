'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function loginWithMagicLink(formData: FormData) {
  const email = formData.get('email') as string;
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/auth/confirm`,
    },
  });

  if (error) {
    redirect('/login?error=Could+not+send+magic+link');
  }

  redirect('/login?message=Check+your+email+for+the+magic+link');
}
