'use client';

import { CloudIcon, CloudOffIcon, RefreshCwIcon, TriangleAlertIcon } from 'lucide-react';
import { Chip } from '@/components/ui/primitives';
import { useSyncStatus } from '@/lib/hooks/useSyncStatus';

/** Live sync status pill for the Home header. */
export function SyncedChip() {
  const state = useSyncStatus();

  if (state === 'offline') {
    return (
      <Chip tone="neutral" icon={<CloudOffIcon className="h-3.5 w-3.5" />}>
        Offline
      </Chip>
    );
  }
  if (state === 'syncing') {
    return (
      <Chip tone="neutral" icon={<RefreshCwIcon className="h-3.5 w-3.5 animate-spin" />}>
        Syncing…
      </Chip>
    );
  }
  if (state === 'error') {
    return (
      <Chip tone="warn" icon={<TriangleAlertIcon className="h-3.5 w-3.5" />}>
        Sync error
      </Chip>
    );
  }
  return (
    <Chip tone="success" icon={<CloudIcon className="h-3.5 w-3.5" />}>
      Synced
    </Chip>
  );
}
