'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { sync, registerSyncTriggers } from '@/lib/db/sync';

// Module-level: shared across all re-mounts, persists for the page lifetime.
let triggersRegistered = false;
let currentUserId: string | null = null;

export function SyncProvider() {
  useEffect(() => {
    const supabase = createClient();

    // Keep currentUserId fresh for event-driven triggers.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      currentUserId = session?.user?.id ?? null;
    });

    // Seed userId and kick off the first sync eagerly.
    supabase.auth.getUser().then(({ data: { user } }) => {
      currentUserId = user?.id ?? null;
      if (currentUserId) sync(currentUserId).catch(console.error);
    });

    // Register window/document event listeners exactly once.
    if (!triggersRegistered) {
      registerSyncTriggers(() => currentUserId);
      triggersRegistered = true;
    }

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return null;
}
