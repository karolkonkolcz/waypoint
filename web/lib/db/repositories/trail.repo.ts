import { db, type TrailRow } from '../dexie';
import { newId, nowIso, enqueue } from './base';

export type CreateTrailInput = Pick<TrailRow,
  'user_id' | 'name' | 'description' | 'start_date' | 'default_pace_kmh' | 'preferences'
> & { cover_image_url?: string | null };

export type UpdateTrailInput = Partial<Pick<TrailRow,
  'name' | 'description' | 'start_date' | 'default_pace_kmh' | 'preferences' | 'cover_image_url'
>>;


export const trailRepo = {
  async findAll(userId: string): Promise<TrailRow[]> {
    return db.trails
      .where('user_id')
      .equals(userId)
      .filter((t) => t.deleted_at === null)
      .sortBy('updated_at')
      .then((rows) => rows.reverse());
  },

  async findById(id: string): Promise<TrailRow | undefined> {
    const row = await db.trails.get(id);
    return row?.deleted_at === null ? row : undefined;
  },

  async create(input: CreateTrailInput): Promise<TrailRow> {
    const now = nowIso();
    const row: TrailRow = {
      id: newId(),
      cover_image_url: null,
      ...input,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      _dirty: 1,
    };
    await db.trails.add(row);
    await enqueue({ entity: 'trails', op: 'upsert', row_id: row.id, created_at: now });
    return row;
  },

  async update(id: string, input: UpdateTrailInput): Promise<TrailRow> {
    const now = nowIso();
    const existing = await db.trails.get(id);
    if (!existing || existing.deleted_at !== null) throw new Error(`Trail ${id} not found`);

    const updated: TrailRow = { ...existing, ...input, updated_at: now, _dirty: 1 };
    await db.trails.put(updated);
    await enqueue({ entity: 'trails', op: 'upsert', row_id: id, created_at: now });
    return updated;
  },

  async remove(id: string): Promise<void> {
    const now = nowIso();
    const existing = await db.trails.get(id);
    if (!existing) return;

    await db.transaction('rw',
      [db.trails, db.stages, db.routes, db.waypoints, db.weather, db.alerts, db.syncQueue],
      async () => {
        const stages = await db.stages.where('trail_id').equals(id)
          .filter((s) => s.deleted_at === null).toArray();
        for (const s of stages) {
          await db.stages.put({ ...s, deleted_at: now, updated_at: now, _dirty: 1 });
          await db.syncQueue.add({ entity: 'stages', op: 'delete', row_id: s.id, created_at: now });
        }

        const routes = await db.routes.where('trail_id').equals(id)
          .filter((r) => r.deleted_at === null).toArray();
        for (const r of routes) {
          await db.routes.put({ ...r, deleted_at: now, updated_at: now, _dirty: 1 });
          await db.syncQueue.add({ entity: 'routes', op: 'delete', row_id: r.id, created_at: now });
        }

        const waypoints = await db.waypoints.where('trail_id').equals(id)
          .filter((w) => w.deleted_at === null).toArray();
        for (const w of waypoints) {
          await db.waypoints.put({ ...w, deleted_at: now, updated_at: now, _dirty: 1 });
          await db.syncQueue.add({ entity: 'waypoints', op: 'delete', row_id: w.id, created_at: now });
        }

        await db.weather.where('trail_id').equals(id).delete();
        await db.alerts.delete(id);

        await db.trails.put({ ...existing, deleted_at: now, updated_at: now, _dirty: 1 });
        await db.syncQueue.add({ entity: 'trails', op: 'delete', row_id: id, created_at: now });
      },
    );
  },
};
