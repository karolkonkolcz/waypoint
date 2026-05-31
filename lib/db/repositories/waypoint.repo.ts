import { db, type WaypointRow } from '../dexie';
import { newId, nowIso, enqueue } from './base';

export type CreateWaypointInput = Pick<WaypointRow,
  'trail_id' | 'user_id' | 'name' | 'type' | 'latitude' | 'longitude' |
  'elevation_m' | 'distance_along_route_km' | 'description'
>;

export type UpdateWaypointInput = Partial<Pick<WaypointRow,
  'name' | 'type' | 'latitude' | 'longitude' |
  'elevation_m' | 'distance_along_route_km' | 'description'
>>;

export const waypointRepo = {
  async findByTrail(trailId: string): Promise<WaypointRow[]> {
    return db.waypoints
      .where('trail_id')
      .equals(trailId)
      .filter((w) => w.deleted_at === null)
      .toArray();
  },

  async findByTrailAndType(
    trailId: string,
    type: WaypointRow['type'],
  ): Promise<WaypointRow[]> {
    return db.waypoints
      .where('[trail_id+type]')
      .equals([trailId, type])
      .filter((w) => w.deleted_at === null)
      .toArray();
  },

  async findById(id: string): Promise<WaypointRow | undefined> {
    const row = await db.waypoints.get(id);
    return row?.deleted_at === null ? row : undefined;
  },

  async create(input: CreateWaypointInput): Promise<WaypointRow> {
    const now = nowIso();
    const row: WaypointRow = {
      id: newId(),
      ...input,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      _dirty: 1,
    };
    await db.waypoints.add(row);
    await enqueue({ entity: 'waypoints', op: 'upsert', row_id: row.id, created_at: now });
    return row;
  },

  async update(id: string, input: UpdateWaypointInput): Promise<WaypointRow> {
    const now = nowIso();
    const existing = await db.waypoints.get(id);
    if (!existing || existing.deleted_at !== null) throw new Error(`Waypoint ${id} not found`);

    const updated: WaypointRow = { ...existing, ...input, updated_at: now, _dirty: 1 };
    await db.waypoints.put(updated);
    await enqueue({ entity: 'waypoints', op: 'upsert', row_id: id, created_at: now });
    return updated;
  },

  async remove(id: string): Promise<void> {
    const now = nowIso();
    const existing = await db.waypoints.get(id);
    if (!existing) return;

    await db.waypoints.put({ ...existing, deleted_at: now, updated_at: now, _dirty: 1 });
    await enqueue({ entity: 'waypoints', op: 'delete', row_id: id, created_at: now });
  },
};
