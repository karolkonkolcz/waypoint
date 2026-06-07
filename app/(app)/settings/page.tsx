'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { LogOutIcon, UserIcon, ChevronRightIcon, ShieldIcon } from 'lucide-react';

export default function SettingsPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadAdminStatus() {
      try {
        const { data } = await createClient().rpc('is_admin');
        if (!cancelled) setIsAdmin(Boolean(data));
      } catch {
        if (!cancelled) setIsAdmin(false);
      }
    }

    void loadAdminStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSignOut() {
    await createClient().auth.signOut();
    router.push('/login');
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-6">
      <h1 className="mb-6 text-2xl font-bold">Settings</h1>

      <section className="space-y-2">
        <Link
          href="/account"
          className="flex w-full items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-sm font-medium hover:bg-muted"
        >
          <UserIcon className="h-4 w-4" />
          Account
          <ChevronRightIcon className="ml-auto h-4 w-4 text-muted-foreground" />
        </Link>

        {isAdmin && (
          <Link
            href="/admin/welcome-photos"
            className="flex w-full items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-sm font-medium hover:bg-muted"
          >
            <ShieldIcon className="h-4 w-4" />
            Welcome photos
            <ChevronRightIcon className="ml-auto h-4 w-4 text-muted-foreground" />
          </Link>
        )}

        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-sm font-medium text-destructive hover:bg-destructive/5"
        >
          <LogOutIcon className="h-4 w-4" />
          Sign out
        </button>
      </section>
    </div>
  );
}
