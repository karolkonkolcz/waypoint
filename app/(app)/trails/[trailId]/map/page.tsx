'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useLiveQuery } from 'dexie-react-hooks';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeftIcon } from 'lucide-react';
import { trailRepo } from '@/lib/db/repositories/trail.repo';
import { stageRepo } from '@/lib/db/repositories/stage.repo';
import { routeRepo } from '@/lib/db/repositories/route.repo';
import type { DifficultyClass } from '@/lib/domain/difficulty';
import type { MapRoute } from '@/components/map/MapView';
import { DIFFICULTY_LINE_COLOR, DEFAULT_LINE_COLOR } from '@/components/map/colors';

// MapLibre is heavy and browser-only — keep it out of the main bundle (§11).
const MapView = dynamic(() => import('@/components/map/MapView').then((m) => m.MapView), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-muted" />,
});

export default function TrailMapPage() {
  const { trailId } = useParams<{ trailId: string }>();

  const trail = useLiveQuery(() => trailRepo.findById(trailId), [trailId]);
  const stages = useLiveQuery(() => stageRepo.findByTrail(trailId), [trailId]);
  const routes = useLiveQuery(() => routeRepo.findAllByTrail(trailId), [trailId]);

  const mapRoutes: MapRoute[] = useMemo(() => {
    if (!stages || !routes) return [];
    const byStage = new Map(
      routes.filter((r) => r.stage_id).map((r) => [r.stage_id as string, r]),
    );
    return stages
      .map((s): MapRoute | null => {
        const route = byStage.get(s.id);
        if (!route) return null;
        const color = s.difficulty_class
          ? DIFFICULTY_LINE_COLOR[s.difficulty_class as DifficultyClass]
          : DEFAULT_LINE_COLOR;
        return { id: route.id, geojson: route.geojson, color };
      })
      .filter((x): x is MapRoute => x !== null);
  }, [stages, routes]);

  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <Link
          href={`/trails/${trailId}`}
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </Link>
        <span className="truncate text-sm font-medium">{trail?.name ?? 'Map'}</span>
      </header>

      <div className="relative flex-1">
        {mapRoutes.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            No route geometry to show yet.
          </div>
        ) : (
          <MapView routes={mapRoutes} className="h-full w-full" />
        )}
      </div>
    </div>
  );
}
