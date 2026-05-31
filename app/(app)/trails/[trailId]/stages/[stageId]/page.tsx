'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeftIcon, ClockIcon, TrendingUpIcon, MoveHorizontalIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { stageRepo } from '@/lib/db/repositories/stage.repo';
import { trailRepo } from '@/lib/db/repositories/trail.repo';
import { StageHeader } from '@/components/stage/StageHeader';
import { StageStats } from '@/components/stage/StageStats';
import { DifficultyBadge } from '@/components/difficulty/DifficultyBadge';
import type { DifficultyClass } from '@/lib/domain/difficulty';
import { naismithHours } from '@/lib/domain/eta';
import { useState } from 'react';
import { db } from '@/lib/db/dexie';

export default function StagePage() {
  const { trailId, stageId } = useParams<{ trailId: string; stageId: string }>();

  const trail = useLiveQuery(() => trailRepo.findById(trailId), [trailId]);
  const stage = useLiveQuery(() => stageRepo.findById(stageId), [stageId]);
  const allStages = useLiveQuery(() => stageRepo.findByTrail(trailId), [trailId]);

  const [editing, setEditing] = useState(false);

  if (trail === undefined || stage === undefined || allStages === undefined) {
    return <LoadingState />;
  }

  if (!stage || !trail) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Stage not found.</p>
        <Link href={`/trails/${trailId}`} className="text-sm text-primary hover:underline">
          Back to trail
        </Link>
      </div>
    );
  }

  const paceKmh = trail.default_pace_kmh;
  const totalHours = naismithHours(stage.distance_km, stage.ascent_m, paceKmh);
  const stageIndex = allStages.findIndex((s) => s.id === stageId);
  const prevStage = stageIndex > 0 ? allStages[stageIndex - 1] : null;
  const nextStage = stageIndex < allStages.length - 1 ? allStages[stageIndex + 1] : null;

  const stats = [
    { label: 'Distance', value: `${stage.distance_km} km`, icon: '↔' },
    { label: 'Ascent', value: `${stage.ascent_m} m`, icon: '↑' },
    { label: 'Descent', value: `${stage.descent_m} m`, icon: '↓' },
  ];

  return (
    <div className="mx-auto max-w-lg px-4 pt-4">
      {/* Back nav */}
      <div className="mb-5 flex items-center gap-2">
        <Link
          href={`/trails/${trailId}`}
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </Link>
        <span className="truncate text-sm text-muted-foreground">{trail.name}</span>
      </div>

      {/* Stage header */}
      <div className="mb-6">
        <StageHeader
          title={stage.title}
          dayNumber={stageIndex + 1}
          difficultyClass={stage.difficulty_class as DifficultyClass | null}
          difficultyScore={stage.difficulty_score}
        />
      </div>

      {/* ETA highlight */}
      <div className="mb-6 flex items-center gap-3 rounded-2xl bg-primary px-5 py-4 text-primary-foreground">
        <ClockIcon className="h-6 w-6 shrink-0 opacity-80" />
        <div>
          <p className="text-xs font-medium opacity-70">Estimated hiking time</p>
          <p className="text-2xl font-bold tabular-nums">{formatHours(totalHours)}</p>
          {trail.start_date && (
            <p className="text-xs opacity-70">
              at {paceKmh} km/h pace
            </p>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <StageStats stats={stats} className="mb-6" />

      {/* Difficulty detail */}
      {stage.difficulty_class && (
        <section className="mb-6 rounded-2xl border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Difficulty
          </h2>
          <div className="flex items-center justify-between">
            <DifficultyBadge
              klass={stage.difficulty_class as DifficultyClass}
              score={stage.difficulty_score ?? undefined}
            />
            <DifficultyBar score={stage.difficulty_score ?? 0} />
          </div>
        </section>
      )}

      {/* Notes */}
      {stage.notes && (
        <section className="mb-6 rounded-2xl border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Notes
          </h2>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{stage.notes}</p>
        </section>
      )}

      {/* Quick edit */}
      {editing ? (
        <EditStageForm
          stage={stage}
          onDone={() => setEditing(false)}
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="mb-6 w-full rounded-2xl border py-3 text-sm font-medium hover:bg-muted"
        >
          Edit stage
        </button>
      )}

      {/* Prev / Next navigation */}
      <div className="flex items-center justify-between gap-3 pb-2">
        {prevStage ? (
          <Link
            href={`/trails/${trailId}/stages/${prevStage.id}`}
            className="flex flex-1 items-center gap-2 rounded-2xl border px-4 py-3 text-sm hover:bg-muted"
          >
            <ChevronLeftIcon className="h-4 w-4 shrink-0" />
            <span className="truncate">{prevStage.title}</span>
          </Link>
        ) : <div className="flex-1" />}

        {nextStage ? (
          <Link
            href={`/trails/${trailId}/stages/${nextStage.id}`}
            className="flex flex-1 items-center justify-end gap-2 rounded-2xl border px-4 py-3 text-sm hover:bg-muted"
          >
            <span className="truncate">{nextStage.title}</span>
            <ChevronRightIcon className="h-4 w-4 shrink-0" />
          </Link>
        ) : <div className="flex-1" />}
      </div>
    </div>
  );
}

function DifficultyBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{score}/100</span>
    </div>
  );
}

function EditStageForm({
  stage,
  onDone,
}: {
  stage: NonNullable<Awaited<ReturnType<typeof stageRepo.findById>>>;
  onDone: () => void;
}) {
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    await stageRepo.update(stage.id, {
      title: (fd.get('title') as string).trim(),
      distance_km: parseFloat(fd.get('distance_km') as string),
      ascent_m: parseInt(fd.get('ascent_m') as string, 10),
      descent_m: parseInt(fd.get('descent_m') as string, 10),
      notes: (fd.get('notes') as string).trim() || null,
    });
    setPending(false);
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 space-y-4 rounded-2xl border bg-card p-4">
      <h2 className="font-semibold">Edit Stage</h2>

      <input
        name="title"
        defaultValue={stage.title}
        required
        placeholder="Stage title"
        className="input"
      />
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Distance (km)</label>
          <input name="distance_km" type="number" step="0.1" defaultValue={stage.distance_km} className="input" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Ascent (m)</label>
          <input name="ascent_m" type="number" defaultValue={stage.ascent_m} className="input" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Descent (m)</label>
          <input name="descent_m" type="number" defaultValue={stage.descent_m} className="input" />
        </div>
      </div>
      <textarea
        name="notes"
        rows={3}
        defaultValue={stage.notes ?? ''}
        placeholder="Notes…"
        className="input resize-none"
      />
      <div className="flex gap-2">
        <button type="button" onClick={onDone} className="flex-1 rounded-full border py-2.5 text-sm font-medium hover:bg-muted">
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

function LoadingState() {
  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pt-4">
      <div className="h-8 w-32 animate-pulse rounded-lg bg-muted" />
      <div className="h-20 animate-pulse rounded-2xl bg-muted" />
      <div className="h-24 animate-pulse rounded-2xl bg-muted" />
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)}
      </div>
    </div>
  );
}

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  const hours = Math.floor(h);
  const mins = Math.round((h - hours) * 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
