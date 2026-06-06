import { trailRepo } from '@/lib/db/repositories/trail.repo';
import { stageRepo } from '@/lib/db/repositories/stage.repo';
import { routeRepo } from '@/lib/db/repositories/route.repo';
import { weatherRepo } from '@/lib/db/repositories/weather.repo';
import { db } from '@/lib/db/dexie';
import { resolveActiveTrail } from '@/lib/domain/activeTrail';
import { stageDate } from '@/lib/domain/stageDate';
import { positionAt } from '@/lib/domain/eta';
import { haversineKm } from '@/lib/domain/geo';
import type { WeatherSnapshot } from './forecast';
import type { MeteogramData } from './types';

export interface OfflineFallbackResult {
  data: MeteogramData;
  trailName: string;
  stageTitle: string;
  fetchedAt: string; // ISO
}

/** Day-start hour from trail preferences (default 08:00) — matches Today page. */
function getStartHour(preferences: Record<string, unknown>): number {
  const v = preferences?.start_hour;
  return typeof v === 'number' && v >= 0 && v <= 23 ? v : 8;
}

/** Local calendar date (YYYY-MM-DD) for comparing against derived stage dates. */
function localToday(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

/** Unix seconds for a given hour-of-day on a YYYY-MM-DD date, in local time. */
function hourToUnix(date: string, hour: number): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.floor(new Date(y, m - 1, d, hour, 0, 0).getTime() / 1000);
}

/**
 * Turn the trail weather cache's compact WeatherSnapshot into the limited
 * meteogram series the offline path can render. The cache only carries
 * temperature / precipitation / wind (no pressure, cloud layers or wind
 * direction), so this fills exactly those three series and flags `limited`.
 * Prefers the route-aware hourly `moving` series; falls back to the three
 * fixed display hours (8/12/16) when a snapshot has no moving data.
 */
export function snapshotToMeteogram(snapshot: WeatherSnapshot): MeteogramData {
  const source =
    snapshot.moving && snapshot.moving.length > 0
      ? snapshot.moving.map((m) => ({
          hour: m.hour,
          tempC: m.tempC,
          precipMm: m.precipMm,
          windKmh: m.windKmh,
        }))
      : snapshot.entries.map((e) => ({
          hour: e.hour,
          tempC: e.tempC,
          precipMm: e.precipMm,
          windKmh: e.windKmh,
        }));

  return {
    time: source.map((s) => hourToUnix(snapshot.date, s.hour)),
    temperature: source.map((s) => s.tempC),
    rain: source.map((s) => s.precipMm),
    windSpeed: source.map((s) => s.windKmh),
    limited: true,
  };
}

/**
 * Derive the best available forecast for the user's estimated current position
 * from the existing (trail-scoped) weather cache — no network, no new table.
 *
 * Resolves the active trail, finds the stage scheduled for today (the one whose
 * route the hiker is currently on), projects the position with positionAt(now),
 * and returns that stage's cached forecast as a limited meteogram. Returns null
 * when there's no active trail, no scheduled stage today, or no cached weather.
 */
export async function getOfflineFallback(
  userId: string,
  now: Date = new Date(),
): Promise<OfflineFallbackResult | null> {
  const trails = await trailRepo.findAll(userId);
  if (trails.length === 0) return null;

  const stageCountByTrail: Record<string, number> = {};
  for (const t of trails) {
    stageCountByTrail[t.id] = await db.stages
      .where('trail_id')
      .equals(t.id)
      .filter((s) => s.deleted_at === null)
      .count();
  }

  const today = localToday(now);
  const activeTrail = resolveActiveTrail(trails, stageCountByTrail, today);
  if (!activeTrail) return null;

  const stages = await stageRepo.findByTrail(activeTrail.id);
  const todayStage = stages.find((s) => stageDate(s, activeTrail.start_date) === today);
  if (!todayStage) return null;

  // Project the estimated current position from today's stage route + ETA. On a
  // trek day with a route this is positionAt(now); on a transit / route-less day
  // it falls back to the stage's location anchor (or null when none).
  const todayRoute = await routeRepo.findByStage(todayStage.id);
  let position: [number, number] | null = null; // [lon, lat]
  if (todayRoute) {
    const startHour = getStartHour(activeTrail.preferences);
    const [y, m, d] = today.split('-').map(Number);
    const startTime = new Date(y, m - 1, d, startHour, 0, 0);
    position = positionAt(
      startTime,
      now,
      todayRoute.geojson,
      todayRoute.total_ascent_m,
      activeTrail.default_pace_kmh,
    );
  } else if (todayStage.location_lon != null && todayStage.location_lat != null) {
    position = [todayStage.location_lon, todayStage.location_lat];
  }

  // Among the trail's cached forecasts, pick the one whose stored midpoint is
  // nearest the estimated position (haversine). With one row per stage this
  // normally resolves to today's stage, but near a stage boundary it correctly
  // prefers the neighbouring day's forecast. Falls back to today's stage row.
  let chosen = await weatherRepo.findByStage(todayStage.id);
  if (position) {
    const [lon, lat] = position;
    let best = chosen ? haversineKm(position, [chosen.longitude, chosen.latitude]) : Infinity;
    for (const s of stages) {
      const row = s.id === todayStage.id ? chosen : await weatherRepo.findByStage(s.id);
      if (!row) continue;
      const dist = haversineKm([lon, lat], [row.longitude, row.latitude]);
      if (dist < best) {
        best = dist;
        chosen = row;
      }
    }
  }
  if (!chosen) return null;

  const snapshot = chosen.forecast_json as WeatherSnapshot;
  const chosenStage = stages.find((s) => s.id === chosen!.stage_id) ?? todayStage;

  return {
    data: snapshotToMeteogram(snapshot),
    trailName: activeTrail.name,
    stageTitle: chosenStage.title,
    fetchedAt: chosen.fetched_at,
  };
}
