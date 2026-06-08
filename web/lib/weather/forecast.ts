import type { OpenMeteoResult } from './openmeteo';
import type { GeoJSONLineString } from '@/lib/domain/geo';
import { pointAtDistance, totalDistance } from '@/lib/domain/geo';
import {
  cumulativeTimeProfile,
  totalEtaHours,
  kmAtElapsed,
  type ElevationPoint,
} from '@/lib/domain/eta';

export type WeatherCondition =
  | 'clear'
  | 'partly-cloudy'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'storm';

export interface WeatherEntry {
  hour: number;       // 8, 12, or 16
  tempC: number;
  precipMm: number;
  windKmh: number;
  condition: WeatherCondition;
}

/**
 * Which part of the day a moving entry belongs to:
 * - `start`: before departure — weather AT the start point.
 * - `moving`: en route — weather AT the projected position that hour.
 * - `end`:  after arrival (incl. evening/night) — weather AT the destination.
 */
export type ForecastPhase = 'start' | 'moving' | 'end';

/** One hour of the day, weather taken AT the position you'll have reached. */
export interface MovingEntry {
  hour: number;      // 0–23 for the stage day; 24–30 = 00:00–06:00 the next day
  km: number;        // projected distance along the route at this hour
  lat: number;
  lon: number;
  tempC: number;
  precipMm: number;
  windKmh: number;
  condition: WeatherCondition;
  phase: ForecastPhase;
}

export interface WeatherSnapshot {
  date: string;              // YYYY-MM-DD
  latitude: number;
  longitude: number;
  entries: WeatherEntry[];   // one per DISPLAY_HOURS (route midpoint — WeatherCard)
  precipTotalMm: number;     // sum over HIKE_START–HIKE_END hours
  windMaxKmh: number;        // max over HIKE_START–HIKE_END hours
  // Route-aware "moving" forecast: weather at the projected position per hour.
  // Spans the whole day in three phases (start → moving → end); absent on
  // transit days / routes without an elevation profile.
  moving?: MovingEntry[];
  startHour?: number;             // departure hour (start of the moving phase)
  arrivalHour?: number;           // ETA hour (end of the moving phase)
  rainStartsHour?: number | null; // first hour with precip along the route
  rainStartsKm?: number | null;
}

const DISPLAY_HOURS = [8, 12, 16] as const;
const HIKE_START = 6;
const HIKE_END = 18;
// Full-day forecast window for the route-aware snapshot.
const DAY_START = 6;   // earliest hour shown — pre-departure, at the start point
const NIGHT_END = 30;  // latest hour shown — 06:00 the next day (night at the destination)

function wmoCondition(code: number): WeatherCondition {
  if (code <= 1) return 'clear';
  if (code === 2) return 'partly-cloudy';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'cloudy';
}

/** Extracts local hour (0–23) from an Open-Meteo time string "2024-06-01T08:00". */
function hourOf(t: string): number {
  return parseInt(t.slice(11, 13), 10);
}

/**
 * Converts a raw Open-Meteo hourly response into a compact WeatherSnapshot
 * suitable for offline storage and display.
 */
export function buildSnapshot(result: OpenMeteoResult, date: string): WeatherSnapshot {
  const { time, temperature_2m, precipitation, windspeed_10m, weathercode } = result.hourly;

  // Index by hour, restricted to the stage day — a route fetch spans two
  // calendar days, so otherwise the next day's hours would overwrite today's.
  const byHour = new Map<number, number>();
  time.forEach((t, i) => {
    if (t.slice(0, 10) === date) byHour.set(hourOf(t), i);
  });

  const entries: WeatherEntry[] = DISPLAY_HOURS.map((h) => {
    const i = byHour.get(h) ?? 0;
    return {
      hour: h,
      tempC: Math.round(temperature_2m[i] ?? 0),
      precipMm: Math.round((precipitation[i] ?? 0) * 10) / 10,
      windKmh: Math.round(windspeed_10m[i] ?? 0),
      condition: wmoCondition(weathercode[i] ?? 0),
    };
  });

  let precipSum = 0;
  let windMax = 0;
  for (const [h, i] of byHour) {
    if (h >= HIKE_START && h <= HIKE_END) {
      precipSum += precipitation[i] ?? 0;
      windMax = Math.max(windMax, windspeed_10m[i] ?? 0);
    }
  }

  return {
    date,
    latitude: result.latitude,
    longitude: result.longitude,
    entries,
    precipTotalMm: Math.round(precipSum * 10) / 10,
    windMaxKmh: Math.round(windMax),
  };
}

/** Hours elapsed since `date` 00:00 for an Open-Meteo time string (day-aware). */
function absHourOf(t: string, date: string): number {
  const hour = parseInt(t.slice(11, 13), 10);
  const base = Date.parse(`${date}T00:00:00Z`);
  const day = Date.parse(`${t.slice(0, 10)}T00:00:00Z`);
  return Math.round((day - base) / 86_400_000) * 24 + hour;
}

