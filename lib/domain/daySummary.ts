import type { StageRow } from '@/lib/db/dexie';
import type { WeatherSnapshot } from '@/lib/weather/forecast';
import type { DifficultyClass } from '@/lib/domain/difficulty';

// Deterministic one-line briefing for the daily dashboard. No AI (PRD Non-Goals):
// every clause is templated from the day's own data.

const DIFFICULTY_WORD: Record<DifficultyClass, string> = {
  easy: 'easy',
  moderate: 'moderate',
  hard: 'hard',
  extreme: 'tough',
};

/** Phrase the day's climb, fitting after "with …". */
function climbClause(ascentM: number): string {
  if (ascentM < 200) return 'little climbing';
  if (ascentM < 600) return `${ascentM} m of climbing`;
  if (ascentM < 1200) return `a solid ${ascentM} m climb`;
  return `a big ${ascentM} m climb`;
}

/** Phrase the day's weather trend from the snapshot, or null if none cached. */
function weatherClause(snapshot: WeatherSnapshot | null | undefined): string | null {
  if (!snapshot) return null;
  if (snapshot.precipTotalMm === 0) return 'dry all day';

  const entries = snapshot.entries;
  if (entries.length === 0) return `${snapshot.precipTotalMm} mm of rain expected`;

  const first = entries[0];
  const last = entries[entries.length - 1];
  if (first.precipMm > 0 && last.precipMm === 0) return 'rain clearing through the day';
  if (first.precipMm === 0 && last.precipMm > 0) return 'rain moving in later';
  return `${snapshot.precipTotalMm} mm of rain expected`;
}

export interface DaySummaryInput {
  stage: Pick<StageRow, 'stage_type' | 'title' | 'distance_km' | 'ascent_m' | 'difficulty_class'>;
  snapshot?: WeatherSnapshot | null;
}

/**
 * A single human sentence about today, composed from the stage + cached
 * weather. Trek days lead with distance/difficulty/climb; transit days are
 * framed as travel.
 */
export function buildDaySummary({ stage, snapshot }: DaySummaryInput): string {
  const weather = weatherClause(snapshot);

  if (stage.stage_type === 'transit') {
    return weather
      ? `A travel day to ${stage.title} — ${weather}.`
      : `A travel day to ${stage.title}.`;
  }

  const klass = stage.difficulty_class as DifficultyClass | null;
  const difficultyWord = klass ? DIFFICULTY_WORD[klass] : 'steady';
  const base = `A ${difficultyWord} ${stage.distance_km} km day with ${climbClause(stage.ascent_m)}`;

  return weather ? `${base} — ${weather}.` : `${base}.`;
}
