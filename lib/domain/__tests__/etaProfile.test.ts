import { describe, it, expect } from 'vitest';
import {
  cumulativeTimeProfile,
  totalEtaHours,
  kmAtElapsed,
  positionAtElapsed,
  naismithHours,
  type ElevationPoint,
} from '../eta';
import type { GeoJSONLineString } from '../geo';

// 10 km flat then a 600 m climb over the next 10 km, at 5 km/h.
const profile: ElevationPoint[] = [
  { d_km: 0, ele_m: 1000 },
  { d_km: 10, ele_m: 1000 },
  { d_km: 20, ele_m: 1600 },
];

describe('cumulativeTimeProfile', () => {
  it('accumulates Naismith time per segment (descent free)', () => {
    const p = cumulativeTimeProfile(profile, 5);
    expect(p).toHaveLength(3);
    expect(p[0]).toEqual({ km: 0, h: 0 });
    // flat 10 km @ 5 km/h = 2h
    expect(p[1].h).toBeCloseTo(2, 5);
    // + 10 km @ 5 km/h (2h) + 600 m climb / 600 m/h (1h) = 3h more
    expect(p[2].h).toBeCloseTo(5, 5);
  });

  it('matches naismithHours end-to-end on a single climb', () => {
    const p = cumulativeTimeProfile(profile, 5);
    expect(totalEtaHours(p)).toBeCloseTo(naismithHours(20, 600, 5), 5);
  });

  it('returns empty for an empty profile', () => {
    expect(cumulativeTimeProfile([], 5)).toEqual([]);
    expect(totalEtaHours([])).toBe(0);
  });
});

describe('kmAtElapsed', () => {
  const p = cumulativeTimeProfile(profile, 5);

  it('clamps before start and after finish', () => {
    expect(kmAtElapsed(p, -1)).toBe(0);
    expect(kmAtElapsed(p, 99)).toBe(20);
  });

  it('the flat segment covers ground faster than the climb', () => {
    // After 2h the hiker is at the 10 km mark (end of the flat part).
    expect(kmAtElapsed(p, 2)).toBeCloseTo(10, 5);
    // The last 10 km (with climb) take 3h, so after 3.5h (1.5h into it)
    // only ~5 km of that segment is done → ~15 km total.
    expect(kmAtElapsed(p, 3.5)).toBeCloseTo(15, 5);
  });

  it('is monotonic in elapsed time', () => {
    let prev = -1;
    for (let h = 0; h <= 5; h += 0.5) {
      const km = kmAtElapsed(p, h);
      expect(km).toBeGreaterThanOrEqual(prev);
      prev = km;
    }
  });
});

describe('positionAtElapsed', () => {
  // A straight west→east line, 20 km-ish, two vertices.
  const route: GeoJSONLineString = {
    type: 'LineString',
    coordinates: [
      [0, 0],
      [0.18, 0], // ~20 km east at the equator
    ],
  };

  it('moves the position eastward over the day', () => {
    const p = cumulativeTimeProfile(profile, 5);
    const start = positionAtElapsed(route, p, 0);
    const mid = positionAtElapsed(route, p, 2);
    const end = positionAtElapsed(route, p, 5);
    expect(start[0]).toBeCloseTo(0, 5);
    expect(mid[0]).toBeGreaterThan(start[0]);
    expect(end[0]).toBeGreaterThan(mid[0]);
  });
});
