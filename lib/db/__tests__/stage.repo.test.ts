import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../dexie';
import { trailRepo } from '../repositories/trail.repo';
import { stageRepo } from '../repositories/stage.repo';
import { routeRepo } from '../repositories/route.repo';

const USER = 'user-001';

async function makeTrail() {
  return trailRepo.create({
    user_id: USER,
    name: 'Test Trail',
    description: null,
    start_date: null,
    default_pace_kmh: 4,
    preferences: {},
  });
}

beforeEach(async () => {
  await db.trails.clear();
  await db.stages.clear();
  await db.routes.clear();
  await db.weather.clear();
  await db.syncQueue.clear();
});

describe('stageRepo.create', () => {
  it('computes difficulty on create', async () => {
    const trail = await makeTrail();
    const stage = await stageRepo.create({
      trail_id: trail.id,
      user_id: USER,
      title: 'Day 1',
      order_index: 0,
      distance_km: 20,
      ascent_m: 800,
      descent_m: 400,
      start_distance_km: null,
      end_distance_km: null,
      notes: null,
    });
    expect(stage.difficulty_class).not.toBeNull();
    expect(stage.difficulty_score).toBeGreaterThan(0);
  });
});

describe('stageRepo.insertAt', () => {
  async function makeStages(trail: Awaited<ReturnType<typeof makeTrail>>, count: number) {
    const stages = [];
    for (let i = 0; i < count; i++) {
      stages.push(await stageRepo.create({
        trail_id: trail.id, user_id: USER, title: `Day ${i + 1}`, order_index: i,
        distance_km: 15, ascent_m: 300, descent_m: 200,
        start_distance_km: null, end_distance_km: null, notes: null,
      }));
    }
    return stages;
  }

  it('inserts at position 0 and renumbers', async () => {
    const trail = await makeTrail();
    const [s1, s2] = await makeStages(trail, 2);
    await db.syncQueue.clear();

    const inserted = await stageRepo.insertAt({
      trail_id: trail.id, user_id: USER, title: 'New First',
      distance_km: 10, ascent_m: 100, descent_m: 100,
      start_distance_km: null, end_distance_km: null, notes: null,
    }, 0);

    const all = await stageRepo.findByTrail(trail.id);
    expect(all[0].id).toBe(inserted.id);
    expect(all[0].order_index).toBe(0);
    expect(all[1].id).toBe(s1.id);
    expect(all[1].order_index).toBe(1);
    expect(all[2].id).toBe(s2.id);
    expect(all[2].order_index).toBe(2);
  });

  it('inserts in the middle', async () => {
    const trail = await makeTrail();
    const [s1, s2, s3] = await makeStages(trail, 3);
    await db.syncQueue.clear();

    const inserted = await stageRepo.insertAt({
      trail_id: trail.id, user_id: USER, title: 'Middle',
      distance_km: 12, ascent_m: 200, descent_m: 150,
      start_distance_km: null, end_distance_km: null, notes: null,
    }, 2);

    const all = await stageRepo.findByTrail(trail.id);
    expect(all.map((s) => s.id)).toEqual([s1.id, s2.id, inserted.id, s3.id]);
    all.forEach((s, i) => expect(s.order_index).toBe(i));
  });

  it('appends when position >= count', async () => {
    const trail = await makeTrail();
    const [s1, s2] = await makeStages(trail, 2);

    const appended = await stageRepo.insertAt({
      trail_id: trail.id, user_id: USER, title: 'Last',
      distance_km: 8, ascent_m: 50, descent_m: 50,
      start_distance_km: null, end_distance_km: null, notes: null,
    }, 99);

    const all = await stageRepo.findByTrail(trail.id);
    expect(all[2].id).toBe(appended.id);
    expect(all.map((s) => s.id)).toEqual([s1.id, s2.id, appended.id]);
  });

  it('enqueues upsert ops for all affected stages', async () => {
    const trail = await makeTrail();
    await makeStages(trail, 2);
    await db.syncQueue.clear();

    await stageRepo.insertAt({
      trail_id: trail.id, user_id: USER, title: 'Inserted',
      distance_km: 10, ascent_m: 100, descent_m: 100,
      start_distance_km: null, end_distance_km: null, notes: null,
    }, 1);

    const ops = await db.syncQueue.toArray();
    // 3 stages total (2 existing + 1 new) all get upsert ops
    expect(ops.filter((o) => o.entity === 'stages' && o.op === 'upsert')).toHaveLength(3);
  });

  it('computes difficulty for the new stage', async () => {
    const trail = await makeTrail();

    const inserted = await stageRepo.insertAt({
      trail_id: trail.id, user_id: USER, title: 'Hard Day',
      distance_km: 30, ascent_m: 1500, descent_m: 1000,
      start_distance_km: null, end_distance_km: null, notes: null,
    }, 0);

    expect(inserted.difficulty_class).not.toBeNull();
    expect(inserted.difficulty_score).toBeGreaterThan(0);
  });
});

