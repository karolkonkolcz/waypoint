'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftIcon } from 'lucide-react';
import Link from 'next/link';
import { trailRepo } from '@/lib/db/repositories/trail.repo';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

const PACE_PRESETS = [
  { label: 'Leisurely', kmh: 3, hint: 'Heavy pack or rough terrain' },
  { label: 'Moderate', kmh: 4, hint: 'Typical hiking pace' },
  { label: 'Fast', kmh: 5, hint: 'Light pack, experienced hiker' },
] as const;

type PaceKmh = (typeof PACE_PRESETS)[number]['kmh'];

export default function NewTrailPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pace, setPace] = useState<PaceKmh>(4);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const name = (fd.get('name') as string).trim();
    const description = (fd.get('description') as string).trim() || null;
    const start_date = (fd.get('start_date') as string) || null;

    try {
      const { data } = await createClient().auth.getUser();
      if (!data.user) { setError('Not signed in'); return; }

      const trail = await trailRepo.create({
        user_id: data.user.id,
        name,
        description,
        start_date,
        default_pace_kmh: pace,
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
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/"
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold">New Trail</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Name */}
        <Field label="Trail name" required>
          <input
            name="name"
            type="text"
            required
            autoFocus
            placeholder="e.g. Pacific Crest Trail"
            maxLength={200}
            className="input"
          />
        </Field>

        {/* Description */}
        <Field label="Description">
          <textarea
            name="description"
            rows={3}
            placeholder="A short description of your hike…"
            maxLength={1000}
            className="input resize-none"
          />
        </Field>

        {/* Start date */}
        <Field
          label="Start date"
          hint="Used for weather forecasts and per-stage ETA"
        >
          <input name="start_date" type="date" className="input" />
        </Field>

        {/* Pace */}
        <div className="space-y-2">
          <span className="text-sm font-medium">Default pace</span>
          <div className="grid grid-cols-3 gap-2">
            {PACE_PRESETS.map((opt) => (
              <button
                key={opt.kmh}
                type="button"
                onClick={() => setPace(opt.kmh)}
                className={cn(
                  'flex flex-col items-center gap-0.5 rounded-xl border px-3 py-3 text-center transition-colors',
                  pace === opt.kmh
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background hover:bg-muted',
                )}
              >
                <span className="text-sm font-semibold">{opt.label}</span>
                <span className={cn(
                  'text-xs tabular-nums',
                  pace === opt.kmh ? 'opacity-75' : 'text-muted-foreground',
                )}>
                  {opt.kmh} km/h
                </span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {PACE_PRESETS.find((p) => p.kmh === pace)?.hint}
          </p>
        </div>

        {/* Error */}
        {error && (
          <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-full bg-primary py-3.5 text-base font-semibold text-primary-foreground disabled:opacity-50"
        >
          {pending ? 'Creating…' : 'Create Trail'}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
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
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
