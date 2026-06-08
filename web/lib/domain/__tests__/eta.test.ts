import { describe, it, expect } from 'vitest';
import { naismithHours, computeETA } from '../eta';

describe('naismithHours', () => {
  it('returns distance/pace for flat terrain', () => {
    expect(naismithHours(20, 0, 4)).toBeCloseTo(5, 2);
  });

  it('adds climb time correctly', () => {
    // 0 km flat + 600 m climb = 1 h
    expect(naismithHours(0, 600, 4)).toBeCloseTo(1, 2);
  });

  it('combines flat and climb', () => {
    // 20 km @ 4 kmh = 5 h + 600 m / 600 mh = 1 h → 6 h
    expect(naismithHours(20, 600, 4)).toBeCloseTo(6, 2);
  });

  it('faster pace reduces time', () => {
    const slow = naismithHours(20, 500, 3);
    const fast = naismithHours(20, 500, 5);
    expect(fast).toBeLessThan(slow);
  });
});

describe('computeETA', () => {
  it('arrival is after start', () => {
    const start = new Date('2025-07-01T07:00:00Z');
    const { arrivalTime, totalHours } = computeETA(20, 600, 4, start);
    expect(arrivalTime.getTime()).toBeGreaterThan(start.getTime());
    expect(totalHours).toBeCloseTo(naismithHours(20, 600, 4), 5);
  });

  it('arrival offset matches totalHours', () => {
    const start = new Date('2025-07-01T07:00:00Z');
    const { arrivalTime, totalHours } = computeETA(15, 400, 4, start);
    const diffH = (arrivalTime.getTime() - start.getTime()) / 3_600_000;
    expect(diffH).toBeCloseTo(totalHours, 5);
  });
});
