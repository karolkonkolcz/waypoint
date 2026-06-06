import { db } from '@/lib/db/dexie';
import type { GpsPosition, MeteogramData, OpenMeteoForecast } from './types';

const STALE_MS = 6 * 60 * 60 * 1000; // 6 h — reuse the weather-cache staleness rule
const PRUNE_MS = 24 * 60 * 60 * 1000; // drop rows older than 24 h

/** Hourly variables the six meteogram panels need (richer than openmeteo.ts). */
const HOURLY_VARS = [
  'temperature_2m',
  'cloud_cover',
  'cloud_cover_low',
  'cloud_cover_mid',
  'cloud_cover_high',
  'precipitation',
  'rain',
  'snowfall',
  'pressure_msl',
  'wind_speed_10m',
  'wind_gusts_10m',
  'wind_direction_10m',
].join(',');

/** Coarse (~1 km) cache key so small movements reuse the same forecast. */
export function cacheKeyFor(lat: number, lon: number): string {
  return `${lat.toFixed(2)}:${lon.toFixed(2)}`;
}

function isStale(fetchedAt: number): boolean {
  return Date.now() - fetchedAt > STALE_MS;
}

/**
 * One-shot geolocation. Resolves to a position or rejects with the native
 * GeolocationPositionError so callers can branch on PERMISSION_DENIED vs.
 * POSITION_UNAVAILABLE / TIMEOUT. Low accuracy on purpose — weather grids are
 * ~2–5 km, and high accuracy drains battery (HANDOFF §Geolocation).
 */
export function getCurrentPosition(): Promise<GpsPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation unavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(err),
      { timeout: 10_000, maximumAge: 60_000, enableHighAccuracy: false },
    );
  });
}

/** Fire-and-forget cleanup of rows older than 24 h. Call on page mount. */
export async function pruneEphemeralWeather(): Promise<void> {
  try {
    await db.ephemeral_weather
      .where('fetched_at')
      .below(Date.now() - PRUNE_MS)
      .delete();
  } catch {
    // Cache pruning is best-effort; never block the page on it.
  }
}

async function fetchForecast(lat: number, lon: number): Promise<OpenMeteoForecast> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', lat.toFixed(4));
  url.searchParams.set('longitude', lon.toFixed(4));
  url.searchParams.set('hourly', HOURLY_VARS);
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min');
  url.searchParams.set('forecast_days', '4');
  url.searchParams.set('timezone', 'auto');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Open-Meteo API error: ${res.status}`);
  return res.json() as Promise<OpenMeteoForecast>;
}

/**
 * Read-through current-position forecast. Checks the ephemeral Dexie cache
 * first (keyed to ~1 km); on a fresh hit returns it without a network call.
 * On a stale/miss, fetches from Open-Meteo, writes the row, and returns it.
 *
 * Caller is responsible for only invoking this when online — when offline a
 * miss would throw, which the page handles by falling through to the offline
 * fallback mode.
 */
export async function getCurrentPositionForecast(
  lat: number,
  lon: number,
): Promise<OpenMeteoForecast> {
  const cacheKey = cacheKeyFor(lat, lon);

  const cached = await db.ephemeral_weather.get(cacheKey);
  if (cached && !isStale(cached.fetched_at)) return cached.forecast;

  const forecast = await fetchForecast(lat, lon);
  await db.ephemeral_weather.put({ cacheKey, forecast, fetched_at: Date.now() });
  return forecast;
}

/** ISO local timestamp ("2026-06-06T08:00") → Unix seconds (uPlot's X unit). */
function isoToUnix(t: string): number {
  return Math.floor(new Date(t).getTime() / 1000);
}

/**
 * Adapt a full Open-Meteo forecast into the meteogram's normalized series —
 * every panel filled. The daily min/max band is expanded onto the hourly X
 * axis so the temperature panel can fill it behind the hourly line.
 */
export function forecastToMeteogram(forecast: OpenMeteoForecast): MeteogramData {
  const h = forecast.hourly;
  const dayMin = new Map<string, number>();
  const dayMax = new Map<string, number>();
  forecast.daily.time.forEach((d, i) => {
    dayMin.set(d, forecast.daily.temperature_2m_min[i]);
    dayMax.set(d, forecast.daily.temperature_2m_max[i]);
  });

  return {
    time: h.time.map(isoToUnix),
    temperature: h.temperature_2m,
    tempMin: h.time.map((t) => dayMin.get(t.slice(0, 10)) ?? h.temperature_2m[0]),
    tempMax: h.time.map((t) => dayMax.get(t.slice(0, 10)) ?? h.temperature_2m[0]),
    cloudLow: h.cloud_cover_low,
    cloudMid: h.cloud_cover_mid,
    cloudHigh: h.cloud_cover_high,
    rain: h.rain,
    snow: h.snowfall,
    pressure: h.pressure_msl,
    windSpeed: h.wind_speed_10m,
    windGusts: h.wind_gusts_10m,
    windDir: h.wind_direction_10m,
    limited: false,
  };
}
