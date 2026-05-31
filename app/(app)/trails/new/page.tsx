'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftIcon } from 'lucide-react';
import Link from 'next/link';
import { trailRepo } from '@/lib/db/repositories/trail.repo';
import { createClient } from '@/lib/supabase/client';

export default function NewTrailPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const name = (fd.get('name') as string).trim();
    const description = (fd.get('description') as string).trim() || null;
    const start_date = (fd.get('start_date') as string) || null;
    const default_pace_kmh = parseFloat(fd.get('pace') as string) || 4.0;

    try {
      const { data } = await createClient().auth.getUser();
      if (!data.user) { setError('Not signed in'); return; }

      const trail = await trailRepo.create({
        user_id: data.user.id,
        name,
        description,
        start_date,
        default_pace_kmh,
        preferences: {},
      });

      router.push(`/trails/${trail.id}`);
    } catch {
      setError('Could not create trail. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-4">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/"
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold">New Trail</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="Trail name" required>
          <input
            name="name"
            type="text"
            required
            placeholder="e.g. Pacific Crest Trail"
            className="input"
          />
        </Field>

        <Field label="Description">
          <textarea
            name="description"
            rows={3}
            placeholder="A short description of your hike…"
            className="input resize-none"
          />
        </Field>

        <Field label="Start date">
          <input name="start_date" type="date" className="input" />
        </Field>

        <Field label="Default pace (km/h)">
          <input
            name="pace"
            type="number"
            min="1"
            max="15"
            step="0.5"
            defaultValue="4.0"
            className="input"
          />
        </Field>

        {error && (
          <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-full bg-primary py-3 text-base font-semibold text-primary-foreground disabled:opacity-50"
        >
          {pending ? 'Creating…' : 'Create Trail'}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      {children}
    </div>
  );
}
