import { db, type TrailRow } from '../dexie';
import { newId, nowIso, enqueue } from './base';

export type CreateTrailInput = Pick<TrailRow,
  'user_id' | 'name' | 'description' | 'start_date' | 'default_pace_kmh' | 'preferences'
>;

export type UpdateTrailInput = Partial<Pick<TrailRow,
  'name' | 'description' | 'start_date' | 'default_pace_kmh' | 'preferences'
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

    await db.trails.put({ ...existing, deleted_at: now, updated_at: now, _dirty: 1 });
    await enqueue({ entity: 'trails', op: 'delete', row_id: id, created_at: now });
  },
};
