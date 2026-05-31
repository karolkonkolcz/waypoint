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
