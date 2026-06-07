'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  PlusIcon,
  MountainIcon,
  CalendarIcon,
  ChevronRightIcon,
} from 'lucide-react';

import { trailRepo } from '@/lib/db/repositories/trail.repo';
import { stageRepo } from '@/lib/db/repositories/stage.repo';
import { db, type TrailRow } from '@/lib/db/dexie';
import { getLocalUserId } from '@/lib/auth/session';
import { resolveActiveTrail } from '@/lib/domain/activeTrail';
import { stageDate } from '@/lib/domain/stageDate';
import type { DifficultyClass } from '@/lib/domain/difficulty';
import { cn } from '@/lib/utils';

import { GpxImportZone } from '@/components/route/GpxImportZone';
import { WaypointLockup } from '@/components/brand/Waypoint';
import { SyncedChip } from '@/components/sync/SyncedChip';
import { ActiveTrekHero } from '@/components/dashboard/ActiveTrekHero';
import { Chip, SectionHeader } from '@/components/ui/primitives';

/** Local calendar date as YYYY-MM-DD (matches stageDate comparisons). */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export default function HomePage() {
  const today = useMemo(localToday, []);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    getLocalUserId().then(setUserId);
  }, []);

  const trails = useLiveQuery(
    () => (userId ? trailRepo.findAll(userId) : Promise.resolve([])),
    [userId],
  );

  // Stage counts per trail — back both the card count and the active-trail window.
  const stageCountByTrail = useLiveQuery(async () => {
    if (!trails?.length) return {};
    const counts: Record<string, number> = {};
    for (const t of trails) {
      counts[t.id] = await db.stages
        .where('trail_id')
        .equals(t.id)
        .filter((s) => s.deleted_at === null)
        .count();
    }
    return counts;
  }, [trails]);

  // "offline" = the trek's geometry is in Dexie (≥1 route), so the day works
  // without a connection.
  const offlineCount = useLiveQuery(async () => {
    if (!trails?.length) return 0;
    let n = 0;
    for (const t of trails) {
      const has = await db.routes.where('trail_id').equals(t.id).count();
      if (has > 0) n += 1;
    }
    return n;
  }, [trails]);

  const activeTrail = useMemo(() => {
    if (!trails || !stageCountByTrail) return null;
    return resolveActiveTrail(trails, stageCountByTrail, today);
  }, [trails, stageCountByTrail, today]);

  // Today's stage on the active trail — drives the hero's day counter + difficulty.
  const activeStages = useLiveQuery(
    () => (activeTrail ? stageRepo.findByTrail(activeTrail.id) : Promise.resolve(undefined)),
    [activeTrail?.id],
  );
  const heroMeta = useMemo(() => {
    if (!activeTrail || !activeStages) {
      return { totalDays: 0, dayNumber: null as number | null, difficulty: null as DifficultyClass | null };
    }
    const todayStage = activeStages.find(
      (s) => stageDate(s, activeTrail.start_date) === today,
    );
    return {
      totalDays: activeStages.length,
      dayNumber: todayStage ? todayStage.order_index + 1 : null,
      difficulty: (todayStage?.difficulty_class as DifficultyClass | null) ?? null,
    };
  }, [activeTrail, activeStages, today]);

  // The hero already features the active trail — keep the list to the rest.
  const otherTrails = useMemo(
    () => (trails ?? []).filter((t) => t.id !== activeTrail?.id),
    [trails, activeTrail?.id],
  );

  return (
    <div className="mx-auto max-w-lg px-4 pt-6">
      <div className="mb-5 flex items-center justify-between">
        <WaypointLockup />
        <SyncedChip />
      </div>

      {/* Import a multi-day GPX trek as a trail with one stage per day */}
      {userId && <GpxImportZone userId={userId} />}

      {trails === undefined && (
        <div className="space-y-4">
          <div className="h-[164px] animate-pulse rounded-2xl bg-muted" />
          <div className="h-24 animate-pulse rounded-2xl bg-muted" />
        </div>
      )}

      {trails?.length === 0 && <EmptyState />}

      {trails && trails.length > 0 && (
        <>
          {activeTrail && (
            <div className="mb-6">
              <ActiveTrekHero
                trail={activeTrail}
                dayNumber={heroMeta.dayNumber}
                totalDays={heroMeta.totalDays}
                difficultyClass={heroMeta.difficulty}
                trailHref={`/trails/${activeTrail.id}`}
                todayHref="/today"
              />
            </div>
          )}

          <SectionHeader
            className="mb-3"
            title="My Trails"
            subtitle={
              <>
                {trails.length} {trails.length === 1 ? 'itinerary' : 'itineraries'}
                {offlineCount ? ` · ${offlineCount} offline` : ''}
              </>
            }
            action={
              <Link
                href="/trails/new"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-95"
                aria-label="Create new trail"
              >
                <PlusIcon className="h-5 w-5" />
              </Link>
            }
          />

          {otherTrails.length > 0 ? (
            <ul className="space-y-3">
              {otherTrails.map((trail) => (
                <li key={trail.id}>
                  <TrailCard trail={trail} stages={stageCountByTrail?.[trail.id] ?? 0} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              This is your only trek so far. Tap + to add another.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function TrailCard({ trail, stages }: { trail: TrailRow; stages: number }) {
  return (
    <Link
      href={`/trails/${trail.id}`}
      className="flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm transition-colors hover:bg-accent active:scale-[0.99]"
    >
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
        {trail.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={trail.cover_image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <MountainIcon className="h-6 w-6 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold leading-tight">{trail.name}</p>
        {trail.description && (
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {trail.description}
          </p>
        )}
        <div className="mt-1.5 flex items-center gap-2">
          {trail.start_date && (
            <Chip tone="neutral" icon={<CalendarIcon className="h-3 w-3" />}>
              {trail.start_date}
            </Chip>
          )}
          <span className="text-xs text-muted-foreground">
            <span className="font-mono font-semibold tabular-nums">{stages}</span>{' '}
            {stages === 1 ? 'stage' : 'stages'}
          </span>
        </div>
      </div>
      <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-border px-6 py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <MountainIcon className="h-8 w-8 text-muted-foreground" />
      </div>
      <div>
        <p className="font-semibold">No trails yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Create your first trail to start planning your hike.
        </p>
      </div>
      <Link
        href="/trails/new"
        className={cn(
          'inline-flex h-10 items-center rounded-full px-5 text-sm font-semibold',
          'bg-primary text-primary-foreground hover:bg-primary/90',
        )}
      >
        Create trail
      </Link>
    </div>
  );
}
