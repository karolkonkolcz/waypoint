import type { OpenMeteoResult } from './openmeteo';

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

export interface WeatherSnapshot {
  date: string;              // YYYY-MM-DD
  latitude: number;
  longitude: number;
  entries: WeatherEntry[];   // one per DISPLAY_HOURS
  precipTotalMm: number;     // sum over HIKE_START–HIKE_END hours
  windMaxKmh: number;        // max over HIKE_START–HIKE_END hours
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
