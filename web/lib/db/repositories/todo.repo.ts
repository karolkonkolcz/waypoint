import { db, type TodoRow } from '../dexie';
import { newId, nowIso, enqueue } from './base';

export type CreateTodoInput = Pick<TodoRow, 'trail_id' | 'user_id' | 'text'> & {
  stage_id?: string | null;
  date?: string | null;
  order_index?: number;
};

export type UpdateTodoInput = Partial<
  Pick<TodoRow, 'text' | 'done' | 'order_index' | 'stage_id' | 'date'>
>;

export const todoRepo = {
  async findByTrail(trailId: string): Promise<TodoRow[]> {
    return db.todos
      .where('trail_id')
      .equals(trailId)
      .filter((t) => t.deleted_at === null)
      .sortBy('order_index');
  },

  async findByStage(stageId: string): Promise<TodoRow[]> {
    return db.todos
      .where('stage_id')
      .equals(stageId)
      .filter((t) => t.deleted_at === null)
      .sortBy('order_index');
  },

  async add(input: CreateTodoInput): Promise<TodoRow> {
    const now = nowIso();

    // Default order_index appends to the end of the trail's list.
    let order_index = input.order_index;
    if (order_index === undefined) {
      const siblings = await db.todos
        .where('trail_id')
        .equals(input.trail_id)
        .filter((t) => t.deleted_at === null)
        .count();
      order_index = siblings;
    }

    const row: TodoRow = {
      id: newId(),
      trail_id: input.trail_id,
      user_id: input.user_id,
      stage_id: input.stage_id ?? null,
      date: input.date ?? null,
      text: input.text,
      done: false,
      order_index,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      _dirty: 1,
    };
    await db.todos.add(row);
    await enqueue({ entity: 'todos', op: 'upsert', row_id: row.id, created_at: now });
    return row;
  },

  async update(id: string, input: UpdateTodoInput): Promise<TodoRow> {
    const now = nowIso();
    const existing = await db.todos.get(id);
    if (!existing || existing.deleted_at !== null) throw new Error(`Todo ${id} not found`);

    const updated: TodoRow = { ...existing, ...input, updated_at: now, _dirty: 1 };
    await db.todos.put(updated);
    await enqueue({ entity: 'todos', op: 'upsert', row_id: id, created_at: now });
    return updated;
  },

  async toggle(id: string): Promise<TodoRow> {
    const existing = await db.todos.get(id);
    if (!existing || existing.deleted_at !== null) throw new Error(`Todo ${id} not found`);
    return todoRepo.update(id, { done: !existing.done });
  },

  async remove(id: string): Promise<void> {
    const now = nowIso();
    const existing = await db.todos.get(id);
    if (!existing) return;

    await db.todos.put({ ...existing, deleted_at: now, updated_at: now, _dirty: 1 });
    await enqueue({ entity: 'todos', op: 'delete', row_id: id, created_at: now });
  },

  async reorder(trailId: string, orderedIds: string[]): Promise<void> {
    const now = nowIso();
    await db.transaction('rw', db.todos, db.syncQueue, async () => {
      for (let i = 0; i < orderedIds.length; i++) {
        const row = await db.todos.get(orderedIds[i]);
        if (!row || row.trail_id !== trailId) continue;
        const updated = { ...row, order_index: i, updated_at: now, _dirty: 1 as const };
        await db.todos.put(updated);
        await db.syncQueue.add({ entity: 'todos', op: 'upsert', row_id: row.id, created_at: now });
      }
    });
  },
};
