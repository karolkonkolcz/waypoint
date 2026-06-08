/**
 * Adds `days` calendar days to an ISO date (YYYY-MM-DD); returns an ISO date.
 * Arithmetic is done in UTC so it never drifts a day in a +UTC timezone (where
 * local midnight is the previous day in UTC).
 */
export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

/**
 * The calendar date of a stage. An explicit per-stage `date` always wins; when
 * absent, it derives from the trail start date plus the stage's day offset
 * (order_index — one stage is one day). Returns null when neither is available.
 */
export function stageDate(
  stage: { date: string | null; order_index: number },
  trailStartDate: string | null,
): string | null {
  if (stage.date) return stage.date;
  if (trailStartDate) return addDays(trailStartDate, stage.order_index);
  return null;
}

/** Short, human display of an ISO date, e.g. "Mon 1 Jun". Date-only, no TZ shift. */
export function formatStageDate(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('cs-CZ', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}
