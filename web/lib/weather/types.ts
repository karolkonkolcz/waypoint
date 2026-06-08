// Shared types for the /weather page feature (current-position meteogram +
// radar). Kept separate from the trail-scoped weather subsystem in
// forecast.ts / openmeteo.ts — that one stores a compact WeatherSnapshot,
// this one keeps the raw Open-Meteo hourly response the meteogram renders.

/**
 * Raw Open-Meteo forecast response for the current-position meteogram. Uses the
 * richer hourly variable set (cloud layers, pressure, gusts, wind direction)
 * that the six meteogram panels need — a superset of what the trail weather
 * cache (openmeteo.ts) requests.
 */
export interface OpenMeteoForecast {
  latitude: number;
  longitude: number;
  timezone?: string;
  hourly: {
    time: string[]; // ISO timestamps, one per hour
    temperature_2m: number[];
    cloud_cover: number[]; // % total
    cloud_cover_low: number[];
    cloud_cover_mid: number[];
    cloud_cover_high: number[];
    precipitation: number[]; // mm accumulated (rain + snow)
    rain: number[];
    snowfall: number[];
    pressure_msl: number[]; // hPa reduced to sea level
    wind_speed_10m: number[]; // km/h
    wind_gusts_10m: number[];
    wind_direction_10m: number[]; // degrees 0–360
  };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
  };
}

/**
 * Normalized series the <Meteogram> component renders. Each panel draws only
 * when its series is present, so the same component serves both the full live
 * path (every series filled from OpenMeteoForecast) and the limited offline
 * path (only temperature / precipitation / wind, derived from a cached
 * WeatherSnapshot's hourly "moving" entries).
 */
export interface MeteogramData {
  /** X axis: Unix seconds per hour (uPlot's native time unit). */
  time: number[];
  temperature?: number[];
  /** Daily min/max band, aligned to the hourly X axis (step-filled). */
  tempMin?: number[];
  tempMax?: number[];
  cloudLow?: number[];
  cloudMid?: number[];
  cloudHigh?: number[];
  rain?: number[];
  snow?: number[];
  pressure?: number[];
  windSpeed?: number[];
  windGusts?: number[];
  windDir?: number[];
  /** When true, the chart shows a "limited offline data" note. */
  limited?: boolean;
}

/** Resolved page mode — see HANDOFF §"Page modes". */
export type WeatherMode =
  | { kind: 'loading' }
  | { kind: 'online'; lat: number; lon: number; forecast: OpenMeteoForecast }
  | {
      kind: 'offline-fallback';
      data: MeteogramData;
      trailName: string;
      stageTitle: string;
      fetchedAt: string; // ISO
    }
  | { kind: 'empty'; reason: EmptyReason };

export type EmptyReason =
  | 'offline-no-cache'
  | 'permission-denied'
  | 'position-unavailable'
  | 'fetch-failed';

/** Geolocation result, normalized away from the browser's coordinate object. */
export interface GpsPosition {
  lat: number;
  lon: number;
}
