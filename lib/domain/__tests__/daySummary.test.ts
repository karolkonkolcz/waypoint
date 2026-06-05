import { describe, it, expect } from 'vitest';
import { buildDaySummary } from '../daySummary';
import type { WeatherSnapshot, WeatherEntry } from '@/lib/weather/forecast';

function entry(hour: number, precipMm: number): WeatherEntry {
  return { hour, tempC: 15, precipMm, windKmh: 5, condition: precipMm > 0 ? 'rain' : 'clear' };
}

function snapshot(entries: WeatherEntry[], precipTotalMm: number): WeatherSnapshot {
  return { date: '2026-06-05', latitude: 49, longitude: 19, entries, precipTotalMm, windMaxKmh: 20 };
}

const trek = {
  stage_type: 'trek' as const,
  title: 'Col du Géant',
  distance_km: 14,
  ascent_m: 450,
  difficulty_class: 'moderate',
};

describe('buildDaySummary', () => {
  it('leads a trek day with difficulty, distance and climb', () => {
    expect(buildDaySummary({ stage: trek })).toBe(
      'A moderate 14 km day with 450 m of climbing.',
    );
  });

  it('says dry all day when no precipitation', () => {
    const s = snapshot([entry(8, 0), entry(12, 0), entry(16, 0)], 0);
    expect(buildDaySummary({ stage: trek, snapshot: s })).toBe(
      'A moderate 14 km day with 450 m of climbing — dry all day.',
    );
  });

  it('detects front-loaded rain clearing', () => {
    const s = snapshot([entry(8, 1.2), entry(12, 0.3), entry(16, 0)], 1.5);
    expect(buildDaySummary({ stage: trek, snapshot: s })).toContain('rain clearing through the day');
  });

  it('detects rain moving in later', () => {
    const s = snapshot([entry(8, 0), entry(12, 0), entry(16, 2)], 2);
    expect(buildDaySummary({ stage: trek, snapshot: s })).toContain('rain moving in later');
  });

  it('phrases climb bands', () => {
    expect(buildDaySummary({ stage: { ...trek, ascent_m: 100 } })).toContain('little climbing');
    expect(buildDaySummary({ stage: { ...trek, ascent_m: 800 } })).toContain('a solid 800 m climb');
    expect(buildDaySummary({ stage: { ...trek, ascent_m: 1500 } })).toContain('a big 1500 m climb');
  });

  it('uses route-aware rain timing when the snapshot is moving', () => {
    const s = {
      ...snapshot([entry(8, 0), entry(12, 0), entry(16, 0)], 2),
      moving: [
        { hour: 8, km: 0, lat: 0, lon: 0, tempC: 12, precipMm: 0, windKmh: 5, condition: 'clear' as const },
        { hour: 13, km: 9, lat: 0, lon: 0, tempC: 14, precipMm: 1.5, windKmh: 8, condition: 'rain' as const },
      ],
      rainStartsHour: 13,
      rainStartsKm: 9,
    };
    expect(buildDaySummary({ stage: trek, snapshot: s })).toContain('rain reaches you around 13:00');
  });

  it('says dry all day for a moving snapshot with no rain', () => {
    const s = {
      ...snapshot([entry(8, 0)], 0),
      moving: [{ hour: 8, km: 0, lat: 0, lon: 0, tempC: 12, precipMm: 0, windKmh: 5, condition: 'clear' as const }],
      rainStartsHour: null,
      rainStartsKm: null,
    };
    expect(buildDaySummary({ stage: trek, snapshot: s })).toContain('dry all day');
  });

  it('frames a transit day as travel', () => {
    expect(
      buildDaySummary({ stage: { stage_type: 'transit', title: 'Chamonix', distance_km: 0, ascent_m: 0, difficulty_class: null } }),
    ).toBe('A travel day to Chamonix.');
  });
});
