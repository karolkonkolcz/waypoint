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

// Explicit hex values rather than Tailwind palette utilities: the v4 palette is
// defined in oklch(), which older iOS Safari (< 16.4) can't render — badges came
// out nearly transparent there. Hex works everywhere.
const STYLES: Record<DifficultyClass, string> = {
  easy:     'bg-[#dcfce7] text-[#166534]',
  moderate: 'bg-[#fef9c3] text-[#854d0e]',
  hard:     'bg-[#ffedd5] text-[#9a3412]',
  extreme:  'bg-[#fee2e2] text-[#991b1b]',
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
