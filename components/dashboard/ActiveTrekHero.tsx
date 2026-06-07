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

/** "hard" → "Hard" for chip display. */
function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function ActiveTrekHero({
  trail,
  dayNumber,
  totalDays,
  difficultyClass,
  href,
}: {
  trail: TrailRow;
  /** 1-based index of today's stage within the trek, or null if not started. */
  dayNumber: number | null;
  totalDays: number;
  difficultyClass: DifficultyClass | null;
  href: string;
}) {
  const gradient =
    DIFFICULTY_GRADIENT[difficultyClass ?? 'default'] ?? DIFFICULTY_GRADIENT.default;
  const progress = dayNumber && totalDays > 0 ? dayNumber / totalDays : 0;

  return (
    <Link
      href={href}
      className="relative block overflow-hidden rounded-2xl shadow-sm active:scale-[0.99]"
    >
      {/* Background — cover photo or difficulty gradient */}
      {trail.cover_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={trail.cover_image_url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0" style={{ background: gradient }} />
      )}
      {/* Legibility scrim */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-black/20" />

      <div className="relative flex min-h-[164px] flex-col justify-between gap-3 p-4 pb-6 text-white">
        <div className="flex items-center justify-between">
          <Eyebrow className="text-white/75">Active trek</Eyebrow>
          {difficultyClass && (
            <Chip tone="brand" className="shadow-sm">
              {titleCase(difficultyClass)}
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
                  Day <span className="font-mono font-semibold tabular-nums">{dayNumber}</span> of{' '}
                  <span className="font-mono font-semibold tabular-nums">{totalDays}</span>
                </>
              ) : (
                <>
                  <span className="font-mono font-semibold tabular-nums">{totalDays}</span>{' '}
                  {totalDays === 1 ? 'day' : 'days'}
                </>
              )}
            </span>
            <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--wp-orange)] px-3 py-1.5 text-sm font-semibold shadow-md">
              Today
              <ChevronRightIcon className="h-4 w-4" />
            </span>
          </div>
        </div>
      </div>

      {/* Progress — thin full-bleed line pinned to the card's bottom edge */}
      <ProgressBar
        value={progress}
        className="absolute inset-x-0 bottom-0 h-1.5 rounded-none bg-black/30"
        fillClassName="rounded-none"
      />
    </Link>
  );
}
