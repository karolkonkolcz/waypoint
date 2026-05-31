'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeftIcon,
  PlusIcon,
  ChevronRightIcon,
  CalendarIcon,
  GaugeIcon,
} from 'lucide-react';
import { trailRepo } from '@/lib/db/repositories/trail.repo';
import { stageRepo } from '@/lib/db/repositories/stage.repo';
import { DifficultyBadge } from '@/components/difficulty/DifficultyBadge';
import type { DifficultyClass } from '@/lib/domain/difficulty';
import { naismithHours } from '@/lib/domain/eta';
import { useState } from 'react';
import { stageRepo as sr } from '@/lib/db/repositories/stage.repo';
import { createClient } from '@/lib/supabase/client';

export default function TrailPage() {
  const { trailId } = useParams<{ trailId: string }>();

  const trail = useLiveQuery(() => trailRepo.findById(trailId), [trailId]);
  const stages = useLiveQuery(() => stageRepo.findByTrail(trailId), [trailId]);

  const totalDistanceKm = stages?.reduce((sum, s) => sum + s.distance_km, 0) ?? 0;
  const totalAscentM = stages?.reduce((sum, s) => sum + s.ascent_m, 0) ?? 0;
  const totalHours = stages
    ? naismithHours(totalDistanceKm, totalAscentM, trail?.default_pace_kmh ?? 4)
    : 0;

  if (trail === undefined || stages === undefined) {
    return <LoadingState />;
  }

  if (trail === null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-muted-foreground">Trail not found.</p>
        <Link href="/" className="text-sm text-primary hover:underline">Back to trails</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-4">
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <Link href="/" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted">
          <ArrowLeftIcon className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold">{trail.name}</h1>
        </div>
      </div>

      {/* Trail stats */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatCard label="Distance" value={`${totalDistanceKm.toFixed(1)} km`} />
        <StatCard label="Ascent" value={`${totalAscentM} m`} />
        <StatCard label="Est. time" value={formatHours(totalHours)} />
      </div>

      {trail.start_date && (
        <div className="mb-5 flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarIcon className="h-4 w-4" />
          <span>Starts {trail.start_date}</span>
          <span className="mx-1">·</span>
          <GaugeIcon className="h-4 w-4" />
          <span>{trail.default_pace_kmh} km/h</span>
        </div>
      )}

      {/* Stages */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Stages</h2>
        <AddStageButton trailId={trailId} userId={trail.user_id} stageCount={stages.length} />
      </div>

      {stages.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border px-6 py-8 text-center text-sm text-muted-foreground">
          No stages yet. Add your first hiking day.
        </div>
      ) : (
        <ul className="space-y-2">
          {stages.map((stage, idx) => (
            <li key={stage.id}>
              <Link
                href={`/trails/${trailId}/stages/${stage.id}`}
                className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-sm hover:bg-accent active:scale-[0.99]"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                  {idx + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{stage.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {stage.distance_km} km · ↑{stage.ascent_m} m · ↓{stage.descent_m} m
                  </p>
                </div>
                {stage.difficulty_class && (
                  <DifficultyBadge klass={stage.difficulty_class as DifficultyClass} size="sm" />
                )}
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddStageButton({ trailId, userId, stageCount }: { trailId: string; userId: string; stageCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleAdd() {
    setPending(true);
    try {
      const stage = await sr.create({
        trail_id: trailId,
        user_id: userId,
        title: `Day ${stageCount + 1}`,
        order_index: stageCount,
        distance_km: 20,
        ascent_m: 500,
        descent_m: 500,
        start_distance_km: null,
        end_distance_km: null,
        notes: null,
      });
      router.push(`/trails/${trailId}/stages/${stage.id}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={handleAdd}
      disabled={pending}
      className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
    >
      <PlusIcon className="h-3.5 w-3.5" />
      Add stage
    </button>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-xl bg-muted/60 px-2 py-3 text-center">
      <span className="text-lg font-bold tabular-nums leading-tight">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pt-4">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)}
      </div>
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />)}
      </div>
    </div>
  );
}

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  const hours = Math.floor(h);
  const mins = Math.round((h - hours) * 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
