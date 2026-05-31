import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../dexie';
import { trailRepo } from '../repositories/trail.repo';
import { stageRepo } from '../repositories/stage.repo';

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
