'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeftIcon, ClockIcon, TrendingUpIcon, MoveHorizontalIcon, ChevronLeftIcon, ChevronRightIcon, Trash2Icon, MapPinIcon } from 'lucide-react';
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
import { stageDate } from '@/lib/domain/stageDate';
import { StageHeader } from '@/components/stage/StageHeader';
import { StageStats } from '@/components/stage/StageStats';
import { StageTimeline } from '@/components/stage/StageTimeline';
import { TransitEditForm } from '@/components/stage/TransitEditForm';
import { DifficultyBadge } from '@/components/difficulty/DifficultyBadge';
import type { DifficultyClass } from '@/lib/domain/difficulty';
import { naismithHours } from '@/lib/domain/eta';
import { formatHours } from '@/lib/format/hours';
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

  // Where to sample weather: a trek day uses its route midpoint; a transit day
  // uses its optional location anchor (it has no route). null = can't sample.
  const weatherPoint = useMemo<{ lat: number; lon: number } | null>(() => {
    if (stage?.stage_type === 'transit') {
      if (stage.location_lat != null && stage.location_lon != null) {
        return { lat: stage.location_lat, lon: stage.location_lon };
      }
      return null;
    }
    if (route) {
      const midKm = route.total_distance_km / 2;
      const [lon, lat] = pointAtDistance(route.geojson, midKm);
      return { lat, lon };
    }
    return null;
  }, [stage?.stage_type, stage?.location_lat, stage?.location_lon, route?.id, route?.total_distance_km]);

  useEffect(() => {
    if (!stage || !trail || !weatherPoint) return;
    if (cachedWeather !== undefined && weatherRepo.isFresh(cachedWeather)) return;

    // Explicit per-stage date wins; otherwise derive from the trail schedule.
    const targetDate = stageDate(stage, trail.start_date);
    if (!targetDate) return;

    // Open-Meteo only forecasts 16 days ahead
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const daysAhead = (new Date(targetDate + 'T00:00:00').getTime() - todayStart.getTime()) / 86_400_000;
    if (daysAhead < 0 || daysAhead > 16) return;

    const { lat, lon } = weatherPoint;

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
    stage?.date,
    stage?.order_index,
    weatherPoint,
    cachedWeather?.fetched_at,
  ]);

  // MeteoAlarm warnings for the country the stage runs through (country-level).
  useEffect(() => {
    if (!trail || !weatherPoint) return;
    if (cachedAlerts && alertsRepo.isFresh(cachedAlerts)) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    const { lat, lon } = weatherPoint;

    fetch(`/api/alerts?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) return alertsRepo.save(trailId, data.country, data.alerts);
      })
      .catch(() => {});
  }, [trailId, trail?.id, weatherPoint, cachedAlerts?.fetched_at]);

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
        <p className="text-muted-foreground">Etapa nebyla nalezena.</p>
        <Link href={`/trails/${trailId}`} className="text-sm text-primary hover:underline">
          Zpět na trasu
        </Link>
      </div>
    );
  }

  const isTransit = stage.stage_type === 'transit';
  const paceKmh = trail.default_pace_kmh;
  const totalHours = naismithHours(stage.distance_km, stage.ascent_m, paceKmh);

  // Each stage owns its route, whose profile already starts at 0 km.
  const stageProfile = route ? route.elevation_profile : null;
  const stageIndex = allStages.findIndex((s) => s.id === stageId);
  const prevStage = stageIndex > 0 ? allStages[stageIndex - 1] : null;
  const nextStage = stageIndex < allStages.length - 1 ? allStages[stageIndex + 1] : null;
  // Day number counts trek days only — transit days are excluded.
  const trekDayNumber = allStages
    .slice(0, stageIndex + 1)
    .filter((s) => s.stage_type !== 'transit').length;
  const stageCalendarDate = stageDate(stage, trail.start_date);

  const stats = [
    { label: 'Vzdálenost', value: `${stage.distance_km} km`, icon: '↔' },
    { label: 'Stoupání', value: `${stage.ascent_m} m`, icon: '↑' },
    { label: 'Klesání', value: `${stage.descent_m} m`, icon: '↓' },
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
          dayNumber={trekDayNumber}
          date={stageCalendarDate}
          difficultyClass={stage.difficulty_class as DifficultyClass | null}
          difficultyScore={stage.difficulty_score}
          stageType={stage.stage_type}
        />
      </div>

      {/* Transit day — editable day timeline is the focus */}
      {isTransit && (
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Časová osa
          </h2>
          <StageTimeline milestones={stage.timeline} />
          {stage.location_name && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPinIcon className="h-3.5 w-3.5" />
              Počasí pro {stage.location_name}
            </p>
          )}
        </section>
      )}

      {/* Trek day — ETA, stats, elevation, map */}
      {!isTransit && (
        <>
          {/* ETA highlight */}
          <div className="mb-6 flex items-center gap-3 rounded-2xl bg-primary px-5 py-4 text-primary-foreground">
            <ClockIcon className="h-6 w-6 shrink-0 opacity-80" />
            <div>
              <p className="text-xs font-medium opacity-70">Odhad času chůze</p>
              <p className="text-2xl font-bold tabular-nums">{formatHours(totalHours)}</p>
              {trail.start_date && (
                <p className="text-xs opacity-70">
                  při tempu {paceKmh} km/h
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
                Výškový profil
              </h2>
              <ElevationChart profile={stageProfile} />
            </section>
          )}

          {/* Route map */}
          {stageMapRoutes.length > 0 && (
            <section className="mb-6 overflow-hidden rounded-2xl border bg-card">
              <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Mapa
                </h2>
                <Link
                  href={`/trails/${trailId}/map?stage=${stageId}`}
                  className="text-xs text-primary hover:underline"
                >
                  Otevřít mapu
                </Link>
              </div>
              <MapView routes={stageMapRoutes} className="h-56 w-full" />
            </section>
          )}
        </>
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
            Obtížnost
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
            Poznámky
          </h2>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{stage.notes}</p>
        </section>
      )}

      {/* Quick edit */}
      {editing ? (
        isTransit ? (
          <TransitEditForm stage={stage} onDone={() => setEditing(false)} />
        ) : (
          <EditStageForm stage={stage} onDone={() => setEditing(false)} />
        )
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="mb-6 w-full rounded-2xl border py-3 text-sm font-medium hover:bg-muted"
        >
          Upravit {isTransit ? 'den' : 'etapu'}
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
          Smazat etapu
        </button>
      </div>

      <AlertDialog
        open={deleteOpen}
        title="Smazat etapu?"
        description={
          isTransit
            ? `"${stage.title}" a její časová osa budou trvale smazány.`
            : `"${stage.title}" a její trasa budou trvale smazány.`
        }
        confirmLabel="Smazat"
        cancelLabel="Zrušit"
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
      date: (fd.get('date') as string) || null,
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
      <h2 className="font-semibold">Upravit etapu</h2>

      <input
        name="title"
        defaultValue={stage.title}
        required
        placeholder="Název etapy"
        className="input"
      />
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Datum</label>
        <input name="date" type="date" defaultValue={stage.date ?? ''} className="input" />
        <p className="text-xs text-muted-foreground">Nech prázdné, pokud se má datum řídit startem trasy.</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Vzdálenost (km)</label>
          <input name="distance_km" type="number" step="0.1" defaultValue={stage.distance_km} className="input" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Stoupání (m)</label>
          <input name="ascent_m" type="number" defaultValue={stage.ascent_m} className="input" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Klesání (m)</label>
          <input name="descent_m" type="number" defaultValue={stage.descent_m} className="input" />
        </div>
      </div>
      <textarea
        name="notes"
        rows={3}
        defaultValue={stage.notes ?? ''}
        placeholder="Poznámky…"
        className="input resize-none"
      />
      <div className="flex gap-2">
        <button type="button" onClick={onDone} className="flex-1 rounded-full border py-2.5 text-sm font-medium hover:bg-muted">
          Zrušit
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {pending ? 'Ukládám…' : 'Uložit'}
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
