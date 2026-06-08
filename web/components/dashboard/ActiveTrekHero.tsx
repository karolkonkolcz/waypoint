'use client';

import Link from 'next/link';
import { ChevronRightIcon } from 'lucide-react';
import type { TrailRow } from '@/lib/db/dexie';
import type { DifficultyClass } from '@/lib/domain/difficulty';
import { Chip, Eyebrow, ProgressBar } from '@/components/ui/primitives';

// Fallback backgrounds when a trail has no cover photo — tinted by difficulty
// so the hero still feels intentional, not empty.
const DIFFICULTY_GRADIENT: Record<DifficultyClass | 'default', string> = {
  easy: 'linear-gradient(135deg, #1f7a46 0%, #2f373d 100%)',
  moderate: 'linear-gradient(135deg, #b8821a 0%, #2f373d 100%)',
  hard: 'linear-gradient(135deg, #d85f08 0%, #2f373d 100%)',
  extreme: 'linear-gradient(135deg, #b02020 0%, #2f373d 100%)',
  default: 'linear-gradient(135deg, #3a4750 0%, #1b1f22 100%)',
};

const DIFFICULTY_LABEL: Record<DifficultyClass, string> = {
  easy: 'Snadná',
  moderate: 'Střední',
  hard: 'Těžká',
  extreme: 'Extrémní',
};

function dayLabel(count: number): string {
  if (count === 1) return 'den';
  if (count >= 2 && count <= 4) return 'dny';
  return 'dní';
}

export function ActiveTrekHero({
  trail,
  dayNumber,
  totalDays,
  difficultyClass,
  trailHref,
  todayHref,
}: {
  trail: TrailRow;
  /** 1-based index of today's stage within the trek, or null if not started. */
  dayNumber: number | null;
  totalDays: number;
  difficultyClass: DifficultyClass | null;
  /** Tapping the card opens the trek's day-by-day detail. */
  trailHref: string;
  /** The "Today" button jumps to the dashboard for today's stage. */
  todayHref: string;
}) {
  const gradient =
    DIFFICULTY_GRADIENT[difficultyClass ?? 'default'] ?? DIFFICULTY_GRADIENT.default;
  const progress = dayNumber && totalDays > 0 ? dayNumber / totalDays : 0;

  return (
    <div className="relative overflow-hidden rounded-2xl shadow-sm">
      {/* Stretched link — the whole card opens the trek detail (all days). */}
      <Link
        href={trailHref}
        aria-label={`Otevřít ${trail.name}`}
        className="absolute inset-0 z-10"
      />
      {/* Difficulty gradient is the base; the cover photo overlays it when it
          loads, and hides itself if it can't (e.g. offline) so we never show a
          broken image. */}
      <div className="absolute inset-0" style={{ background: gradient }} />
      {trail.cover_image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={trail.cover_image_url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      )}
      {/* Legibility scrim */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-black/20" />

      <div className="relative flex min-h-[164px] flex-col justify-between gap-3 p-4 pb-6 text-white">
        <div className="flex items-center justify-between">
          <Eyebrow className="text-white/75">Aktivní přechod</Eyebrow>
          {difficultyClass && (
            <Chip tone="brand" className="shadow-sm">
              {DIFFICULTY_LABEL[difficultyClass]}
            </Chip>
          )}
        </div>

        <div>
          <h2 className="text-2xl font-extrabold leading-tight drop-shadow-sm">
            {trail.name}
          </h2>

          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-white/90">
              {dayNumber ? (
                <>
                  Den <span className="font-mono font-semibold tabular-nums">{dayNumber}</span> z{' '}
                  <span className="font-mono font-semibold tabular-nums">{totalDays}</span>
                </>
              ) : (
                <>
                  <span className="font-mono font-semibold tabular-nums">{totalDays}</span>{' '}
                  {dayLabel(totalDays)}
                </>
              )}
            </span>
            <Link
              href={todayHref}
              className="relative z-20 inline-flex items-center gap-0.5 rounded-full bg-[var(--wp-orange)] px-3 py-1.5 text-sm font-semibold text-white shadow-md active:scale-95"
            >
              Dnes
              <ChevronRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* Progress — thin full-bleed line pinned to the card's bottom edge */}
      <ProgressBar
        value={progress}
        className="absolute inset-x-0 bottom-0 h-1.5 rounded-none bg-black/30"
        fillClassName="rounded-none"
      />
    </div>
  );
}
