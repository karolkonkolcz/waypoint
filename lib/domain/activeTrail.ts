import type { TrailRow } from '@/lib/db/dexie';
import { addDays } from './stageDate';

/**
 * Pick the trail whose schedule covers `today`. Each stage is one calendar day
 * (by order_index), so a trail is "live" when today falls within
 * [start_date, start_date + (stageCount - 1)] inclusive. When no trail is live
 * (or none has a start_date), fall back to the most recent trail — `trails` is
 * expected pre-sorted newest-first, as trailRepo.findAll returns it.
 *
 * @param stageCountByTrail number of stages (= scheduled days) per trail id
 * @param today ISO date "YYYY-MM-DD"
 */
export function resolveActiveTrail(
  trails: TrailRow[],
  stageCountByTrail: Record<string, number>,
  today: string,
): TrailRow | null {
  if (trails.length === 0) return null;

  for (const trail of trails) {
    if (!trail.start_date) continue;
    const days = stageCountByTrail[trail.id] ?? 0;
    if (days <= 0) continue;
    const end = addDays(trail.start_date, days - 1);
    if (trail.start_date <= today && today <= end) return trail;
  }

  return trails[0] ?? null;
}
