'use client';

import { DropletIcon, WindIcon } from 'lucide-react';
import type { WeatherSnapshot } from '@/lib/weather/forecast';
import { CONDITION_ICON } from '@/components/weather/conditionIcon';

interface Props {
  snapshot: WeatherSnapshot;
  loading?: boolean;
}

export function WeatherCard({ snapshot, loading }: Props) {
  const dateLabel = new Date(snapshot.date + 'T12:00:00Z').toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  return (
    <section className="relative rounded-2xl border bg-card p-4">
      {/* Pulse dot while refreshing in background */}
      {loading && (
        <span className="absolute right-4 top-4 h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
      )}

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Weather
        </h2>
        <span className="text-xs text-muted-foreground">{dateLabel}</span>
      </div>

      {/* Three hourly snapshots */}
      <div className="mb-3 grid grid-cols-3 divide-x divide-border">
        {snapshot.entries.map((entry) => {
          const Icon = CONDITION_ICON[entry.condition];
          return (
            <div
              key={entry.hour}
              className="flex flex-col items-center gap-1 px-2 first:pl-0 last:pr-0"
            >
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {entry.hour}:00
              </span>
              <Icon className="h-5 w-5 text-primary" />
              <span className="text-sm font-bold tabular-nums">{entry.tempC}°C</span>
            </div>
          );
        })}
      </div>

      {/* Daily summary */}
      <div className="flex items-center gap-4 border-t pt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <DropletIcon className="h-3.5 w-3.5" />
          {snapshot.precipTotalMm > 0 ? `${snapshot.precipTotalMm} mm` : 'No rain'}
        </span>
        <span className="flex items-center gap-1">
          <WindIcon className="h-3.5 w-3.5" />
          max {snapshot.windMaxKmh} km/h
        </span>
      </div>
    </section>
  );
}
