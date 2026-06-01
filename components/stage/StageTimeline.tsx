import {
  BusIcon,
  TrainFrontIcon,
  PlaneIcon,
  ArrowRightLeftIcon,
  BedIcon,
  UtensilsIcon,
  StickyNoteIcon,
} from 'lucide-react';
import type { Milestone, MilestoneKind } from '@/lib/db/dexie';

type IconFC = React.FC<{ className?: string }>;

// Display metadata per milestone kind — shared by the read-only timeline (F2)
// and the timeline editor (F3) so labels/icons stay consistent.
export const MILESTONE_META: Record<MilestoneKind, { label: string; icon: IconFC }> = {
  bus: { label: 'Bus', icon: BusIcon },
  train: { label: 'Train', icon: TrainFrontIcon },
  flight: { label: 'Flight', icon: PlaneIcon },
  transfer: { label: 'Transfer', icon: ArrowRightLeftIcon },
  checkin: { label: 'Check-in', icon: BedIcon },
  meal: { label: 'Meal', icon: UtensilsIcon },
  note: { label: 'Note', icon: StickyNoteIcon },
};

export const MILESTONE_KINDS = Object.keys(MILESTONE_META) as MilestoneKind[];

/** Chronological order; unscheduled (time === null) milestones sink to the end. */
export function sortMilestones(milestones: Milestone[]): Milestone[] {
  return [...milestones].sort((a, b) => {
    if (a.time === b.time) return 0;
    if (a.time === null) return 1;
    if (b.time === null) return -1;
    return a.time.localeCompare(b.time);
  });
}

export function StageTimeline({ milestones }: { milestones: Milestone[] }) {
  if (milestones.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-border px-6 py-8 text-center text-sm text-muted-foreground">
        No milestones yet. Add bus, flight or transfer times for this day.
      </div>
    );
  }

  const ordered = sortMilestones(milestones);

  return (
    <ol className="relative space-y-0">
      {ordered.map((m, idx) => {
        const Icon = MILESTONE_META[m.kind].icon;
        const isLast = idx === ordered.length - 1;
        return (
          <li key={m.id} className="relative flex gap-3 pb-5 last:pb-0">
            {/* Rail: connecting line + icon node */}
            <div className="flex flex-col items-center">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </div>
              {!isLast && <div className="mt-1 w-px flex-1 bg-border" />}
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-bold tabular-nums">
                  {m.time ?? '—'}
                </span>
                <span className="truncate font-medium">{m.title}</span>
              </div>
              {m.location && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{m.location}</p>
              )}
              {m.notes && (
                <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                  {m.notes}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
