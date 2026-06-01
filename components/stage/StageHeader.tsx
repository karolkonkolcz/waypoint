import { ArrowRightLeftIcon } from 'lucide-react';
import { DifficultyBadge } from '@/components/difficulty/DifficultyBadge';
import type { DifficultyClass } from '@/lib/domain/difficulty';
import type { StageType } from '@/lib/db/dexie';

interface Props {
  title: string;
  dayNumber: number;
  difficultyClass: DifficultyClass | null;
  difficultyScore: number | null;
  stageType?: StageType;
}

export function StageHeader({ title, dayNumber, difficultyClass, difficultyScore, stageType = 'trek' }: Props) {
  return (
    <div className="space-y-1">
      {stageType !== 'transit' && (
        <p className="text-sm font-medium text-muted-foreground">Day {dayNumber}</p>
      )}
      <h1 className="text-2xl font-bold leading-tight">{title}</h1>
      {stageType === 'transit' ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          <ArrowRightLeftIcon className="h-3.5 w-3.5" />
          Transit day
        </span>
      ) : (
        difficultyClass && (
          <DifficultyBadge
            klass={difficultyClass}
            score={difficultyScore ?? undefined}
          />
        )
      )}
    </div>
  );
}
