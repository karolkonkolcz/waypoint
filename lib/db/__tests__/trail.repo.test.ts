import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../dexie';
import { trailRepo } from '../repositories/trail.repo';
import { stageRepo } from '../repositories/stage.repo';
import { routeRepo } from '../repositories/route.repo';

const USER = 'user-001';

const BASE: Parameters<typeof trailRepo.create>[0] = {
  user_id: USER,
  name: 'PCT Southbound',
  description: null,
  start_date: '2025-06-01',
  default_pace_kmh: 4.0,
  preferences: {},
};

beforeEach(async () => {
  await db.trails.clear();
  await db.stages.clear();
  await db.routes.clear();
  await db.waypoints.clear();
  await db.weather.clear();
  await db.alerts.clear();
  await db.syncQueue.clear();
});

describe('trailRepo.create', () => {
  it('adds a row to Dexie with _dirty=1', async () => {
    const trail = await trailRepo.create(BASE);
    const stored = await db.trails.get(trail.id);
    expect(stored).toBeDefined();
    expect(stored!._dirty).toBe(1);
    expect(stored!.deleted_at).toBeNull();
  });

  it('enqueues a sync op', async () => {
    const trail = await trailRepo.create(BASE);
    const ops = await db.syncQueue.toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe('upsert');
    expect(ops[0].row_id).toBe(trail.id);
  });
});

describe('trailRepo.findAll', () => {
  it('returns only non-deleted rows for the user', async () => {
    const t1 = await trailRepo.create(BASE);
    await trailRepo.create({ ...BASE, name: 'AT' });
    await trailRepo.remove(t1.id);

    const rows = await trailRepo.findAll(USER);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('AT');
  });

  it('does not return rows for other users', async () => {
    await trailRepo.create(BASE);
    const rows = await trailRepo.findAll('other-user');
    expect(rows).toHaveLength(0);
  });
});

describe('trailRepo.update', () => {
  it('merges fields and marks dirty', async () => {
    const trail = await trailRepo.create(BASE);
    await db.syncQueue.clear();

    const updated = await trailRepo.update(trail.id, { name: 'New Name' });
    expect(updated.name).toBe('New Name');
    expect(updated._dirty).toBe(1);

    const ops = await db.syncQueue.toArray();
    expect(ops).toHaveLength(1);
  });

  it('throws on unknown id', async () => {
    await expect(trailRepo.update('nonexistent', { name: 'x' })).rejects.toThrow();
  });
});

describe('trailRepo.remove', () => {
  it('soft-deletes the trail row', async () => {
    const trail = await trailRepo.create(BASE);
    await trailRepo.remove(trail.id);

    const row = await db.trails.get(trail.id);
    expect(row!.deleted_at).not.toBeNull();
  });

  it('findById returns undefined after removal', async () => {
    const trail = await trailRepo.create(BASE);
    await trailRepo.remove(trail.id);
    expect(await trailRepo.findById(trail.id)).toBeUndefined();
  });

  it('cascade soft-deletes stages', async () => {
    const trail = await trailRepo.create(BASE);
    await stageRepo.create({
      trail_id: trail.id, user_id: USER, title: 'Day 1', order_index: 0,
      distance_km: 20, ascent_m: 500, descent_m: 300,
      start_distance_km: null, end_distance_km: null, notes: null,
    });

    await db.syncQueue.clear();
    await trailRepo.remove(trail.id);

    const stages = await db.stages.where('trail_id').equals(trail.id).toArray();
    expect(stages.every((s) => s.deleted_at !== null)).toBe(true);
  });

  it('cascade soft-deletes routes', async () => {
    const trail = await trailRepo.create(BASE);
    const stage = await stageRepo.create({
      trail_id: trail.id, user_id: USER, title: 'Day 1', order_index: 0,
      distance_km: 15, ascent_m: 300, descent_m: 200,
      start_distance_km: null, end_distance_km: null, notes: null,
    });
    await routeRepo.upsert({
      trail_id: trail.id, user_id: USER, stage_id: stage.id,
      geojson: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
      total_distance_km: 15, total_ascent_m: 300, total_descent_m: 200,
      elevation_profile: [], source: 'manual',
    });

    await db.syncQueue.clear();
    await trailRepo.remove(trail.id);

    const routes = await db.routes.where('trail_id').equals(trail.id).toArray();
    expect(routes.every((r) => r.deleted_at !== null)).toBe(true);
  });

  it('enqueues delete ops for trail, stages, and routes', async () => {
    const trail = await trailRepo.create(BASE);
    const stage = await stageRepo.create({
      trail_id: trail.id, user_id: USER, title: 'Day 1', order_index: 0,
      distance_km: 10, ascent_m: 100, descent_m: 100,
      start_distance_km: null, end_distance_km: null, notes: null,
    });
    await routeRepo.upsert({
      trail_id: trail.id, user_id: USER, stage_id: stage.id,
      geojson: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
      total_distance_km: 10, total_ascent_m: 100, total_descent_m: 100,
      elevation_profile: [], source: 'manual',
    });

    await db.syncQueue.clear();
    await trailRepo.remove(trail.id);

    const ops = await db.syncQueue.toArray();
    const deleteOps = ops.filter((o) => o.op === 'delete');
    expect(deleteOps.some((o) => o.entity === 'trails' && o.row_id === trail.id)).toBe(true);
    expect(deleteOps.some((o) => o.entity === 'stages' && o.row_id === stage.id)).toBe(true);
  });
});
