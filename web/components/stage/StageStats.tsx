import { cn } from '@/lib/utils';

interface Stat {
  label: string;
  value: string;
  icon?: string;
}

interface Props {
  stats: Stat[];
  className?: string;
}

export function StageStats({ stats, className }: Props) {
  return (
    <div className={cn('grid grid-cols-3 gap-3', className)}>
      {stats.map((s) => (
        <div
          key={s.label}
          className="flex flex-col items-center gap-0.5 rounded-xl bg-muted/60 px-3 py-3"
        >
          {s.icon && <span className="text-lg leading-none">{s.icon}</span>}
          <span className="text-xl font-bold tabular-nums">{s.value}</span>
          <span className="text-xs text-muted-foreground">{s.label}</span>
        </div>
      ))}
    </div>
  );
}
