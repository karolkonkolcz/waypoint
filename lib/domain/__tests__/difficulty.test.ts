import { describe, it, expect } from 'vitest';
import { scoreDifficulty } from '../difficulty';

describe('scoreDifficulty', () => {
  it('classifies a flat short stage as easy', () => {
    const r = scoreDifficulty({ distanceKm: 8, ascentM: 100, descentM: 100 });
    expect(r.klass).toBe('easy');
    expect(r.score).toBeLessThanOrEqual(25);
  });

  it('classifies a typical trail day as moderate', () => {
    // 20 km + 800 m up: effortKm ≈ 20 + 6.8 = 26.8 → score ≈ 60
    const r = scoreDifficulty({ distanceKm: 15, ascentM: 600, descentM: 400 });
    expect(r.klass).toBe('moderate');
  });

  it('classifies a hard alpine day correctly', () => {
    // effortKm = 20 + (1200/100)*0.85 + (600/100)*0.25 = 20 + 10.2 + 1.5 = 31.7 → score ≈ 70 → hard
    const r = scoreDifficulty({ distanceKm: 20, ascentM: 1200, descentM: 600 });
    expect(r.klass).toBe('hard');
  });

  it('classifies an extreme day correctly', () => {
    // 35 km + 2000 m ascent: effortKm ≈ 35 + 17 = 52 → score > 100 → clamped to 100
    const r = scoreDifficulty({ distanceKm: 35, ascentM: 2000, descentM: 1500 });
    expect(r.klass).toBe('extreme');
    expect(r.score).toBe(100);
  });

  it('score is always between 0 and 100', () => {
    const cases = [
      { distanceKm: 0, ascentM: 0, descentM: 0 },
      { distanceKm: 100, ascentM: 5000, descentM: 5000 },
    ];
    for (const c of cases) {
      const { score } = scoreDifficulty(c);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it('effortKm increases with ascent', () => {
    const base = scoreDifficulty({ distanceKm: 20, ascentM: 0, descentM: 0 });
    const withAscent = scoreDifficulty({ distanceKm: 20, ascentM: 1000, descentM: 0 });
    expect(withAscent.effortKm).toBeGreaterThan(base.effortKm);
  });
});
