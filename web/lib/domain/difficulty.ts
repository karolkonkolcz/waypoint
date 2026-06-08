export interface DifficultyInput {
  distanceKm: number;
  ascentM: number;
  descentM: number;
}

export type DifficultyClass = 'easy' | 'moderate' | 'hard' | 'extreme';

export interface DifficultyResult {
  score: number;
  klass: DifficultyClass;
  effortKm: number;
}

// 100 m of climb ≈ 0.85 effort-km; descent adds lighter fatigue (0.25).
// Extreme threshold: 45 effort-km maps to score 100.
const ASCENT_W = 0.85;
const DESCENT_W = 0.25;
const EXTREME_EFFORT_KM = 45;

export function scoreDifficulty(i: DifficultyInput): DifficultyResult {
  const effortKm =
    i.distanceKm +
    (i.ascentM / 100) * ASCENT_W +
    (i.descentM / 100) * DESCENT_W;

  const score = Math.max(
    0,
    Math.min(100, Math.round((effortKm / EXTREME_EFFORT_KM) * 100)),
  );

  const klass: DifficultyClass =
    score <= 25 ? 'easy'
    : score <= 50 ? 'moderate'
    : score <= 75 ? 'hard'
    : 'extreme';

  return { score, klass, effortKm };
}
