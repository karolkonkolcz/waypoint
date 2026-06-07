'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getLocalSessionUser } from '@/lib/auth/session';
import { saveDisplayName } from './actions';

export default function AccountPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getLocalSessionUser().then(async (user) => {
      if (!user) {
        setLoaded(true);
        return;
      }
      setEmail(user.email ?? null);
      if (!navigator.onLine) {
        setLoaded(true);
        return;
      }
      const supabase = createClient();
      try {
        const { data } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', user.id)
          .maybeSingle();
        setName(data?.display_name ?? '');
      } catch {
        setError('Could not load profile details.');
        setStatus('error');
      } finally {
        setLoaded(true);
      }
    });
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setStatus('idle');
    setError(null);
    const result = await saveDisplayName(name);
    setPending(false);
    if ('error' in result) {
      setError(result.error);
      setStatus('error');
      return;
    }
    setStatus('saved');
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-6">
      <div className="mb-6 flex items-center gap-2">
        <Link
          href="/settings"
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold">Account</h1>
      </div>

      {!loaded ? (
        <div className="space-y-3">
          <div className="h-16 animate-pulse rounded-2xl bg-muted" />
          <div className="h-16 animate-pulse rounded-2xl bg-muted" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Email</label>
            <input value={email ?? ''} readOnly disabled className="input opacity-70" />
          </div>

          <div className="space-y-1">
            <label htmlFor="display_name" className="text-xs text-muted-foreground">
              Display name
            </label>
            <input
              id="display_name"
              name="display_name"
              autoComplete="name"
              placeholder="Your name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setStatus('idle');
              }}
              className="input"
            />
          </div>

          {status === 'saved' && (
            <p className="text-sm text-green-600 dark:text-green-400">Saved.</p>
          )}
          {status === 'error' && error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
        </form>
      )}
    </div>
  );
}