interface HourReader {
  /** Weather at an absolute hour offset from `date` 00:00 (clamped to data). */
  at(absHour: number): {
    tempC: number;
    precipMm: number;
    windKmh: number;
    condition: WeatherCondition;
  };
}

/** Index an Open-Meteo result by absolute hour for O(1), day-aware reads. */
function indexResult(result: OpenMeteoResult, date: string): HourReader {
  const { time, temperature_2m, precipitation, windspeed_10m, weathercode } = result.hourly;
  const byHour = new Map<number, number>();
  let maxH = 0;
  time.forEach((t, i) => {
    const h = absHourOf(t, date);
    byHour.set(h, i);
    if (h > maxH) maxH = h;
  });
  return {
    at(absHour) {
      const i = byHour.get(absHour) ?? byHour.get(Math.min(absHour, maxH)) ?? 0;
      return {
        tempC: Math.round(temperature_2m[i] ?? 0),
        precipMm: Math.round((precipitation[i] ?? 0) * 10) / 10,
        windKmh: Math.round(windspeed_10m[i] ?? 0),
        condition: wmoCondition(weathercode[i] ?? 0),
      };
    },
  };
}

export interface RouteSnapshotParams {
  /** Per-point forecasts, ordered start→end and evenly spaced (samplePoints). */
  results: OpenMeteoResult[];
  route: GeoJSONLineString;
  elevationProfile: ElevationPoint[];
  paceKmh: number;
  startHour: number;
  date: string;
}

/**
 * Build a route-aware snapshot covering the whole day in three phases:
 *
 * - **start** (`DAY_START`–`startHour`): you haven't left yet — weather at the
 *   start point, so an early riser sees what's waiting outside.
 * - **moving** (`startHour`–`arrivalHour`): en route — for each hour project
 *   where you'll be (per-segment ETA over the elevation profile) and read the
 *   weather from the nearest sampled point.
 * - **end** (`arrivalHour`–`NIGHT_END`): arrived — weather at the destination
 *   through the evening and into the early hours of the next day.
 *
 * The consumer (MovingForecast) trims this to the part of the day that still
 * lies ahead. Falls back to a plain midpoint snapshot (no `moving`) when there
 * aren't enough points or profile data.
 */
export function buildRouteSnapshot({
  results,
  route,
  elevationProfile,
  paceKmh,
  startHour,
  date,
}: RouteSnapshotParams): WeatherSnapshot {
  const k = results.length;
  // WeatherCard still wants the midpoint's fixed-hour snapshot.
  const midIndex = Math.max(0, Math.floor((k - 1) / 2));
  const base = buildSnapshot(results[midIndex], date);

  if (k < 2 || elevationProfile.length < 2) return base;

  const total = totalDistance(route);
  const sampleKms = results.map((_, i) => (i / (k - 1)) * total);
  const timeProfile = cumulativeTimeProfile(elevationProfile, paceKmh);
  const readers = results.map((r) => indexResult(r, date));

  const dayStart = Math.min(DAY_START, startHour);
  const arrivalHour = Math.min(NIGHT_END, startHour + Math.ceil(totalEtaHours(timeProfile)));

  const [startLon, startLat] = pointAtDistance(route, 0);
  const [endLon, endLat] = pointAtDistance(route, total);
  const endKm = Math.round(total * 10) / 10;

  const moving: MovingEntry[] = [];
  for (let hour = dayStart; hour <= NIGHT_END; hour++) {
    if (hour < startHour) {
      // Pre-departure: standing at the start point.
      moving.push({ hour, km: 0, lat: startLat, lon: startLon, phase: 'start', ...readers[0].at(hour) });
    } else if (hour <= arrivalHour) {
      // En route: weather at the position you'll have reached.
      const km = kmAtElapsed(timeProfile, hour - startHour);
      let si = 0;
      let best = Infinity;
      for (let i = 0; i < sampleKms.length; i++) {
        const d = Math.abs(sampleKms[i] - km);
        if (d < best) {
          best = d;
          si = i;
        }
      }
      const [lon, lat] = pointAtDistance(route, km);
      moving.push({ hour, km: Math.round(km * 10) / 10, lat, lon, phase: 'moving', ...readers[si].at(hour) });
    } else {
      // Arrived: weather at the destination through the evening and night.
      moving.push({ hour, km: endKm, lat: endLat, lon: endLon, phase: 'end', ...readers[k - 1].at(hour) });
    }
  }

  // "When does rain catch you?" is about the journey only — ignore start/end.
  const firstWet = moving.find((m) => m.phase === 'moving' && m.precipMm > 0) ?? null;

  return {
    ...base,
    moving,
    startHour,
    arrivalHour,
    rainStartsHour: firstWet ? firstWet.hour : null,
    rainStartsKm: firstWet ? firstWet.km : null,
  };
}
