'use client';

import type { WeatherSnapshot } from '@/lib/weather/forecast';
import { CONDITION_ICON } from '@/components/weather/conditionIcon';
import { cn } from '@/lib/utils';

interface Props {
  snapshot: WeatherSnapshot;
  loading?: boolean;
}

/**
 * The day's forecast laid out along its timeline, with a "YOU" marker that
 * sweeps across to suggest where the hiker will be as conditions change.
 * Slots come straight from the cached snapshot (3–5 entries). The marker is a
 * pure CSS animation (reduced-motion safe); wiring it to real route-position
 * interpolation is a follow-up.
 */
export function MovingForecast({ snapshot, loading }: Props) {
  const entries = snapshot.entries;
  if (entries.length === 0) return null;

  return (
    <section className="rounded-2xl border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Moving forecast
        </h2>
        {loading && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />}
      </div>

      {/* pt leaves room for the YOU label sitting above the track */}
      <div className="relative pt-4">
        <div className="flex overflow-hidden rounded-lg bg-muted/60">
          {entries.map((entry, i) => {
            const Icon = CONDITION_ICON[entry.condition];
            const wet = entry.precipMm > 0;
            return (
              <div
                key={entry.hour}
                className={cn(
                  'flex flex-1 flex-col items-center gap-0.5 py-2',
                  i > 0 && 'border-l border-border/60',
                  wet && 'bg-primary/10',
                )}
              >
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {String(entry.hour).padStart(2, '0')}
                </span>
                <Icon className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold tabular-nums">{entry.tempC}°</span>
              </div>
            );
          })}
        </div>

        {/* Animated marker — vertical line + dot + "YOU" label. */}
        <div className="you-marker pointer-events-none absolute top-0 bottom-2 flex -translate-x-1/2 flex-col items-center">
          <span className="rounded bg-primary px-1 py-px text-[8px] font-bold uppercase leading-none tracking-wide text-primary-foreground">
            You
          </span>
          <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
          <span className="w-px flex-1 bg-primary/70" />
        </div>
      </div>
    </section>
  );
}