describe('transit stages', () => {
  it('create zeroes metrics and leaves difficulty null', async () => {
    const trail = await makeTrail();
    const stage = await stageRepo.create({
      trail_id: trail.id,
      user_id: USER,
      title: 'Arrival day',
      order_index: 0,
      stage_type: 'transit',
    });

    expect(stage.stage_type).toBe('transit');
    expect(stage.distance_km).toBe(0);
    expect(stage.ascent_m).toBe(0);
    expect(stage.descent_m).toBe(0);
    expect(stage.difficulty_score).toBeNull();
    expect(stage.difficulty_class).toBeNull();
    expect(stage.timeline).toEqual([]);
    expect(stage.location_lat).toBeNull();
  });

  it('defaults stage_type to trek so existing callers are unchanged', async () => {
    const trail = await makeTrail();
    const stage = await stageRepo.create({
      trail_id: trail.id, user_id: USER, title: 'Day 1', order_index: 0,
      distance_km: 20, ascent_m: 800, descent_m: 400,
      start_distance_km: null, end_distance_km: null, notes: null,
    });
    expect(stage.stage_type).toBe('trek');
    expect(stage.difficulty_class).not.toBeNull();
  });

  it('insertAt supports transit days alongside trek days', async () => {
    const trail = await makeTrail();
    const trek = await stageRepo.create({
      trail_id: trail.id, user_id: USER, title: 'Day 1', order_index: 0,
      distance_km: 20, ascent_m: 800, descent_m: 400,
      start_distance_km: null, end_distance_km: null, notes: null,
    });

    const transit = await stageRepo.insertAt(
      { trail_id: trail.id, user_id: USER, title: 'Travel day', stage_type: 'transit', notes: null },
      0,
    );

    const all = await stageRepo.findByTrail(trail.id);
    expect(all.map((s) => s.id)).toEqual([transit.id, trek.id]);
    expect(all[0].stage_type).toBe('transit');
    expect(all[0].distance_km).toBe(0);
  });

  it('update persists timeline + location anchor', async () => {
    const trail = await makeTrail();
    const stage = await stageRepo.create({
      trail_id: trail.id, user_id: USER, title: 'Arrival', order_index: 0,
      stage_type: 'transit',
    });

    const updated = await stageRepo.update(stage.id, {
      timeline: [
        { id: 'm1', time: '08:00', title: 'Bus to airport', kind: 'bus', location: null, notes: null },
      ],
      location_lat: 42.7028,
      location_lon: 9.4503,
      location_name: 'Bastia',
    });

    expect(updated.timeline).toHaveLength(1);
    expect(updated.timeline[0].title).toBe('Bus to airport');
    expect(updated.location_name).toBe('Bastia');
    // Difficulty stays null for transit even after update.
    expect(updated.difficulty_class).toBeNull();
  });
});

describe('stageRepo.remove', () => {
  it('soft-deletes the stage', async () => {
    const trail = await makeTrail();
    const stage = await stageRepo.create({
      trail_id: trail.id, user_id: USER, title: 'Day 1', order_index: 0,
      distance_km: 15, ascent_m: 300, descent_m: 200,
      start_distance_km: null, end_distance_km: null, notes: null,
    });

    await stageRepo.remove(stage.id);

    const row = await db.stages.get(stage.id);
    expect(row!.deleted_at).not.toBeNull();
    expect(await stageRepo.findById(stage.id)).toBeUndefined();
  });

  it('cascade soft-deletes the stage route', async () => {
    const trail = await makeTrail();
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
    await stageRepo.remove(stage.id);

    const routes = await db.routes.where('stage_id').equals(stage.id).toArray();
    expect(routes.every((r) => r.deleted_at !== null)).toBe(true);

    const ops = await db.syncQueue.toArray();
    expect(ops.some((o) => o.entity === 'routes' && o.op === 'delete')).toBe(true);
    expect(ops.some((o) => o.entity === 'stages' && o.op === 'delete')).toBe(true);
  });

  it('re-packs surviving siblings into contiguous order_index', async () => {
    const trail = await makeTrail();
    const make = (i: number) => stageRepo.create({
      trail_id: trail.id, user_id: USER, title: `Day ${i}`, order_index: i,
      distance_km: 15, ascent_m: 300, descent_m: 200,
      start_distance_km: null, end_distance_km: null, notes: null,
    });
    const s0 = await make(0);
    const s1 = await make(1);
    const s2 = await make(2);
    const s3 = await make(3);
    await db.syncQueue.clear();

    await stageRepo.remove(s1.id);

    const all = await stageRepo.findByTrail(trail.id);
    expect(all.map((s) => s.id)).toEqual([s0.id, s2.id, s3.id]);
    all.forEach((s, i) => expect(s.order_index).toBe(i));

    // Only the shifted survivors (s2, s3) get re-synced; the untouched s0 does not.
    const upserts = await db.syncQueue
      .filter((o) => o.entity === 'stages' && o.op === 'upsert')
      .toArray();
    expect(upserts.map((o) => o.row_id).sort()).toEqual([s2.id, s3.id].sort());
  });
});

describe('stageRepo.reorder', () => {
  it('updates order_index for each stage', async () => {
    const trail = await makeTrail();
    const s1 = await stageRepo.create({
      trail_id: trail.id, user_id: USER, title: 'A', order_index: 0,
      distance_km: 15, ascent_m: 300, descent_m: 200,
      start_distance_km: null, end_distance_km: null, notes: null,
    });
    const s2 = await stageRepo.create({
      trail_id: trail.id, user_id: USER, title: 'B', order_index: 1,
      distance_km: 20, ascent_m: 500, descent_m: 300,
      start_distance_km: null, end_distance_km: null, notes: null,
    });

    await stageRepo.reorder(trail.id, [s2.id, s1.id]);

    const rows = await stageRepo.findByTrail(trail.id);
    expect(rows[0].id).toBe(s2.id);
    expect(rows[0].order_index).toBe(0);
    expect(rows[1].id).toBe(s1.id);
    expect(rows[1].order_index).toBe(1);
  });
});
