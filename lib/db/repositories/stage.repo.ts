import { db, type StageRow } from '../dexie';
import { scoreDifficulty } from '@/lib/domain/difficulty';
import { newId, nowIso, enqueue } from './base';

export type CreateStageInput = Pick<StageRow,
  'trail_id' | 'user_id' | 'title' | 'order_index' | 'distance_km' |
  'ascent_m' | 'descent_m' | 'start_distance_km' | 'end_distance_km' | 'notes'
>;

export type UpdateStageInput = Partial<Pick<StageRow,
  'title' | 'order_index' | 'distance_km' | 'ascent_m' | 'descent_m' |
  'start_distance_km' | 'end_distance_km' | 'notes'
>>;

function withDifficulty<T extends Pick<StageRow, 'distance_km' | 'ascent_m' | 'descent_m'>>(
  row: T,
): T & Pick<StageRow, 'difficulty_score' | 'difficulty_class'> {
  const { score, klass } = scoreDifficulty({
    distanceKm: row.distance_km,
    ascentM: row.ascent_m,
    descentM: row.descent_m,
  });
  return { ...row, difficulty_score: score, difficulty_class: klass };
}

export const stageRepo = {
  async findByTrail(trailId: string): Promise<StageRow[]> {
    return db.stages
      .where('trail_id')
      .equals(trailId)
      .filter((s) => s.deleted_at === null)
      .sortBy('order_index');
  },

  async findById(id: string): Promise<StageRow | undefined> {
    const row = await db.stages.get(id);
    return row?.deleted_at === null ? row : undefined;
  },

  async create(input: CreateStageInput): Promise<StageRow> {
    const now = nowIso();
    const base: StageRow = {
      id: newId(),
      ...input,
      difficulty_score: null,
      difficulty_class: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      _dirty: 1,
    };
    const row = withDifficulty(base);
    await db.stages.add(row);
    await enqueue({ entity: 'stages', op: 'upsert', row_id: row.id, created_at: now });
    return row;
  },

  async update(id: string, input: UpdateStageInput): Promise<StageRow> {
    const now = nowIso();
    const existing = await db.stages.get(id);
    if (!existing || existing.deleted_at !== null) throw new Error(`Stage ${id} not found`);

    const merged = { ...existing, ...input, updated_at: now, _dirty: 1 as const };
    const updated = withDifficulty(merged);
    await db.stages.put(updated);
    await enqueue({ entity: 'stages', op: 'upsert', row_id: id, created_at: now });
    return updated;
  },

  async remove(id: string): Promise<void> {
    const now = nowIso();
    const existing = await db.stages.get(id);
    if (!existing) return;

    await db.stages.put({ ...existing, deleted_at: now, updated_at: now, _dirty: 1 });
    await enqueue({ entity: 'stages', op: 'delete', row_id: id, created_at: now });
  },

  async reorder(trailId: string, orderedIds: string[]): Promise<void> {
    const now = nowIso();
    await db.transaction('rw', db.stages, db.syncQueue, async () => {
      for (let i = 0; i < orderedIds.length; i++) {
        const row = await db.stages.get(orderedIds[i]);
        if (!row || row.trail_id !== trailId) continue;
        const updated = { ...row, order_index: i, updated_at: now, _dirty: 1 as const };
        await db.stages.put(updated);
        await db.syncQueue.add({ entity: 'stages', op: 'upsert', row_id: row.id, created_at: now });
      }
    });
  },
};
