import { describe, it, expect } from 'vitest';
import { assignStageBoundaries } from '../stages';

const s = (id: string, order_index: number, distance_km: number) => ({
  id,
  order_index,
  distance_km,
});

describe('assignStageBoundaries', () => {
  it('assigns start=0 to the first stage', () => {
    const result = assignStageBoundaries([s('a', 0, 20)]);
    expect(result[0].start_distance_km).toBe(0);
    expect(result[0].end_distance_km).toBe(20);
  });

  it('chains consecutive stages without gaps', () => {
    const result = assignStageBoundaries([s('a', 0, 20), s('b', 1, 15), s('c', 2, 18)]);
    expect(result[0]).toMatchObject({ id: 'a', start_distance_km: 0, end_distance_km: 20 });
    expect(result[1]).toMatchObject({ id: 'b', start_distance_km: 20, end_distance_km: 35 });
    expect(result[2]).toMatchObject({ id: 'c', start_distance_km: 35, end_distance_km: 53 });
  });

  it('sorts by order_index before accumulating', () => {
    // Intentionally out of order
    const result = assignStageBoundaries([s('b', 1, 15), s('a', 0, 20)]);
    expect(result[0].id).toBe('a');
    expect(result[1].id).toBe('b');
    expect(result[1].start_distance_km).toBe(20);
  });

  it('clamps float drift to 3 decimal places', () => {
    // 22.7 + 18.9 = 41.599999... without rounding
    const result = assignStageBoundaries([s('a', 0, 22.7), s('b', 1, 18.9)]);
    expect(result[1].start_distance_km).toBe(22.7);
    expect(result[1].end_distance_km).toBe(41.6);
  });

  it('handles a single stage', () => {
    const result = assignStageBoundaries([s('x', 0, 33.5)]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ start_distance_km: 0, end_distance_km: 33.5 });
  });

  it('returns empty array for empty input', () => {
    expect(assignStageBoundaries([])).toEqual([]);
  });
});
