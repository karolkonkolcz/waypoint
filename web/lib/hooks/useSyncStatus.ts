'use client';

import { useEffect, useState } from 'react';
import {
  getSyncStatus,
  subscribeSyncStatus,
  type SyncStatus,
} from '@/lib/db/sync';

export type SyncState = 'offline' | 'syncing' | 'synced' | 'error';

/**
 * Combined sync state for the Home "Synced" chip: the push/pull status from the
 * sync engine, overridden by 'offline' whenever the browser is offline.
 */
export function useSyncStatus(): SyncState {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const unsub = subscribeSyncStatus(setStatus);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      unsub();
    };
  }, []);

  if (!online) return 'offline';
  if (status === 'syncing') return 'syncing';
  if (status === 'error') return 'error';
  return 'synced';
}
