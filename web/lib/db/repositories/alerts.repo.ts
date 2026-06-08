import { db, type AlertCacheRow } from '../dexie';
import { nowIso } from './base';
import type { WeatherAlert } from '@/lib/alerts/meteoalarm';

// Alerts are a derived cache (like weather): stored in Dexie only, never synced
// to Supabase. One row per trail — alerts are country-level, so the whole trail
// shares them. Offline, we serve the last snapshot and surface its age.
const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

export const alertsRepo = {
  async findByTrail(trailId: string): Promise<AlertCacheRow | undefined> {
    return db.alerts.get(trailId);
  },

  async save(
    trailId: string,
    country: string | null,
    alerts: WeatherAlert[],
  ): Promise<AlertCacheRow> {
    const row: AlertCacheRow = {
      trail_id: trailId,
      country,
      alerts,
      fetched_at: nowIso(),
    };
    await db.alerts.put(row);
    return row;
  },

  isFresh(row: AlertCacheRow): boolean {
    return Date.now() - new Date(row.fetched_at).getTime() < CACHE_TTL_MS;
  },
};
