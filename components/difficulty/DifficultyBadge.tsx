import { cn } from '@/lib/utils';
import type { DifficultyClass } from '@/lib/domain/difficulty';

interface Props {
  klass: DifficultyClass;
  score?: number;
  size?: 'sm' | 'md';
}

const LABELS: Record<DifficultyClass, string> = {
  easy: 'Snadná',
  moderate: 'Střední',
  hard: 'Těžká',
  extreme: 'Extrémní',
};

const STYLES: Record<DifficultyClass, string> = {
  easy:     'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  moderate: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  hard:     'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  extreme:  'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

export function DifficultyBadge({ klass, score, size = 'md' }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-semibold',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        STYLES[klass],
      )}
    >
      {LABELS[klass]}
      {score !== undefined && (
        <span className="opacity-70 font-normal">{score}</span>
      )}
    </span>
  );
}
