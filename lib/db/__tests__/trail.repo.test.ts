import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../dexie';
import { trailRepo } from '../repositories/trail.repo';

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
    await db.syncQueue.clear(); // reset queue

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
  it('soft-deletes the row', async () => {
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
});
