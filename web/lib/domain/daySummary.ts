import type { StageRow } from '@/lib/db/dexie';
import type { WeatherSnapshot } from '@/lib/weather/forecast';
import type { DifficultyClass } from '@/lib/domain/difficulty';

// Deterministic one-line briefing for the daily dashboard. No AI (PRD Non-Goals):
// every clause is templated from the day's own data.

const DIFFICULTY_WORD: Record<DifficultyClass, string> = {
  easy: 'snadný',
  moderate: 'středně náročný',
  hard: 'těžký',
  extreme: 'extrémní',
};

/** Phrase the day's climb, fitting after "s …". */
function climbClause(ascentM: number): string {
  if (ascentM < 200) return 'malým stoupáním';
  if (ascentM < 600) return `${ascentM} m stoupání`;
  if (ascentM < 1200) return `poctivým stoupáním ${ascentM} m`;
  return `velkým stoupáním ${ascentM} m`;
}

/** Phrase the day's weather trend from the snapshot, or null if none cached. */
function weatherClause(snapshot: WeatherSnapshot | null | undefined): string | null {
  if (!snapshot) return null;

  // Route-aware snapshot knows exactly when rain catches you along the way.
  if (snapshot.moving && snapshot.moving.length > 0) {
    if (snapshot.rainStartsHour != null) {
      return `déšť tě zastihne kolem ${String(snapshot.rainStartsHour).padStart(2, '0')}:00`;
    }
    return 'po celý den sucho';
  }

  if (snapshot.precipTotalMm === 0) return 'po celý den sucho';

  const entries = snapshot.entries;
  if (entries.length === 0) return `očekává se ${snapshot.precipTotalMm} mm srážek`;

  const first = entries[0];
  const last = entries[entries.length - 1];
  if (first.precipMm > 0 && last.precipMm === 0) return 'déšť během dne ustoupí';
  if (first.precipMm === 0 && last.precipMm > 0) return 'déšť přijde později';
  return `očekává se ${snapshot.precipTotalMm} mm srážek`;
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
      ? `Přesunový den do ${stage.title} — ${weather}.`
      : `Přesunový den do ${stage.title}.`;
  }

  const klass = stage.difficulty_class as DifficultyClass | null;
  const difficultyWord = klass ? DIFFICULTY_WORD[klass] : 'stabilní';
  const base = `Dnes tě čeká ${difficultyWord} den: ${stage.distance_km} km s ${climbClause(stage.ascent_m)}`;

  return weather ? `${base} — ${weather}.` : `${base}.`;
}
