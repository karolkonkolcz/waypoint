import { db, type RouteRow } from '../dexie';
import type { GeoJSONLineString } from '@/lib/domain/geo';
import { newId, nowIso, enqueue } from './base';

export type CreateRouteInput = Pick<RouteRow,
  'trail_id' | 'user_id' | 'geojson' | 'total_distance_km' |
  'total_ascent_m' | 'total_descent_m' | 'elevation_profile' | 'source'
> & { stage_id?: string | null };

export const routeRepo = {
  /** Trail-level route (stage_id = null), e.g. the merged overview geometry. */
  async findByTrail(trailId: string): Promise<RouteRow | undefined> {
    return db.routes
      .where('trail_id')
      .equals(trailId)
      .filter((r) => r.deleted_at === null && (r.stage_id ?? null) === null)
      .first();
  },

  /** Per-stage route — the geometry for a single hiking day. */
  async findByStage(stageId: string): Promise<RouteRow | undefined> {
    return db.routes
      .where('stage_id')
      .equals(stageId)
      .filter((r) => r.deleted_at === null)
      .first();
  },

  async upsert(input: CreateRouteInput): Promise<RouteRow> {
    const now = nowIso();
    const stageId = input.stage_id ?? null;

    // Replace the existing route for the same scope (stage if given, else trail).
    const existing = stageId
      ? await routeRepo.findByStage(stageId)
      : await routeRepo.findByTrail(input.trail_id);

    const row: RouteRow = {
      id: existing?.id ?? newId(),
      ...input,
      stage_id: stageId,
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

  /**
   * Inserts many per-stage routes in one transaction (used by trek import).
   * Each input must carry its stage_id.
   */
  async bulkCreate(inputs: (CreateRouteInput & { stage_id: string })[]): Promise<RouteRow[]> {
    const now = nowIso();
    const rows: RouteRow[] = inputs.map((input) => ({
      id: newId(),
      ...input,
      stage_id: input.stage_id,
      geojson: input.geojson as unknown as GeoJSONLineString,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      _dirty: 1,
    }));

    await db.transaction('rw', db.routes, db.syncQueue, async () => {
      await db.routes.bulkPut(rows);
      for (const row of rows) {
        await db.syncQueue.add({ entity: 'routes', op: 'upsert', row_id: row.id, created_at: now });
      }
    });
    return rows;
  },

  async remove(trailId: string): Promise<void> {
    const now = nowIso();
    const existing = await routeRepo.findByTrail(trailId);
    if (!existing) return;

    await db.routes.put({ ...existing, deleted_at: now, updated_at: now, _dirty: 1 });
    await enqueue({ entity: 'routes', op: 'delete', row_id: existing.id, created_at: now });
  },

  async removeByStage(stageId: string): Promise<void> {
    const now = nowIso();
    const existing = await routeRepo.findByStage(stageId);
    if (!existing) return;

    await db.routes.put({ ...existing, deleted_at: now, updated_at: now, _dirty: 1 });
    await enqueue({ entity: 'routes', op: 'delete', row_id: existing.id, created_at: now });
  },
};
