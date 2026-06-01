'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeftIcon, ClockIcon, TrendingUpIcon, MoveHorizontalIcon, ChevronLeftIcon, ChevronRightIcon, Trash2Icon } from 'lucide-react';
import { stageRepo } from '@/lib/db/repositories/stage.repo';
import { trailRepo } from '@/lib/db/repositories/trail.repo';
import { routeRepo } from '@/lib/db/repositories/route.repo';
import { weatherRepo } from '@/lib/db/repositories/weather.repo';
import { ElevationChart } from '@/components/route/ElevationChart';
import { WeatherCard } from '@/components/stage/WeatherCard';
import { fetchOpenMeteo } from '@/lib/weather/openmeteo';
import { buildSnapshot } from '@/lib/weather/forecast';
import type { WeatherSnapshot } from '@/lib/weather/forecast';
import { pointAtDistance } from '@/lib/domain/geo';
import { StageHeader } from '@/components/stage/StageHeader';
import { StageStats } from '@/components/stage/StageStats';
import { DifficultyBadge } from '@/components/difficulty/DifficultyBadge';
import type { DifficultyClass } from '@/lib/domain/difficulty';
import { naismithHours } from '@/lib/domain/eta';
import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/db/dexie';
import dynamic from 'next/dynamic';
import type { MapRoute } from '@/components/map/MapView';
import { DIFFICULTY_LINE_COLOR, DEFAULT_LINE_COLOR } from '@/components/map/colors';
import { alertsRepo } from '@/lib/db/repositories/alerts.repo';
import { WeatherAlertBadge } from '@/components/weather/WeatherAlertBadge';
import { AlertDialog } from '@/components/ui/alert-dialog';

// MapLibre is browser-only and heavy — code-split it (§11).
const MapView = dynamic(() => import('@/components/map/MapView').then((m) => m.MapView), {
  ssr: false,
  loading: () => <div className="h-56 w-full animate-pulse bg-muted" />,
});

export default function StagePage() {
  const { trailId, stageId } = useParams<{ trailId: string; stageId: string }>();

  const trail = useLiveQuery(() => trailRepo.findById(trailId), [trailId]);
  const stage = useLiveQuery(() => stageRepo.findById(stageId), [stageId]);
  const allStages = useLiveQuery(() => stageRepo.findByTrail(trailId), [trailId]);
  const route = useLiveQuery(() => routeRepo.findByStage(stageId), [stageId]);
  const cachedWeather = useLiveQuery(() => weatherRepo.findByStage(stageId), [stageId]);
  const cachedAlerts = useLiveQuery(() => alertsRepo.findByTrail(trailId), [trailId]);

  const [fetchingWeather, setFetchingWeather] = useState(false);

  useEffect(() => {
    if (!stage || !trail || !route || !allStages) return;
    if (!trail.start_date) return;
    if (cachedWeather !== undefined && weatherRepo.isFresh(cachedWeather)) return;

    const idx = allStages.findIndex((s) => s.id === stageId);
    if (idx < 0) return;

    const d = new Date(trail.start_date + 'T00:00:00');
    d.setDate(d.getDate() + idx);
    const targetDate = d.toISOString().split('T')[0];

    // Open-Meteo only forecasts 16 days ahead
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const daysAhead = (new Date(targetDate + 'T00:00:00').getTime() - todayStart.getTime()) / 86_400_000;
    if (daysAhead < 0 || daysAhead > 16) return;

    // Weather is sampled at the midpoint of this stage's own route geometry.
    const midKm = route.total_distance_km / 2;
    const [lon, lat] = pointAtDistance(route.geojson, midKm);

    setFetchingWeather(true);
    fetchOpenMeteo(lat, lon, targetDate)
      .then((result) => {
        const snapshot = buildSnapshot(result, targetDate);
        return weatherRepo.save({
          trail_id: trail.id,
          stage_id: stage.id,
          user_id: trail.user_id,
          lat,
          lon,
          date: targetDate,
          snapshot,
        });
      })
      .catch(console.error)
      .finally(() => setFetchingWeather(false));
  }, [
    stageId,
    trail?.id,
    trail?.start_date,
    route?.id,
    route?.total_distance_km,
    allStages,
    cachedWeather?.fetched_at,
  ]);

  // MeteoAlarm warnings for the country the stage runs through (country-level).
  useEffect(() => {
    if (!trail || !route) return;
    if (cachedAlerts && alertsRepo.isFresh(cachedAlerts)) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    const midKm = route.total_distance_km / 2;
    const [lon, lat] = pointAtDistance(route.geojson, midKm);

    fetch(`/api/alerts?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) return alertsRepo.save(trailId, data.country, data.alerts);
      })
      .catch(() => {});
  }, [trailId, trail?.id, route?.id, route?.total_distance_km, cachedAlerts?.fetched_at]);

  const stageMapRoutes: MapRoute[] = useMemo(() => {
    if (!route) return [];
    const color = stage?.difficulty_class
      ? DIFFICULTY_LINE_COLOR[stage.difficulty_class as DifficultyClass]
      : DEFAULT_LINE_COLOR;
    return [{ id: route.id, geojson: route.geojson, color }];
  }, [route, stage?.difficulty_class]);

  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const router = useRouter();

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

  // Each stage owns its route, whose profile already starts at 0 km.
  const stageProfile = route ? route.elevation_profile : null;
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

      {/* Elevation profile — visible once route + stage boundaries are linked */}
      {stageProfile && (
        <section className="mb-6 rounded-2xl border bg-card px-4 pt-3 pb-2">
          <h2 className="mb-1 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Elevation
          </h2>
          <ElevationChart profile={stageProfile} />
        </section>
      )}

      {/* Route map */}
      {stageMapRoutes.length > 0 && (
        <section className="mb-6 overflow-hidden rounded-2xl border bg-card">
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Map
            </h2>
            <Link
              href={`/trails/${trailId}/map`}
              className="text-xs text-primary hover:underline"
            >
              Full map
            </Link>
          </div>
          <MapView routes={stageMapRoutes} className="h-56 w-full" />
        </section>
      )}

      {/* Weather warnings (MeteoAlarm) */}
      {cachedAlerts && cachedAlerts.alerts.length > 0 && (
        <div className="mb-6">
          <WeatherAlertBadge
            alerts={cachedAlerts.alerts}
            stale={!alertsRepo.isFresh(cachedAlerts)}
          />
        </div>
      )}

      {/* Weather forecast */}
      {cachedWeather ? (
        <div className="mb-6">
          <WeatherCard
            snapshot={cachedWeather.forecast_json as WeatherSnapshot}
            loading={fetchingWeather}
          />
        </div>
      ) : fetchingWeather ? (
        <div className="mb-6 h-32 animate-pulse rounded-2xl bg-muted" />
      ) : null}

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
      <div className="mb-6 flex items-center justify-between gap-3">
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

      {/* Delete stage */}
      <div className="border-t pt-6 pb-2">
        <button
          onClick={() => setDeleteOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-destructive/30 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/5"
        >
          <Trash2Icon className="h-4 w-4" />
          Delete stage
        </button>
      </div>

      <AlertDialog
        open={deleteOpen}
        title="Delete stage?"
        description={`"${stage.title}" and its route will be permanently deleted.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={async () => {
          await stageRepo.remove(stageId);
          router.push(`/trails/${trailId}`);
        }}
        onCancel={() => setDeleteOpen(false)}
      />
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
