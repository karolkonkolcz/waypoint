import { describe, it, expect } from 'vitest';
import { bboxOf, mergeBboxes, type GeoJSONLineString } from '@/lib/domain/geo';

const line = (coords: [number, number][]): GeoJSONLineString => ({
  type: 'LineString',
  coordinates: coords,
});

describe('bboxOf', () => {
  it('computes [west, south, east, north] from a LineString', () => {
    const l = line([
      [19.0, 48.5],
      [19.5, 49.0],
      [18.5, 48.8],
    ]);
    expect(bboxOf(l)).toEqual([18.5, 48.5, 19.5, 49.0]);
  });

  it('handles a single point', () => {
    expect(bboxOf(line([[10, 20]]))).toEqual([10, 20, 10, 20]);
  });

  it('ignores elevation in the third coordinate slot', () => {
    const l: GeoJSONLineString = {
      type: 'LineString',
      coordinates: [
        [1, 2, 100],
        [3, 4, 200],
      ],
    };
    expect(bboxOf(l)).toEqual([1, 2, 3, 4]);
  });
});

describe('mergeBboxes', () => {
  it('returns null for an empty list', () => {
    expect(mergeBboxes([])).toBeNull();
  });

  it('returns the single box unchanged', () => {
    expect(mergeBboxes([[1, 2, 3, 4]])).toEqual([1, 2, 3, 4]);
  });

  it('unions multiple boxes', () => {
    expect(
      mergeBboxes([
        [0, 0, 5, 5],
        [-2, 1, 3, 9],
        [4, -3, 6, 2],
      ]),
    ).toEqual([-2, -3, 6, 9]);
  });
});
