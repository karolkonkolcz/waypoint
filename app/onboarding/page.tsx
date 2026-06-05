'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveDisplayName } from '@/app/(app)/account/actions';

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await saveDisplayName(name);
    if ('error' in result) {
      setError(result.error);
      setPending(false);
      return;
    }
    router.replace('/');
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6 bg-background">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Welcome to Waypoint</h1>
          <p className="text-sm text-muted-foreground">What should we call you?</p>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            name="display_name"
            autoFocus
            autoComplete="name"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
          />

          <button
            type="submit"
            disabled={pending || name.trim().length === 0}
            className="w-full rounded-full bg-primary px-4 py-3 text-base font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Continue'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => router.replace('/')}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
        >
          Skip for now
        </button>
      </div>
    </main>
  );
}
