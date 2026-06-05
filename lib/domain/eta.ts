import { pointAtDistance, totalDistance } from './geo';
import type { GeoJSONLineString } from './geo';

// Naismith: time = distance / pace + ascent / climbRate
const CLIMB_RATE_M_PER_H = 600;

export function naismithHours(
  distanceKm: number,
  ascentM: number,
  paceKmh: number,
): number {
  return distanceKm / paceKmh + ascentM / CLIMB_RATE_M_PER_H;
}

// Tobler walking speed (km/h) for a given slope (dh/dx).
// Drop-in alternative to Naismith for per-segment integration.
export function toblerSpeedKmh(slope: number): number {
  return 6 * Math.exp(-3.5 * Math.abs(slope + 0.05));
}

export interface ETAResult {
  totalHours: number;
  arrivalTime: Date;
}

export function computeETA(
  distanceKm: number,
  ascentM: number,
  paceKmh: number,
  startTime: Date,
): ETAResult {
  const totalHours = naismithHours(distanceKm, ascentM, paceKmh);
  const arrivalTime = new Date(startTime.getTime() + totalHours * 3600 * 1000);
  return { totalHours, arrivalTime };
}

// ---------------------------------------------------------------------------
// Per-segment time profile — drives "where will I be at hour h?" by integrating
// Naismith over the elevation profile, so a climb genuinely slows progress.
// ---------------------------------------------------------------------------

export interface ElevationPoint {
  d_km: number;
  ele_m: number;
}

/** Cumulative hours-from-start at each elevation-profile distance mark. */
export interface TimeProfilePoint {
  km: number;
  h: number;
}

/**
 * Build a cumulative time profile from a route's elevation profile. Each
 * segment costs Naismith time over its own distance + ascent (descent is free,
 * matching naismithHours), so the returned curve is steeper on climbs.
 */
export function cumulativeTimeProfile(
  profile: ElevationPoint[],
  paceKmh: number,
): TimeProfilePoint[] {
  if (profile.length === 0) return [];
  const pts: TimeProfilePoint[] = [{ km: profile[0].d_km, h: 0 }];
  for (let i = 1; i < profile.length; i++) {
    const dKm = Math.max(0, profile[i].d_km - profile[i - 1].d_km);
    const ascent = Math.max(0, profile[i].ele_m - profile[i - 1].ele_m);
    const dt = naismithHours(dKm, ascent, paceKmh);
    pts.push({ km: profile[i].d_km, h: pts[i - 1].h + dt });
  }
  return pts;
}

/** Total walking time for the whole profile, in hours. */
export function totalEtaHours(profile: TimeProfilePoint[]): number {
  return profile.length ? profile[profile.length - 1].h : 0;
}

/**
 * Distance along the route (km) reached after `elapsedH` hours of walking.
 * Clamps to the route ends; interpolates linearly within a segment.
 */
export function kmAtElapsed(profile: TimeProfilePoint[], elapsedH: number): number {
  if (profile.length === 0) return 0;
  if (elapsedH <= profile[0].h) return profile[0].km;
  const last = profile[profile.length - 1];
  if (elapsedH >= last.h) return last.km;

  for (let i = 1; i < profile.length; i++) {
    if (profile[i].h >= elapsedH) {
      const span = profile[i].h - profile[i - 1].h;
      if (span <= 0) return profile[i].km;
      const t = (elapsedH - profile[i - 1].h) / span;
      return profile[i - 1].km + t * (profile[i].km - profile[i - 1].km);
    }
  }
  return last.km;
}

/** [lon, lat] position after `elapsedH` hours, via the time profile. */
export function positionAtElapsed(
  route: GeoJSONLineString,
  profile: TimeProfilePoint[],
  elapsedH: number,
): [number, number] {
  return pointAtDistance(route, kmAtElapsed(profile, elapsedH));
}

/**
 * Returns the lat/lon position a hiker has reached at `now` given
 * they started at `startTime` and are walking `route` at `paceKmh`.
 * Used by the weather system to answer "where will I be at 15:00?".
 */
export function positionAt(
  startTime: Date,
  now: Date,
  route: GeoJSONLineString,
  ascentM: number,
  paceKmh: number,
): [number, number] {
  const elapsedH = (now.getTime() - startTime.getTime()) / 3600_000;
  const routeKm = totalDistance(route);

  // Approximate covered distance from elapsed time using Naismith.
  // We invert: coveredKm ≈ elapsedH * effectivePace
  const effectivePace = routeKm / naismithHours(routeKm, ascentM, paceKmh);
  const coveredKm = Math.min(elapsedH * effectivePace, routeKm);

  return pointAtDistance(route, coveredKm);
}
