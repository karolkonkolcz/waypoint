'use client';

import { MapPinIcon } from 'lucide-react';

interface Props {
  trailName: string;
  stageTitle: string;
  fetchedAt: string; // ISO
}

/** Compact relative-time, e.g. "3 h ago" / "just now". */
function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}

/**
 * Offline-fallback notice: the meteogram below is the cached forecast for the
 * user's estimated position on the active trail, not a live current-position
 * fetch. Shown only in page mode 2 (offline + cached stage weather).
 */
export default function OfflineBanner({ trailName, stageTitle, fetchedAt }: Props) {
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200">
      <MapPinIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="leading-snug">
        Estimated position on <span className="font-semibold">{trailName}</span> · {stageTitle} ·
        forecast from {relativeTime(fetchedAt)}
      </p>
    </div>
  );
}
