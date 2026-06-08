import { db, type StageRow, type StageType, type Milestone } from '../dexie';
import { scoreDifficulty } from '@/lib/domain/difficulty';
import { newId, nowIso, enqueue } from './base';

// Trek-specific fields are optional in the input; transit stages omit them and
// get zeroed metrics. stage_type defaults to 'trek' so existing callers (GPX
// import, new-trail form, insert UI) need no changes.
export type CreateStageInput = Pick<StageRow, 'trail_id' | 'user_id' | 'title' | 'order_index'> & {
  stage_type?: StageType;
  date?: string | null;
  distance_km?: number;
  ascent_m?: number;
  descent_m?: number;
  start_distance_km?: number | null;
  end_distance_km?: number | null;
  notes?: string | null;
  timeline?: Milestone[];
  location_lat?: number | null;
  location_lon?: number | null;
  location_name?: string | null;
};

export type InsertStageInput = Omit<CreateStageInput, 'order_index'>;

export type UpdateStageInput = Partial<Pick<StageRow,
  'title' | 'order_index' | 'date' | 'distance_km' | 'ascent_m' | 'descent_m' |
  'start_distance_km' | 'end_distance_km' | 'notes' |
  'timeline' | 'location_lat' | 'location_lon' | 'location_name'
>>;

const DIFFICULTY = ['difficulty_score', 'difficulty_class'] as const;

/** Difficulty is meaningful only for trek days; transit days carry null. */
function withDifficulty<T extends Pick<StageRow, 'stage_type' | 'distance_km' | 'ascent_m' | 'descent_m'>>(
  row: T,
): T & Pick<StageRow, 'difficulty_score' | 'difficulty_class'> {
  if (row.stage_type === 'transit') {
    return { ...row, difficulty_score: null, difficulty_class: null };
  }
  const { score, klass } = scoreDifficulty({
    distanceKm: row.distance_km,
    ascentM: row.ascent_m,
    descentM: row.descent_m,
  });
  return { ...row, difficulty_score: score, difficulty_class: klass };
}

/** Fill defaults so both trek and transit inputs become a complete StageRow body. */
function normalize(
  input: CreateStageInput | InsertStageInput,
): Omit<StageRow, 'id' | 'order_index' | typeof DIFFICULTY[number] | keyof Sync> {
  const stage_type = input.stage_type ?? 'trek';
  const isTransit = stage_type === 'transit';
  return {
    trail_id: input.trail_id,
    user_id: input.user_id,
    title: input.title,
    date: input.date ?? null,
    stage_type,
    distance_km: isTransit ? 0 : input.distance_km ?? 0,
    ascent_m: isTransit ? 0 : input.ascent_m ?? 0,
    descent_m: isTransit ? 0 : input.descent_m ?? 0,
    start_distance_km: isTransit ? null : input.start_distance_km ?? null,
    end_distance_km: isTransit ? null : input.end_distance_km ?? null,
    notes: input.notes ?? null,
    timeline: input.timeline ?? [],
    location_lat: input.location_lat ?? null,
    location_lon: input.location_lon ?? null,
    location_name: input.location_name ?? null,
  };
}

type Sync = { created_at: string; updated_at: string; deleted_at: string | null; _dirty: 0 | 1 };

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
      ...normalize(input),
      order_index: input.order_index,
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

    await db.transaction('rw', [db.stages, db.routes, db.weather, db.syncQueue], async () => {
      const route = await db.routes
        .where('stage_id')
        .equals(id)
        .filter((r) => r.deleted_at === null)
        .first();
      if (route) {
        await db.routes.put({ ...route, deleted_at: now, updated_at: now, _dirty: 1 });
        await db.syncQueue.add({ entity: 'routes', op: 'delete', row_id: route.id, created_at: now });
      }

      await db.weather.where('stage_id').equals(id).delete();

      await db.stages.put({ ...existing, deleted_at: now, updated_at: now, _dirty: 1 });
      await db.syncQueue.add({ entity: 'stages', op: 'delete', row_id: id, created_at: now });

      // Close the gap: re-pack the surviving siblings into contiguous 0..n so the
      // derived per-stage date (trail start + order_index) stays consecutive.
      const survivors = await db.stages
        .where('trail_id')
        .equals(existing.trail_id)
        .filter((s) => s.deleted_at === null)
        .sortBy('order_index');

      for (let i = 0; i < survivors.length; i++) {
        if (survivors[i].order_index === i) continue;
        const row = { ...survivors[i], order_index: i, updated_at: now, _dirty: 1 as const };
        await db.stages.put(row);
        await db.syncQueue.add({ entity: 'stages', op: 'upsert', row_id: row.id, created_at: now });
      }
    });
  },

  /**
   * Insert a new stage at `position` (0 = first), shifting all subsequent
   * stages down. Equivalent to append when position >= current count.
   */
  async insertAt(input: InsertStageInput, position: number): Promise<StageRow> {
    const now = nowIso();
    let created!: StageRow;

    await db.transaction('rw', [db.stages, db.syncQueue], async () => {
      const siblings = await db.stages
        .where('trail_id')
        .equals(input.trail_id)
        .filter((s) => s.deleted_at === null)
        .sortBy('order_index');

      const clampedPos = Math.max(0, Math.min(position, siblings.length));

      const newBase: StageRow = {
        id: newId(),
        ...normalize(input),
        order_index: clampedPos,
        difficulty_score: null,
        difficulty_class: null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        _dirty: 1,
      };
      created = withDifficulty(newBase);

      const ordered = [...siblings];
      ordered.splice(clampedPos, 0, created);

      for (let i = 0; i < ordered.length; i++) {
        const row = { ...ordered[i], order_index: i, updated_at: now, _dirty: 1 as const };
        await db.stages.put(row);
        await db.syncQueue.add({ entity: 'stages', op: 'upsert', row_id: row.id, created_at: now });
      }
    });

    return created;
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
