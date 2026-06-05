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

/** One hour of the day, weather taken AT the position you'll have reached. */
export interface MovingEntry {
  hour: number;
  km: number;        // projected distance along the route at this hour
  lat: number;
  lon: number;
  tempC: number;
  precipMm: number;
  windKmh: number;
  condition: WeatherCondition;
}

export interface WeatherSnapshot {
  date: string;              // YYYY-MM-DD
  latitude: number;
  longitude: number;
  entries: WeatherEntry[];   // one per DISPLAY_HOURS (route midpoint — WeatherCard)
  precipTotalMm: number;     // sum over HIKE_START–HIKE_END hours
  windMaxKmh: number;        // max over HIKE_START–HIKE_END hours
  // Route-aware "moving" forecast: weather at the projected position per hour.
  // Absent on transit days / routes without an elevation profile.
  moving?: MovingEntry[];
  rainStartsHour?: number | null; // first hour with precip along the route
  rainStartsKm?: number | null;
}

const DISPLAY_HOURS = [8, 12, 16] as const;
const HIKE_START = 6;
const HIKE_END = 18;

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

  const byHour = new Map<number, number>();
  time.forEach((t, i) => byHour.set(hourOf(t), i));

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

/** Read one hour's weather out of an Open-Meteo result (by local hour). */
function weatherAtHour(result: OpenMeteoResult, hour: number) {
  const { time, temperature_2m, precipitation, windspeed_10m, weathercode } = result.hourly;
  let i = time.findIndex((t) => hourOf(t) === hour);
  if (i < 0) i = 0;
  return {
    tempC: Math.round(temperature_2m[i] ?? 0),
    precipMm: Math.round((precipitation[i] ?? 0) * 10) / 10,
    windKmh: Math.round(windspeed_10m[i] ?? 0),
    condition: wmoCondition(weathercode[i] ?? 0),
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
 * Build a route-aware snapshot: for each hour of the day, project where the
 * hiker will be (per-segment ETA over the elevation profile) and read the
 * weather from the nearest sampled point. Falls back to a plain midpoint
 * snapshot (no `moving`) when there aren't enough points or profile data.
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
  const lastHour = Math.min(21, startHour + Math.ceil(totalEtaHours(timeProfile)));

  const moving: MovingEntry[] = [];
  for (let hour = startHour; hour <= lastHour; hour++) {
    const km = kmAtElapsed(timeProfile, hour - startHour);

    // Nearest sampled point to the projected position.
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
    const w = weatherAtHour(results[si], hour);
    moving.push({ hour, km: Math.round(km * 10) / 10, lat, lon, ...w });
  }

  const firstWet = moving.find((m) => m.precipMm > 0) ?? null;

  return {
    ...base,
    moving,
    rainStartsHour: firstWet ? firstWet.hour : null,
    rainStartsKm: firstWet ? firstWet.km : null,
  };
}
