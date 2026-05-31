'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { PlusIcon, MountainIcon, CalendarIcon } from 'lucide-react';
import { trailRepo } from '@/lib/db/repositories/trail.repo';
import { db } from '@/lib/db/dexie';
import { createClient } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { GpxImportZone } from '@/components/route/GpxImportZone';

export default function HomePage() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const trails = useLiveQuery(
    () => (userId ? trailRepo.findAll(userId) : Promise.resolve([])),
    [userId],
  );

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

  return (
    <div className="mx-auto max-w-lg px-4 pt-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Trails</h1>
          <p className="text-sm text-muted-foreground">Your hiking itineraries</p>
        </div>
        <Link
          href="/trails/new"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-95"
          aria-label="Create new trail"
        >
          <PlusIcon className="h-5 w-5" />
        </Link>
      </header>

      {/* Import a multi-day GPX trek as a trail with one stage per day */}
      {userId && <GpxImportZone userId={userId} />}

      {trails === undefined && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {trails?.length === 0 && (
        <EmptyState />
      )}

      {trails && trails.length > 0 && (
        <ul className="space-y-3">
          {trails.map((trail) => (
            <li key={trail.id}>
              <Link
                href={`/trails/${trail.id}`}
                className="flex items-start gap-4 rounded-2xl border bg-card p-4 shadow-sm transition-colors hover:bg-accent active:scale-[0.99]"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted">
                  <MountainIcon className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{trail.name}</p>
                  {trail.description && (
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {trail.description}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    {trail.start_date && (
                      <span className="flex items-center gap-1">
                        <CalendarIcon className="h-3 w-3" />
                        {trail.start_date}
                      </span>
                    )}
                    {stageCountByTrail && (
                      <span>
                        {stageCountByTrail[trail.id] ?? 0}{' '}
                        {stageCountByTrail[trail.id] === 1 ? 'stage' : 'stages'}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
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
