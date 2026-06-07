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
  MapIcon,
  PencilIcon,
  Trash2Icon,
  ArrowRightLeftIcon,
  FootprintsIcon,
  ImagePlusIcon,
  Loader2Icon,
  XIcon,
} from 'lucide-react';
import { trailRepo } from '@/lib/db/repositories/trail.repo';
import { stageRepo } from '@/lib/db/repositories/stage.repo';
import { uploadTrailCover } from '@/lib/storage/covers';
import { DifficultyBadge } from '@/components/difficulty/DifficultyBadge';
import { AlertDialog } from '@/components/ui/alert-dialog';
import type { DifficultyClass } from '@/lib/domain/difficulty';
import { naismithHours } from '@/lib/domain/eta';
import { sortMilestones } from '@/components/stage/StageTimeline';
import { stageDate, formatStageDate } from '@/lib/domain/stageDate';
import { cn } from '@/lib/utils';
import { useRef, useState } from 'react';
import type { TrailRow, Milestone, StageType } from '@/lib/db/dexie';

/** One-line summary of a transit day's timeline for the stage list. */
function transitSummary(timeline: Milestone[]): string {
  if (timeline.length === 0) return 'Transit day · no milestones';
  const timed = sortMilestones(timeline).filter((m) => m.time !== null);
  const count = timeline.length;
  const noun = count === 1 ? 'milestone' : 'milestones';
  if (timed.length === 0) return `Transit day · ${count} ${noun}`;
  const span =
    timed.length > 1 ? `${timed[0].time}–${timed[timed.length - 1].time}` : timed[0].time;
  return `${span} · ${count} ${noun}`;
}

const PACE_PRESETS = [
  { label: 'Leisurely', kmh: 3, hint: 'Heavy pack or rough terrain' },
  { label: 'Moderate', kmh: 4, hint: 'Typical hiking pace' },
  { label: 'Fast', kmh: 5, hint: 'Light pack, experienced hiker' },
] as const;

type PaceKmh = (typeof PACE_PRESETS)[number]['kmh'];

