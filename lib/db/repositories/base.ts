import { uuidv7 } from 'uuidv7';
import { db, type SyncOp } from '../dexie';

export function newId(): string {
  return uuidv7();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export async function enqueue(op: Omit<SyncOp, 'seq'>): Promise<void> {
  await db.syncQueue.add(op);
}

export function dirtyRow<T extends { updated_at: string; deleted_at: string | null; _dirty: 0 | 1 }>(
  partial: Omit<T, '_dirty' | 'updated_at'> & Partial<Pick<T, 'updated_at'>>,
): T {
  return {
    ...partial,
    updated_at: partial.updated_at ?? nowIso(),
    _dirty: 1,
  } as T;
}
