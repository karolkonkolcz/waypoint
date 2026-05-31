import { db } from './dexie';
import { createClient } from '@/lib/supabase/client';

const LAST_PULLED_KEY = 'sync:lastPulledAt';

function getLastPulledAt(): string {
  if (typeof localStorage === 'undefined') return new Date(0).toISOString();
  return localStorage.getItem(LAST_PULLED_KEY) ?? new Date(0).toISOString();
}

function setLastPulledAt(iso: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(LAST_PULLED_KEY, iso);
}

// Explicit table map so TypeScript stays happy and the code stays readable
const dexieTables = {
  trails: () => db.trails,
  routes: () => db.routes,
  stages: () => db.stages,
  waypoints: () => db.waypoints,
  weather_cache: () => db.weather,
} as const;

type SyncableEntity = keyof typeof dexieTables;

const SYNCABLE: SyncableEntity[] = ['trails', 'routes', 'stages', 'waypoints', 'weather_cache'];

// ---------------------------------------------------------------------------
// Push — flush dirty rows from syncQueue to Supabase
// ---------------------------------------------------------------------------
export async function push(): Promise<void> {
  const supabase = createClient();
  const ops = await db.syncQueue.orderBy('seq').toArray();
  if (ops.length === 0) return;

  for (const op of ops) {
    if (!SYNCABLE.includes(op.entity as SyncableEntity)) continue;
    const entity = op.entity as SyncableEntity;
    const table = dexieTables[entity]();

    if (op.op === 'upsert') {
      const row = await table.get(op.row_id);
      if (!row) {
        await db.syncQueue.delete(op.seq!);
        continue;
      }
      const { error } = await supabase.from(entity).upsert(row as never, { onConflict: 'id' });
      if (error) {
        console.error(`[sync] push upsert ${entity}/${op.row_id}:`, error.message);
        continue;
      }
    }

    if (op.op === 'delete') {
      const { error } = await supabase
        .from(entity)
        .update({ deleted_at: new Date().toISOString() } as never)
        .eq('id', op.row_id);
      if (error) {
        console.error(`[sync] push delete ${entity}/${op.row_id}:`, error.message);
        continue;
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (table as any).where('id').equals(op.row_id).modify({ _dirty: 0 });
    await db.syncQueue.delete(op.seq!);
  }
}

// ---------------------------------------------------------------------------
// Pull — fetch rows changed since lastPulledAt, merge with LWW by updated_at
// ---------------------------------------------------------------------------
export async function pull(userId: string): Promise<void> {
  const supabase = createClient();
  const since = getLastPulledAt();
  const pullTime = new Date().toISOString();

  for (const entity of SYNCABLE) {
    const { data, error } = await supabase
      .from(entity)
      .select('*')
      .eq('user_id', userId)
      .gt('updated_at', since);

    if (error) {
      console.error(`[sync] pull ${entity}:`, error.message);
      continue;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = dexieTables[entity]() as any;
    for (const remote of data ?? []) {
      const local = await table.get(remote.id);
      if (!local || remote.updated_at >= local.updated_at) {
        await table.put({ ...remote, _dirty: 0 });
      }
    }
  }

  setLastPulledAt(pullTime);
}

// ---------------------------------------------------------------------------
// sync() — push then pull; guards against concurrent runs
// ---------------------------------------------------------------------------
let running = false;

export async function sync(userId: string): Promise<void> {
  if (running) return;
  running = true;
  try {
    await push();
    await pull(userId);
  } finally {
    running = false;
  }
}

// ---------------------------------------------------------------------------
// Register online / visibilitychange triggers — call once at app boot
// ---------------------------------------------------------------------------
export function registerSyncTriggers(getUserId: () => string | null): void {
  const run = () => {
    const uid = getUserId();
    if (uid && navigator.onLine) sync(uid).catch(console.error);
  };

  window.addEventListener('online', run);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') run();
  });
}
