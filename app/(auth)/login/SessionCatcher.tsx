'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Catches an auth session delivered in the URL hash (implicit flow, e.g. the
 * default Supabase magic-link template) or query code (PKCE). The browser
 * client's `detectSessionInUrl` processes the URL on init and writes the
 * session to cookies; once a session exists we do a full reload to `/` so the
 * proxy re-reads the cookies and lets the user through.
 */
export function SessionCatcher() {
  useEffect(() => {
    const supabase = createClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) window.location.replace('/');
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.replace('/');
    });

    return () => subscription.unsubscribe();
  }, []);

  return null;
}
