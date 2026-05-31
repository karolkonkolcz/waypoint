import { db, type RouteRow } from '../dexie';
import type { GeoJSONLineString } from '@/lib/domain/geo';
import { newId, nowIso, enqueue } from './base';

export type CreateRouteInput = Pick<RouteRow,
  'trail_id' | 'user_id' | 'geojson' | 'total_distance_km' |
  'total_ascent_m' | 'total_descent_m' | 'elevation_profile' | 'source'
>;

export const routeRepo = {
  async findByTrail(trailId: string): Promise<RouteRow | undefined> {
    return db.routes
      .where('trail_id')
      .equals(trailId)
      .filter((r) => r.deleted_at === null)
      .first();
  },

  async upsert(input: CreateRouteInput): Promise<RouteRow> {
    const now = nowIso();

    // One route per trail — replace existing if present
    const existing = await routeRepo.findByTrail(input.trail_id);

    const row: RouteRow = {
      id: existing?.id ?? newId(),
      ...input,
      geojson: input.geojson as unknown as GeoJSONLineString,
      created_at: existing?.created_at ?? now,
      updated_at: now,
      deleted_at: null,
      _dirty: 1,
    };

    await db.routes.put(row);
    await enqueue({ entity: 'routes', op: 'upsert', row_id: row.id, created_at: now });
    return row;
  },

  async remove(trailId: string): Promise<void> {
    const now = nowIso();
    const existing = await routeRepo.findByTrail(trailId);
    if (!existing) return;

    await db.routes.put({ ...existing, deleted_at: now, updated_at: now, _dirty: 1 });
    await enqueue({ entity: 'routes', op: 'delete', row_id: existing.id, created_at: now });
  },
};
