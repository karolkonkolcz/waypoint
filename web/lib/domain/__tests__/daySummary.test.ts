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
      'Dnes tě čeká středně náročný den: 14 km s 450 m stoupání.',
    );
  });

  it('says dry all day when no precipitation', () => {
    const s = snapshot([entry(8, 0), entry(12, 0), entry(16, 0)], 0);
    expect(buildDaySummary({ stage: trek, snapshot: s })).toBe(
      'Dnes tě čeká středně náročný den: 14 km s 450 m stoupání — po celý den sucho.',
    );
  });

  it('detects front-loaded rain clearing', () => {
    const s = snapshot([entry(8, 1.2), entry(12, 0.3), entry(16, 0)], 1.5);
    expect(buildDaySummary({ stage: trek, snapshot: s })).toContain('déšť během dne ustoupí');
  });

  it('detects rain moving in later', () => {
    const s = snapshot([entry(8, 0), entry(12, 0), entry(16, 2)], 2);
    expect(buildDaySummary({ stage: trek, snapshot: s })).toContain('déšť přijde později');
  });

  it('phrases climb bands', () => {
    expect(buildDaySummary({ stage: { ...trek, ascent_m: 100 } })).toContain('malým stoupáním');
    expect(buildDaySummary({ stage: { ...trek, ascent_m: 800 } })).toContain('poctivým stoupáním 800 m');
    expect(buildDaySummary({ stage: { ...trek, ascent_m: 1500 } })).toContain('velkým stoupáním 1500 m');
  });

  it('uses route-aware rain timing when the snapshot is moving', () => {
    const s = {
      ...snapshot([entry(8, 0), entry(12, 0), entry(16, 0)], 2),
      moving: [
        { hour: 8, km: 0, lat: 0, lon: 0, tempC: 12, precipMm: 0, windKmh: 5, condition: 'clear' as const, phase: 'moving' as const },
        { hour: 13, km: 9, lat: 0, lon: 0, tempC: 14, precipMm: 1.5, windKmh: 8, condition: 'rain' as const, phase: 'moving' as const },
      ],
      rainStartsHour: 13,
      rainStartsKm: 9,
    };
    expect(buildDaySummary({ stage: trek, snapshot: s })).toContain('déšť tě zastihne kolem 13:00');
  });

  it('says dry all day for a moving snapshot with no rain', () => {
    const s = {
      ...snapshot([entry(8, 0)], 0),
      moving: [{ hour: 8, km: 0, lat: 0, lon: 0, tempC: 12, precipMm: 0, windKmh: 5, condition: 'clear' as const, phase: 'moving' as const }],
      rainStartsHour: null,
      rainStartsKm: null,
    };
    expect(buildDaySummary({ stage: trek, snapshot: s })).toContain('po celý den sucho');
  });

  it('frames a transit day as travel', () => {
    expect(
      buildDaySummary({ stage: { stage_type: 'transit', title: 'Chamonix', distance_km: 0, ascent_m: 0, difficulty_class: null } }),
    ).toBe('Přesunový den do Chamonix.');
  });
});
