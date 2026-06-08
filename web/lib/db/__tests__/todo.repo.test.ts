import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../dexie';
import { trailRepo } from '../repositories/trail.repo';
import { todoRepo } from '../repositories/todo.repo';

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
  await db.todos.clear();
  await db.syncQueue.clear();
});

describe('todoRepo.add', () => {
  it('creates a todo and enqueues an upsert', async () => {
    const trail = await makeTrail();
    await db.syncQueue.clear();
    const todo = await todoRepo.add({ trail_id: trail.id, user_id: USER, text: 'Refill water' });

    expect(todo.text).toBe('Refill water');
    expect(todo.done).toBe(false);
    expect(todo.order_index).toBe(0);
    expect(todo.stage_id).toBeNull();

    const ops = await db.syncQueue.toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ entity: 'todos', op: 'upsert', row_id: todo.id });
  });

  it('appends order_index to the end of the trail list', async () => {
    const trail = await makeTrail();
    const a = await todoRepo.add({ trail_id: trail.id, user_id: USER, text: 'A' });
    const b = await todoRepo.add({ trail_id: trail.id, user_id: USER, text: 'B' });
    expect(a.order_index).toBe(0);
    expect(b.order_index).toBe(1);
  });

  it('pins to a stage when given a stage_id', async () => {
    const trail = await makeTrail();
    const todo = await todoRepo.add({
      trail_id: trail.id, user_id: USER, text: 'Buy permit', stage_id: 'stage-9',
    });
    const byStage = await todoRepo.findByStage('stage-9');
    expect(byStage.map((t) => t.id)).toEqual([todo.id]);
  });
});

describe('todoRepo.findByTrail', () => {
  it('returns only non-deleted todos in order', async () => {
    const trail = await makeTrail();
    const a = await todoRepo.add({ trail_id: trail.id, user_id: USER, text: 'A' });
    const b = await todoRepo.add({ trail_id: trail.id, user_id: USER, text: 'B' });
    await todoRepo.remove(a.id);

    const list = await todoRepo.findByTrail(trail.id);
    expect(list.map((t) => t.id)).toEqual([b.id]);
  });
});

describe('todoRepo.toggle', () => {
  it('flips done and marks the row dirty', async () => {
    const trail = await makeTrail();
    const todo = await todoRepo.add({ trail_id: trail.id, user_id: USER, text: 'A' });
    await db.syncQueue.clear();

    const toggled = await todoRepo.toggle(todo.id);
    expect(toggled.done).toBe(true);
    expect(toggled._dirty).toBe(1);

    const back = await todoRepo.toggle(todo.id);
    expect(back.done).toBe(false);

    const ops = await db.syncQueue.toArray();
    expect(ops.every((o) => o.entity === 'todos' && o.op === 'upsert')).toBe(true);
  });
});

describe('todoRepo.remove', () => {
  it('soft-deletes and enqueues a delete op', async () => {
    const trail = await makeTrail();
    const todo = await todoRepo.add({ trail_id: trail.id, user_id: USER, text: 'A' });
    await db.syncQueue.clear();

    await todoRepo.remove(todo.id);

    const row = await db.todos.get(todo.id);
    expect(row!.deleted_at).not.toBeNull();
    expect(await todoRepo.findByTrail(trail.id)).toHaveLength(0);

    const ops = await db.syncQueue.toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ entity: 'todos', op: 'delete', row_id: todo.id });
  });
});

describe('todoRepo.reorder', () => {
  it('rewrites order_index to match the given order', async () => {
    const trail = await makeTrail();
    const a = await todoRepo.add({ trail_id: trail.id, user_id: USER, text: 'A' });
    const b = await todoRepo.add({ trail_id: trail.id, user_id: USER, text: 'B' });
    const c = await todoRepo.add({ trail_id: trail.id, user_id: USER, text: 'C' });

    await todoRepo.reorder(trail.id, [c.id, a.id, b.id]);

    const list = await todoRepo.findByTrail(trail.id);
    expect(list.map((t) => t.id)).toEqual([c.id, a.id, b.id]);
    list.forEach((t, i) => expect(t.order_index).toBe(i));
  });
});