export default function TrailPage() {
  const { trailId } = useParams<{ trailId: string }>();

  const trail = useLiveQuery(() => trailRepo.findById(trailId), [trailId]);
  const stages = useLiveQuery(() => stageRepo.findByTrail(trailId), [trailId]);

  const totalDistanceKm = stages?.reduce((sum, s) => sum + s.distance_km, 0) ?? 0;
  const totalAscentM = stages?.reduce((sum, s) => sum + s.ascent_m, 0) ?? 0;
  const totalHours = stages
    ? naismithHours(totalDistanceKm, totalAscentM, trail?.default_pace_kmh ?? 4)
    : 0;

  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const router = useRouter();

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

  async function handleDelete() {
    await trailRepo.remove(trailId);
    router.push('/');
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-4 pb-8">
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <Link href="/" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted">
          <ArrowLeftIcon className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold">{trail.name}</h1>
        </div>
        <button
          onClick={() => setEditing((v) => !v)}
          aria-label="Edit trail"
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted"
        >
          <PencilIcon className="h-4 w-4" />
        </button>
        <Link
          href={`/trails/${trailId}/map`}
          className="flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium hover:bg-muted"
        >
          <MapIcon className="h-4 w-4" />
          Map
        </Link>
      </div>

      {/* Edit trail form */}
      {editing && (
        <EditTrailForm
          trail={trail}
          onDone={() => setEditing(false)}
        />
      )}

      {/* Description */}
      {!editing && trail.description && (
        <p className="mb-5 text-sm text-muted-foreground leading-relaxed">{trail.description}</p>
      )}

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
        <InsertStageButton trailId={trailId} userId={trail.user_id} position={stages.length} label="Add stage" />
      </div>

      {stages.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border px-6 py-8 text-center text-sm text-muted-foreground">
          No stages yet. Add your first hiking day.
        </div>
      ) : (
        <div className="space-y-0">
          {/* Insert point before first stage */}
          <InsertPoint trailId={trailId} userId={trail.user_id} position={0} />

          {stages.map((stage, idx) => {
            const cd = stageDate(stage, trail.start_date);
            const summary =
              stage.stage_type === 'transit'
                ? transitSummary(stage.timeline)
                : `${stage.distance_km} km · ↑${stage.ascent_m} m · ↓${stage.descent_m} m`;
            return (
              <div key={stage.id}>
                <Link
                  href={`/trails/${trailId}/stages/${stage.id}`}
                  className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-sm hover:bg-accent active:scale-[0.99]"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                    {stage.stage_type === 'transit' ? (
                      <ArrowRightLeftIcon className="h-4 w-4" />
                    ) : (
                      // Number only trek days — transit days don't count.
                      stages.slice(0, idx + 1).filter((s) => s.stage_type !== 'transit').length
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{stage.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {cd ? `${formatStageDate(cd)} · ${summary}` : summary}
                    </p>
                  </div>
                  {stage.difficulty_class && (
                    <DifficultyBadge klass={stage.difficulty_class as DifficultyClass} size="sm" />
                  )}
                  <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>

                {/* Insert point after each stage */}
                <InsertPoint trailId={trailId} userId={trail.user_id} position={idx + 1} />
              </div>
            );
          })}
        </div>
      )}

      {/* Delete trail */}
      <div className="mt-8 border-t pt-6">
        <button
          onClick={() => setDeleteOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-destructive/30 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/5"
        >
          <Trash2Icon className="h-4 w-4" />
          Delete trail
        </button>
      </div>

      <AlertDialog
        open={deleteOpen}
        title="Delete trail?"
        description={`"${trail.name}" and all its stages will be permanently deleted.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}

function InsertPoint({ trailId, userId, position }: { trailId: string; userId: string; position: number }) {
  return (
    <InsertStageButton
      trailId={trailId}
      userId={userId}
      position={position}
      label={null}
    />
  );
}

function InsertStageButton({
  trailId,
  userId,
  position,
  label,
}: {
  trailId: string;
  userId: string;
  position: number;
  label: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);

  async function handleInsert(stageType: StageType) {
    setPending(true);
    try {
      const input =
        stageType === 'transit'
          ? {
              trail_id: trailId,
              user_id: userId,
              title: 'Travel day',
              stage_type: 'transit' as const,
              notes: null,
            }
          : {
              trail_id: trailId,
              user_id: userId,
              title: `Day ${position + 1}`,
              distance_km: 20,
              ascent_m: 500,
              descent_m: 500,
              start_distance_km: null,
              end_distance_km: null,
              notes: null,
            };
      const stage = await stageRepo.insertAt(input, position);
      router.push(`/trails/${trailId}/stages/${stage.id}`);
    } finally {
      setPending(false);
    }
  }

  const choices = (
    <div className="flex items-center gap-2">
      <button
        onClick={() => handleInsert('trek')}
        disabled={pending}
        className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
      >
        <FootprintsIcon className="h-3.5 w-3.5" />
        Trek day
      </button>
      <button
        onClick={() => handleInsert('transit')}
        disabled={pending}
        className="flex items-center gap-1.5 rounded-full border border-primary px-3 py-1.5 text-xs font-semibold text-primary disabled:opacity-50"
      >
        <ArrowRightLeftIcon className="h-3.5 w-3.5" />
        Transit day
      </button>
      <button
        onClick={() => setOpen(false)}
        disabled={pending}
        aria-label="Cancel"
        className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        Cancel
      </button>
    </div>
  );

  // Labelled trigger (top of the Stages section).
  if (label !== null) {
    return open ? (
      choices
    ) : (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
      >
        <PlusIcon className="h-3.5 w-3.5" />
        {label}
      </button>
    );
  }

  // Inline insert point between stages.
  return (
    <div className="flex items-center justify-center gap-2 py-0.5">
      <div className="h-px flex-1 bg-border" />
      {open ? (
        choices
      ) : (
        <button
          onClick={() => setOpen(true)}
          aria-label={`Insert stage at position ${position + 1}`}
          className="flex h-6 w-6 items-center justify-center rounded-full border bg-background text-muted-foreground hover:border-primary hover:text-primary"
        >
          <PlusIcon className="h-3 w-3" />
        </button>
      )}
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function EditTrailForm({
  trail,
  onDone,
}: {
  trail: TrailRow;
  onDone: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [pace, setPace] = useState<PaceKmh>(
    (PACE_PRESETS.find((p) => p.kmh === trail.default_pace_kmh)?.kmh ?? 4) as PaceKmh,
  );
  const [coverUrl, setCoverUrl] = useState<string | null>(trail.cover_image_url);
  const [uploading, setUploading] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleCoverPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setCoverError(null);
    setUploading(true);
    try {
      const url = await uploadTrailCover(file, trail.user_id, trail.id);
      setCoverUrl(url);
    } catch (err) {
      setCoverError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    await trailRepo.update(trail.id, {
      name: (fd.get('name') as string).trim(),
      description: (fd.get('description') as string).trim() || null,
      start_date: (fd.get('start_date') as string) || null,
      default_pace_kmh: pace,
      cover_image_url: coverUrl,
    });
    setPending(false);
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 space-y-4 rounded-2xl border bg-card p-4">
      <h2 className="font-semibold">Edit Trail</h2>

      {/* Cover photo */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Cover photo</label>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleCoverPick}
          className="hidden"
        />
        {coverUrl ? (
          <div className="relative overflow-hidden rounded-xl border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverUrl} alt="Trail cover" className="h-32 w-full object-cover" />
            <div className="absolute right-2 top-2 flex gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="rounded-full bg-card/85 px-2.5 py-1 text-xs font-semibold backdrop-blur disabled:opacity-50"
              >
                Change
              </button>
              <button
                type="button"
                onClick={() => setCoverUrl(null)}
                aria-label="Remove cover"
                className="flex h-6 w-6 items-center justify-center rounded-full bg-card/85 backdrop-blur"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex h-24 w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed text-sm text-muted-foreground hover:border-primary hover:text-foreground disabled:opacity-50"
          >
            {uploading ? (
              <Loader2Icon className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <ImagePlusIcon className="h-5 w-5" />
                Add cover photo
              </>
            )}
          </button>
        )}
        {coverError && <p className="text-xs text-destructive">{coverError}</p>}
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Trail name</label>
        <input
          name="name"
          defaultValue={trail.name}
          required
          placeholder="Trail name"
          className="input"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Description</label>
        <textarea
          name="description"
          rows={3}
          defaultValue={trail.description ?? ''}
          placeholder="A short description of your hike…"
          maxLength={1000}
          className="input resize-none"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Start date</label>
        <input
          name="start_date"
          type="date"
          defaultValue={trail.start_date ?? ''}
          className="input"
        />
      </div>

      <div className="space-y-2">
        <span className="text-xs text-muted-foreground">Default pace</span>
        <div className="grid grid-cols-3 gap-2">
          {PACE_PRESETS.map((opt) => (
            <button
              key={opt.kmh}
              type="button"
              onClick={() => setPace(opt.kmh)}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded-xl border px-2 py-2 text-center transition-colors',
                pace === opt.kmh
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background hover:bg-muted',
              )}
            >
              <span className="text-xs font-semibold">{opt.label}</span>
              <span className={cn('text-xs tabular-nums', pace === opt.kmh ? 'opacity-75' : 'text-muted-foreground')}>
                {opt.kmh} km/h
              </span>
            </button>
          ))}
        </div>
      </div>

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
