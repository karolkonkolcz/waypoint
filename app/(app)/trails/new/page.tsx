'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftIcon } from 'lucide-react';
import Link from 'next/link';
import { trailRepo } from '@/lib/db/repositories/trail.repo';
import { getLocalUserId } from '@/lib/auth/session';
import { cn } from '@/lib/utils';

const PACE_PRESETS = [
  { label: 'Klidné', kmh: 3, hint: 'Těžký batoh nebo náročný terén' },
  { label: 'Běžné', kmh: 4, hint: 'Typické turistické tempo' },
  { label: 'Rychlé', kmh: 5, hint: 'Lehký batoh, zkušený turista' },
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
      const userId = await getLocalUserId();
      if (!userId) { setError('Nejsi přihlášený/á'); return; }

      const trail = await trailRepo.create({
        user_id: userId,
        name,
        description,
        start_date,
        default_pace_kmh: pace,
        preferences: {},
      });

      router.push(`/trails/${trail.id}`);
    } catch {
      setError('Trasu se nepodařilo vytvořit. Zkus to prosím znovu.');
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
        <h1 className="text-xl font-bold">Nová trasa</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Name */}
        <Field label="Název trasy" required>
          <input
            name="name"
            type="text"
            required
            autoFocus
            placeholder="např. Pacific Crest Trail"
            maxLength={200}
            className="input"
          />
        </Field>

        {/* Description */}
        <Field label="Popis">
          <textarea
            name="description"
            rows={3}
            placeholder="Krátký popis tvé cesty…"
            maxLength={1000}
            className="input resize-none"
          />
        </Field>

        {/* Start date */}
        <Field
          label="Datum startu"
          hint="Použije se pro předpověď počasí a ETA jednotlivých etap"
        >
          <input name="start_date" type="date" className="input" />
        </Field>

        {/* Pace */}
        <div className="space-y-2">
          <span className="text-sm font-medium">Výchozí tempo</span>
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
          {pending ? 'Vytvářím…' : 'Vytvořit trasu'}
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
