import type { WaypointRow } from '@/lib/db/dexie';
import type { WeatherSnapshot } from '@/lib/weather/forecast';
import {
  cumulativeTimeProfile,
  totalEtaHours,
  type ElevationPoint,
  type TimeProfilePoint,
} from '@/lib/domain/eta';

export type TimelinePointKind =
  | 'start'
  | 'water'
  | 'peak'
  | 'town'
  | 'camp'
  | 'shelter'
  | 'resupply'
  | 'storm'
  | 'finish'
  | 'other';

export interface RouteTimelineRow {
  id: string;
  kind: TimelinePointKind;
  title: string;
  detail: string | null;
  hour: number;
  distanceKm: number;
  elevationM: number | null;
  precipMm: number | null;
  isStorm: boolean;
}

export interface RainOnset {
  hour: number;
  distanceKm: number;
  elevationM: number | null;
  precipMm: number;
}

const RAIN_THRESHOLD_MM = 0.5;

export function elevationAtDistance(profile: ElevationPoint[], targetKm: number): number | null {
  if (profile.length === 0) return null;
  if (targetKm <= profile[0].d_km) return Math.round(profile[0].ele_m);
  const last = profile[profile.length - 1];
  if (targetKm >= last.d_km) return Math.round(last.ele_m);

  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1];
    const b = profile[i];
    if (b.d_km >= targetKm) {
      const span = b.d_km - a.d_km;
      const t = span <= 0 ? 0 : (targetKm - a.d_km) / span;
      return Math.round(a.ele_m + t * (b.ele_m - a.ele_m));
    }
  }
  return Math.round(last.ele_m);
}

function hoursAtKm(profile: TimeProfilePoint[], targetKm: number): number {
  if (profile.length === 0) return 0;
  if (targetKm <= profile[0].km) return profile[0].h;
  const last = profile[profile.length - 1];
  if (targetKm >= last.km) return last.h;

  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1];
    const b = profile[i];
    if (b.km >= targetKm) {
      const span = b.km - a.km;
      const t = span <= 0 ? 0 : (targetKm - a.km) / span;
      return a.h + t * (b.h - a.h);
    }
  }
  return last.h;
}

function waypointKind(type: WaypointRow['type']): TimelinePointKind {
  if (type === 'water') return 'water';
  if (type === 'camp') return 'camp';
  if (type === 'shelter') return 'shelter';
  if (type === 'resupply') return 'resupply';
  if (type === 'town') return 'town';
  if (type === 'peak') return 'peak';
  return 'other';
}

function nearestRow(rows: RouteTimelineRow[], distanceKm: number): RouteTimelineRow | null {
  let best: RouteTimelineRow | null = null;
  let bestDistance = Infinity;
  for (const row of rows) {
    if (row.kind === 'start' || row.kind === 'finish' || row.kind === 'storm') continue;
    const d = Math.abs(row.distanceKm - distanceKm);
    if (d < bestDistance) {
      best = row;
      bestDistance = d;
    }
  }
  return bestDistance <= 2 ? best : null;
}

export function rainOnsetFromSnapshot(
  snapshot: WeatherSnapshot | undefined,
  profile: ElevationPoint[],
): RainOnset | null {
  if (!snapshot?.moving?.length) return null;
  const wet =
    snapshot.moving.find((m) => m.phase === 'moving' && m.precipMm >= RAIN_THRESHOLD_MM) ?? null;
  if (!wet) return null;

  return {
    hour: wet.hour,
    distanceKm: wet.km,
    elevationM: elevationAtDistance(profile, wet.km),
    precipMm: wet.precipMm,
  };
}

export function buildRouteTimeline({
  profile,
  waypoints,
  paceKmh,
  startHour,
  startName,
  destinationName,
  snapshot,
}: {
  profile: ElevationPoint[];
  waypoints: WaypointRow[];
  paceKmh: number;
  startHour: number;
  startName: string;
  destinationName: string;
  snapshot?: WeatherSnapshot;
}): { rows: RouteTimelineRow[]; rainOnset: RainOnset | null; arrivalHour: number } {
  if (profile.length < 2) return { rows: [], rainOnset: null, arrivalHour: startHour };

  const timeProfile = cumulativeTimeProfile(profile, paceKmh);
  const totalKm = profile[profile.length - 1].d_km;
  const totalHours = totalEtaHours(timeProfile);
  const arrivalHour = startHour + totalHours;

  const baseRows: RouteTimelineRow[] = [
    {
      id: 'start',
      kind: 'start',
      title: startName,
      detail: 'Start',
      hour: startHour,
      distanceKm: 0,
      elevationM: elevationAtDistance(profile, 0),
      precipMm: null,
      isStorm: false,
    },
  ];

  const stageWaypoints = waypoints
    .filter((w) => w.distance_along_route_km != null)
    .filter((w) => {
      const km = w.distance_along_route_km as number;
      return km > 0.1 && km < totalKm - 0.1;
    })
    .sort((a, b) => (a.distance_along_route_km ?? 0) - (b.distance_along_route_km ?? 0));

  for (const waypoint of stageWaypoints) {
    const km = waypoint.distance_along_route_km as number;
    baseRows.push({
      id: waypoint.id,
      kind: waypointKind(waypoint.type),
      title: waypoint.name,
      detail: waypoint.description,
      hour: startHour + hoursAtKm(timeProfile, km),
      distanceKm: km,
      elevationM: waypoint.elevation_m ?? elevationAtDistance(profile, km),
      precipMm: null,
      isStorm: false,
    });
  }

  const highest = profile.reduce((best, point) => (point.ele_m > best.ele_m ? point : best), profile[0]);
  const hasPeakNearby = baseRows.some((row) => Math.abs(row.distanceKm - highest.d_km) < 0.5);
  if (!hasPeakNearby && highest.d_km > 0.5 && highest.d_km < totalKm - 0.5) {
    baseRows.push({
      id: 'highest-point',
      kind: 'peak',
      title: 'Nejvyšší bod',
      detail: null,
      hour: startHour + hoursAtKm(timeProfile, highest.d_km),
      distanceKm: highest.d_km,
      elevationM: Math.round(highest.ele_m),
      precipMm: null,
      isStorm: false,
    });
  }

  baseRows.push({
    id: 'finish',
    kind: 'finish',
    title: destinationName,
    detail: 'Cíl',
    hour: arrivalHour,
    distanceKm: totalKm,
    elevationM: elevationAtDistance(profile, totalKm),
    precipMm: null,
    isStorm: false,
  });

  const rainOnset = rainOnsetFromSnapshot(snapshot, profile);
  const rows = [...baseRows];
  if (rainOnset) {
    const near = nearestRow(baseRows, rainOnset.distanceKm);
    rows.push({
      id: 'storm',
      kind: 'storm',
      title: near?.title ?? 'Srážky na trase',
      detail: `${rainOnset.precipMm.toFixed(1)} mm/h`,
      hour: rainOnset.hour,
      distanceKm: rainOnset.distanceKm,
      elevationM: rainOnset.elevationM,
      precipMm: rainOnset.precipMm,
      isStorm: true,
    });
  }

  rows.sort((a, b) => a.distanceKm - b.distanceKm || Number(b.isStorm) - Number(a.isStorm));
  return { rows, rainOnset, arrivalHour };
}
