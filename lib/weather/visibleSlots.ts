// Time-aware trimming for the moving forecast. The cached snapshot covers the
// whole day (start → moving → end); at render time we only want the part that
// still lies ahead — "I don't need to see what already passed".
//
// Pure and side-effect free so it can be unit-tested without React.

/** How many hourly columns the widget shows at once. */
export const MAX_VISIBLE_SLOTS = 9;

/**
 * The slice of the day to display: from the current hour forward (when
 * `nowHour` is given — i.e. we're looking at today), capped to
 * `MAX_VISIBLE_SLOTS`. Past `nowHour` for a future day, shows the start of the
 * window. Slots must be ordered by `hour` ascending.
 */
export function selectVisibleSlots<T extends { hour: number }>(
  slots: T[],
  nowHour: number | null,
): T[] {
  if (slots.length === 0) return slots;
  const start = nowHour != null ? Math.max(slots[0].hour, nowHour) : slots[0].hour;
  const end = start + MAX_VISIBLE_SLOTS - 1;
  const visible = slots.filter((s) => s.hour >= start && s.hour <= end);
  // If "now" is already past the whole window, keep the tail so the card never
  // renders empty (e.g. a late-evening glance at a short day).
  return visible.length ? visible : slots.slice(-MAX_VISIBLE_SLOTS);
}
