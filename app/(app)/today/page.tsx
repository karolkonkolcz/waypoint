'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { MapPinIcon, MapIcon } from 'lucide-react';

import { trailRepo } from '@/lib/db/repositories/trail.repo';
import { stageRepo } from '@/lib/db/repositories/stage.repo';
import { routeRepo } from '@/lib/db/repositories/route.repo';
import { weatherRepo } from '@/lib/db/repositories/weather.repo';
import { alertsRepo } from '@/lib/db/repositories/alerts.repo';
import { todoRepo } from '@/lib/db/repositories/todo.repo';
import { db } from '@/lib/db/dexie';
import { createClient } from '@/lib/supabase/client';

import { fetchOpenMeteo, fetchOpenMeteoMulti } from '@/lib/weather/openmeteo';
import { buildSnapshot, buildRouteSnapshot, type WeatherSnapshot } from '@/lib/weather/forecast';
import { pointAtDistance, samplePoints } from '@/lib/domain/geo';
import { stageDate } from '@/lib/domain/stageDate';
import { naismithHours } from '@/lib/domain/eta';
import { formatHours } from '@/lib/format/hours';
import { getGreeting } from '@/lib/domain/greeting';
import { buildDaySummary } from '@/lib/domain/daySummary';
import { resolveActiveTrail } from '@/lib/domain/activeTrail';

import type { MapRoute } from '@/components/map/MapView';
import { DIFFICULTY_LINE_COLOR, DEFAULT_LINE_COLOR } from '@/components/map/colors';
import type { DifficultyClass } from '@/lib/domain/difficulty';
import { StageHeader } from '@/components/stage/StageHeader';
import { WeatherAlertBadge } from '@/components/weather/WeatherAlertBadge';
import { MovingForecast } from '@/components/dashboard/MovingForecast';
import { TodoList } from '@/components/dashboard/TodoList';

// MapLibre is browser-only and heavy — code-split exactly as the stage screen.
const MapView = dynamic(() => import('@/components/map/MapView').then((m) => m.MapView), {
  ssr: false,
  loading: () => <div className="h-44 w-full animate-pulse bg-muted" />,
});

/** Local calendar date as YYYY-MM-DD (matches how stageDate is compared). */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/** The calendar day after `date` (YYYY-MM-DD), for night weather at the destination. */
function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Day start hour for ETA projection — trail preference, default 08:00. */
function getStartHour(preferences: Record<string, unknown>): number {
  const v = preferences?.start_hour;
  return typeof v === 'number' && v >= 0 && v <= 23 ? v : 8;
}

