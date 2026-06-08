import { describe, it, expect } from 'vitest';
import {
  haversineKm,
  totalDistance,
  pointAtDistance,
  sliceLineString,
  samplePoints,
  type GeoJSONLineString,
} from '../geo';

// Simple west-east line: 3 points roughly 1° apart in longitude (~111 km each)
const LINE: GeoJSONLineString = {
  type: 'LineString',
  coordinates: [
    [0, 0],
    [1, 0],
    [2, 0],
  ],
};

describe('haversineKm', () => {
  it('returns 0 for the same point', () => {
    expect(haversineKm([10, 50], [10, 50])).toBe(0);
  });

  it('equator degree is ~111 km', () => {
    expect(haversineKm([0, 0], [1, 0])).toBeCloseTo(111.195, 0);
  });
});

describe('totalDistance', () => {
  it('sums segments correctly', () => {
    const seg = haversineKm([0, 0], [1, 0]);
    expect(totalDistance(LINE)).toBeCloseTo(seg * 2, 1);
  });
});

describe('pointAtDistance', () => {
  it('clamps to start at 0', () => {
    expect(pointAtDistance(LINE, 0)).toEqual([0, 0]);
  });

  it('clamps to end beyond total', () => {
    const [lon] = pointAtDistance(LINE, 9999);
    expect(lon).toBeCloseTo(2, 5);
  });

  it('returns midpoint at half distance', () => {
    const half = totalDistance(LINE) / 2;
    const [lon, lat] = pointAtDistance(LINE, half);
    expect(lon).toBeCloseTo(1, 1);
    expect(lat).toBeCloseTo(0, 5);
  });
});

describe('sliceLineString', () => {
  it('slice from 0 to full length equals original total', () => {
    const total = totalDistance(LINE);
    const sliced = sliceLineString(LINE, 0, total);
    expect(totalDistance(sliced)).toBeCloseTo(total, 1);
  });

  it('slice is shorter than original', () => {
    const total = totalDistance(LINE);
    const sliced = sliceLineString(LINE, 0, total / 2);
    expect(totalDistance(sliced)).toBeLessThan(total);
  });
});

describe('samplePoints', () => {
  it('returns N points', () => {
    expect(samplePoints(LINE, 5)).toHaveLength(5);
  });

  it('first point is the start', () => {
    const pts = samplePoints(LINE, 3);
    expect(pts[0]).toEqual([0, 0]);
  });

  it('last point is the end', () => {
    const pts = samplePoints(LINE, 3);
    const last = pts[pts.length - 1];
    expect(last[0]).toBeCloseTo(2, 1);
  });
});
