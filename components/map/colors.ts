import type { DifficultyClass } from '@/lib/domain/difficulty';

/**
 * Line colors for route polylines on the map. Hex equivalents of the
 * `--difficulty-*` design tokens (globals.css) — MapLibre's canvas color
 * parser does not handle `oklch()`, so we keep matching hex values here.
 */
export const DIFFICULTY_LINE_COLOR: Record<DifficultyClass, string> = {
  easy: '#16a34a', // green-600
  moderate: '#d97706', // amber-600
  hard: '#ea580c', // orange-600
  extreme: '#dc2626', // red-600
};

/** Used when a stage has no computed difficulty yet. */
export const DEFAULT_LINE_COLOR = '#2563eb'; // blue-600