export default function TodayPage() {
  const today = useMemo(localToday, []);

  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState('');

  // Auth + display name (network, online-only — fall back to the email prefix).
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      const emailName = user.email?.split('@')[0] ?? '';
      setName(emailName);
      const { data } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .maybeSingle();
      if (data?.display_name) setName(data.display_name);
    });
  }, []);

  const trails = useLiveQuery(
    () => (userId ? trailRepo.findAll(userId) : Promise.resolve([])),
    [userId],
  );

  // Stage counts per trail back the active-trail window (one stage = one day).
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

  const activeTrail = useMemo(() => {
    if (!trails || !stageCountByTrail) return null;
    return resolveActiveTrail(trails, stageCountByTrail, today);
  }, [trails, stageCountByTrail, today]);

  const stages = useLiveQuery(
    () => (activeTrail ? stageRepo.findByTrail(activeTrail.id) : Promise.resolve(undefined)),
    [activeTrail?.id],
  );

  const todayStage = useMemo(() => {
    if (!stages || !activeTrail) return undefined;
    return stages.find((s) => stageDate(s, activeTrail.start_date) === today);
  }, [stages, activeTrail?.start_date, today]);

  const route = useLiveQuery(
    () => (todayStage ? routeRepo.findByStage(todayStage.id) : Promise.resolve(undefined)),
    [todayStage?.id],
  );
  const cachedWeather = useLiveQuery(
    () => (todayStage ? weatherRepo.findByStage(todayStage.id) : Promise.resolve(undefined)),
    [todayStage?.id],
  );
  const cachedAlerts = useLiveQuery(
    () => (activeTrail ? alertsRepo.findByTrail(activeTrail.id) : Promise.resolve(undefined)),
    [activeTrail?.id],
  );
  const todos = useLiveQuery(
    () => (activeTrail ? todoRepo.findByTrail(activeTrail.id) : Promise.resolve([])),
    [activeTrail?.id],
  );

  const [fetchingWeather, setFetchingWeather] = useState(false);

  // Where to sample weather: a trek day uses its route midpoint; a transit day
  // uses its optional location anchor. null = can't sample.
  const weatherPoint = useMemo<{ lat: number; lon: number } | null>(() => {
    if (!todayStage) return null;
    if (todayStage.stage_type === 'transit') {
      if (todayStage.location_lat != null && todayStage.location_lon != null) {
        return { lat: todayStage.location_lat, lon: todayStage.location_lon };
      }
      return null;
    }
    if (route) {
      const [lon, lat] = pointAtDistance(route.geojson, route.total_distance_km / 2);
      return { lat, lon };
    }
    return null;
  }, [todayStage?.stage_type, todayStage?.location_lat, todayStage?.location_lon, route?.id, route?.total_distance_km]);

  // Refresh weather when the cache is stale. Trek days sample several points
  // along the route (one batched request) and build a route-aware "moving"
  // forecast; transit days / route-less days sample the single anchor point.
  useEffect(() => {
    if (!todayStage || !activeTrail) return;
    if (cachedWeather !== undefined && weatherRepo.isFresh(cachedWeather)) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    const targetDate = stageDate(todayStage, activeTrail.start_date);
    if (!targetDate) return;

    const isTrekWithRoute = todayStage.stage_type !== 'transit' && !!route;

    if (isTrekWithRoute && route) {
      const points = samplePoints(route.geojson, 6).map(([lon, lat]) => ({ lat, lon }));
      const mid = points[Math.floor((points.length - 1) / 2)];
      setFetchingWeather(true);
      // Pull the next day's early hours too — the snapshot's "end" phase shows
      // evening/night weather at the destination.
      fetchOpenMeteoMulti(points, targetDate, nextDay(targetDate))
        .then((results) =>
          weatherRepo.save({
            trail_id: activeTrail.id,
            stage_id: todayStage.id,
            user_id: activeTrail.user_id,
            lat: mid.lat,
            lon: mid.lon,
            date: targetDate,
            snapshot: buildRouteSnapshot({
              results,
              route: route.geojson,
              elevationProfile: route.elevation_profile,
              paceKmh: activeTrail.default_pace_kmh,
              startHour: getStartHour(activeTrail.preferences),
              date: targetDate,
            }),
          }),
        )
        .catch(console.error)
        .finally(() => setFetchingWeather(false));
      return;
    }

    if (!weatherPoint) return;
    const { lat, lon } = weatherPoint;
    setFetchingWeather(true);
    fetchOpenMeteo(lat, lon, targetDate)
      .then((result) =>
        weatherRepo.save({
          trail_id: activeTrail.id,
          stage_id: todayStage.id,
          user_id: activeTrail.user_id,
          lat,
          lon,
          date: targetDate,
          snapshot: buildSnapshot(result, targetDate),
        }),
      )
      .catch(console.error)
      .finally(() => setFetchingWeather(false));
  }, [
    todayStage?.id,
    activeTrail?.id,
    activeTrail?.start_date,
    activeTrail?.default_pace_kmh,
    route?.id,
    weatherPoint,
    cachedWeather?.fetched_at,
  ]);

  const mapRoutes: MapRoute[] = useMemo(() => {
    if (!route) return [];
    const color = todayStage?.difficulty_class
      ? DIFFICULTY_LINE_COLOR[todayStage.difficulty_class as DifficultyClass]
      : DEFAULT_LINE_COLOR;
    return [{ id: route.id, geojson: route.geojson, color }];
  }, [route, todayStage?.difficulty_class]);

  // ---- Loading / empty states -------------------------------------------------
  if (trails === undefined || (trails.length > 0 && stages === undefined)) {
    return <LoadingState />;
  }

  if (trails.length === 0 || !activeTrail) {
    return <EmptyToday greeting={getGreeting(new Date(), name)} />;
  }

  if (!todayStage) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-6">
        <h1 className="mb-4 text-2xl font-bold">{getGreeting(new Date(), name)}</h1>
        <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center">
          <p className="font-semibold">No hike planned for today</p>
          <p className="text-sm text-muted-foreground">
            Nothing scheduled on {activeTrail.name} for today.
          </p>
          <Link href={`/trails/${activeTrail.id}`} className="text-sm font-semibold text-primary hover:underline">
            View {activeTrail.name}
          </Link>
        </div>
      </div>
    );
  }

  const snapshot = cachedWeather?.forecast_json as WeatherSnapshot | undefined;
  const isTransit = todayStage.stage_type === 'transit';
  const eta = formatHours(naismithHours(todayStage.distance_km, todayStage.ascent_m, activeTrail.default_pace_kmh));
  const summary = buildDaySummary({ stage: todayStage, snapshot });

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 pt-4">
      {/* Block 1 — Map hero (trek) or header (transit) */}
      {isTransit ? (
        <div className="rounded-2xl border bg-card p-4">
          <p className="mb-2 text-xl font-bold">{getGreeting(new Date(), name)}</p>
          <StageHeader
            title={todayStage.title}
            dayNumber={0}
            date={stageDate(todayStage, activeTrail.start_date)}
            difficultyClass={null}
            difficultyScore={null}
            stageType="transit"
          />
          {todayStage.location_name && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPinIcon className="h-3.5 w-3.5" />
              Weather for {todayStage.location_name}
            </p>
          )}
        </div>
      ) : (
        <div>
          <Link
            href={`/trails/${activeTrail.id}/map?stage=${todayStage.id}`}
            className="relative block h-44 overflow-hidden rounded-2xl border bg-card"
          >
            {mapRoutes.length > 0 ? (
              <MapView routes={mapRoutes} interactive={false} attribution={false} className="h-44 w-full" />
            ) : (
              <div className="h-44 w-full bg-muted" />
            )}

            {/* Legibility scrims so overlays read over any terrain. */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/30 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/45 to-transparent" />

            {/* Greeting overlay */}
            <span className="absolute left-2 top-2 rounded-lg bg-card/85 px-2.5 py-1 text-xl font-bold backdrop-blur">
              {getGreeting(new Date(), name)}
            </span>

            {/* Tap affordance — the hero opens today's stage on the map. */}
            <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-card/85 px-2 py-1 text-[11px] font-medium backdrop-blur">
              <MapIcon className="h-3 w-3" />
              Open map
            </span>

            {/* Stat chips */}
            <div className="absolute inset-x-2 bottom-2 flex gap-2">
              <StatChip label="distance" value={`${todayStage.distance_km} km`} />
              <StatChip label="ascent" value={`+${todayStage.ascent_m} m`} />
              <StatChip label="ETA" value={eta} />
            </div>
          </Link>

          {/* Static credit — the decorative hero drops MapLibre's interactive control. */}
          {mapRoutes.length > 0 && (
            <p className="mt-1 px-1 text-right text-[10px] text-muted-foreground">
              © MapTiler © OpenStreetMap
            </p>
          )}
        </div>
      )}

      {/* Block 2 — Moving forecast */}
      {snapshot ? (
        <MovingForecast snapshot={snapshot} loading={fetchingWeather} />
      ) : fetchingWeather ? (
        <div className="h-24 animate-pulse rounded-2xl bg-muted" />
      ) : null}

      {/* Weather warnings */}
      {cachedAlerts && cachedAlerts.alerts.length > 0 && (
        <WeatherAlertBadge alerts={cachedAlerts.alerts} stale={!alertsRepo.isFresh(cachedAlerts)} />
      )}

      {/* Block 3 — One-line summary */}
      <p className="rounded-2xl border bg-card p-3 text-base leading-snug">{summary}</p>

      {/* Block 4 — To-do list */}
      <TodoList
        trailId={activeTrail.id}
        userId={activeTrail.user_id}
        todos={todos ?? []}
        stageId={todayStage.id}
      />
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 rounded-xl border bg-card/90 py-1.5 text-center backdrop-blur">
      <p className="font-mono text-sm font-semibold tabular-nums leading-tight">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function EmptyToday({ greeting }: { greeting: string }) {
  return (
    <div className="mx-auto max-w-lg px-4 pt-6">
      <h1 className="mb-4 text-2xl font-bold">{greeting}</h1>
      <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center">
        <p className="font-semibold">No hike planned for today</p>
        <p className="text-sm text-muted-foreground">Create a trail to start planning your hike.</p>
        <Link href="/" className="text-sm font-semibold text-primary hover:underline">
          Go to Trails
        </Link>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 pt-4">
      <div className="h-44 animate-pulse rounded-2xl bg-muted" />
      <div className="h-24 animate-pulse rounded-2xl bg-muted" />
      <div className="h-12 animate-pulse rounded-2xl bg-muted" />
      <div className="h-28 animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}
