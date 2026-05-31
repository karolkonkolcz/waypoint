import { db, type WeatherRow } from '../dexie';
import { newId, nowIso } from './base';
import type { WeatherSnapshot } from '@/lib/weather/forecast';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface SaveWeatherInput {
  trail_id: string;
  stage_id: string;
  user_id: string;
  lat: number;
  lon: number;
  date: string; // YYYY-MM-DD
  snapshot: WeatherSnapshot;
}

export const weatherRepo = {
  async findByStage(stageId: string): Promise<WeatherRow | undefined> {
    return db.weather
      .where('stage_id')
      .equals(stageId)
      .filter((r) => r.deleted_at === null)
      .first();
  },

  async save(input: SaveWeatherInput): Promise<WeatherRow> {
    const now = nowIso();
    const existing = await weatherRepo.findByStage(input.stage_id);
    const row: WeatherRow = {
      id: existing?.id ?? newId(),
      trail_id: input.trail_id,
      stage_id: input.stage_id,
      user_id: input.user_id,
      latitude: input.lat,
      longitude: input.lon,
      forecast_json: input.snapshot,
      valid_from: `${input.date}T00:00:00Z`,
      valid_to: `${input.date}T23:59:59Z`,
      fetched_at: now,
      created_at: existing?.created_at ?? now,
      updated_at: now,
      deleted_at: null,
      _dirty: 0, // weather is derived cache — not pushed to Supabase
    };
    await db.weather.put(row);
    return row;
  },

  isFresh(row: WeatherRow): boolean {
    return Date.now() - new Date(row.fetched_at).getTime() < CACHE_TTL_MS;
  },
};
