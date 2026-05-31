import { DifficultyBadge } from '@/components/difficulty/DifficultyBadge';
import type { DifficultyClass } from '@/lib/domain/difficulty';

interface Props {
  title: string;
  dayNumber: number;
  difficultyClass: DifficultyClass | null;
  difficultyScore: number | null;
}

export function StageHeader({ title, dayNumber, difficultyClass, difficultyScore }: Props) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-muted-foreground">Day {dayNumber}</p>
      <h1 className="text-2xl font-bold leading-tight">{title}</h1>
      {difficultyClass && (
        <DifficultyBadge
          klass={difficultyClass}
          score={difficultyScore ?? undefined}
        />
      )}
    </div>
  );
}
