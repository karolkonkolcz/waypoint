import { describe, it, expect } from 'vitest';
import { buildRouteSnapshot } from '../forecast';
import type { OpenMeteoResult } from '../openmeteo';
import type { ElevationPoint } from '@/lib/domain/eta';
import type { GeoJSONLineString } from '@/lib/domain/geo';

function makeResult(lat: number, lon: number, precipAtHour: (h: number) => number): OpenMeteoResult {
  const time: string[] = [];
  const temperature_2m: number[] = [];
  const precipitation: number[] = [];
  const windspeed_10m: number[] = [];
  const weathercode: number[] = [];
  for (let h = 0; h < 24; h++) {
    time.push(`2026-06-05T${String(h).padStart(2, '0')}:00`);
    temperature_2m.push(15);
    const p = precipAtHour(h);
    precipitation.push(p);
    windspeed_10m.push(10);
    weathercode.push(p > 0 ? 61 : 0);
  }
  return { latitude: lat, longitude: lon, hourly: { time, temperature_2m, precipitation, windspeed_10m, weathercode } };
}

// ~20 km straight line west→east at the equator.
const route: GeoJSONLineString = { type: 'LineString', coordinates: [[0, 0], [0.18, 0]] };
// Flat 10 km, then a 600 m climb over the final 10 km.
const profile: ElevationPoint[] = [
  { d_km: 0, ele_m: 1000 },
  { d_km: 10, ele_m: 1000 },
  { d_km: 20, ele_m: 1600 },
];

describe('buildRouteSnapshot', () => {
  it('produces an hourly moving forecast across the hiking window', () => {
    const results = [
      makeResult(0, 0, () => 0), // start — dry
      makeResult(0, 0.09, () => 0), // mid — dry
      makeResult(0, 0.18, () => 0), // end — dry
    ];
    const snap = buildRouteSnapshot({ results, route, elevationProfile: profile, paceKmh: 5, startHour: 8, date: '2026-06-05' });

    expect(snap.moving).toBeDefined();
    // ETA 5h → hours 8..13 inclusive = 6 entries.
    expect(snap.moving!.map((m) => m.hour)).toEqual([8, 9, 10, 11, 12, 13]);
    // Position advances along the route through the day.
    const kms = snap.moving!.map((m) => m.km);
    for (let i = 1; i < kms.length; i++) expect(kms[i]).toBeGreaterThanOrEqual(kms[i - 1]);
    expect(snap.rainStartsHour).toBeNull();
  });

  it('reports rain at the position you reach when it starts', () => {
    // Rain only at the END point, only from 13:00 — you arrive there at 13:00.
    const results = [
      makeResult(0, 0, () => 0),
      makeResult(0, 0.09, () => 0),
      makeResult(0, 0.18, (h) => (h >= 13 ? 2 : 0)),
    ];
    const snap = buildRouteSnapshot({ results, route, elevationProfile: profile, paceKmh: 5, startHour: 8, date: '2026-06-05' });

    expect(snap.rainStartsHour).toBe(13);
    expect(snap.rainStartsKm).toBeGreaterThan(18);
    // Earlier hours (nearer the dry start/mid points) stay dry.
    expect(snap.moving!.find((m) => m.hour === 10)!.precipMm).toBe(0);
  });

  it('still fills the WeatherCard entries from the midpoint', () => {
    const results = [
      makeResult(0, 0, () => 0),
      makeResult(0, 0.09, () => 0),
      makeResult(0, 0.18, () => 0),
    ];
    const snap = buildRouteSnapshot({ results, route, elevationProfile: profile, paceKmh: 5, startHour: 8, date: '2026-06-05' });
    expect(snap.entries).toHaveLength(3); // 8/12/16
  });

  it('falls back to a plain snapshot without an elevation profile', () => {
    const results = [makeResult(0, 0, () => 0), makeResult(0, 0.18, () => 0)];
    const snap = buildRouteSnapshot({ results, route, elevationProfile: [], paceKmh: 5, startHour: 8, date: '2026-06-05' });
    expect(snap.moving).toBeUndefined();
    expect(snap.entries).toHaveLength(3);
  });
});
