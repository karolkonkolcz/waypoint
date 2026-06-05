'use client';

import { useEffect, useState } from 'react';
import type { WeatherSnapshot } from '@/lib/weather/forecast';
import { CONDITION_ICON } from '@/components/weather/conditionIcon';
import { cn } from '@/lib/utils';

interface Props {
  snapshot: WeatherSnapshot;
  loading?: boolean;
}

/**
 * The day's forecast laid out along its timeline. The "YOU" marker is a
 * progress indicator: it sits where the current local time falls within the
 * forecast window (first slot → last slot), so a glance shows how far into the
 * day you are and what's still ahead. Updates every minute; clamps to the
 * window edges outside hiking hours.
 */
export function MovingForecast({ snapshot, loading }: Props) {
  const entries = snapshot.entries;

  // Current minutes-since-midnight, set after mount to avoid SSR/hydration
  // mismatch, then ticked once a minute so the marker creeps across the day.
  const [nowMin, setNowMin] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNowMin(d.getHours() * 60 + d.getMinutes());
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  if (entries.length === 0) return null;

  // Map "now" onto the track: slot hours sit at column centres, so the marker
  // travels from the first slot's centre to the last slot's centre.
  const n = entries.length;
  const firstH = entries[0].hour;
  const lastH = entries[n - 1].hour;
  let markerPct: number | null = null;
  if (nowMin !== null && lastH > firstH) {
    const frac = Math.min(1, Math.max(0, (nowMin - firstH * 60) / ((lastH - firstH) * 60)));
    const firstCentre = (0.5 / n) * 100;
    const lastCentre = ((n - 0.5) / n) * 100;
    markerPct = firstCentre + frac * (lastCentre - firstCentre);
  }

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

        {/* Marker — vertical line + dot + "YOU" label, parked at the current
            time within the forecast window. */}
        {markerPct !== null && (
          <div
            className="pointer-events-none absolute top-0 bottom-2 flex -translate-x-1/2 flex-col items-center transition-[left] duration-1000 ease-linear motion-reduce:transition-none"
            style={{ left: `${markerPct}%` }}
          >
            <span className="rounded bg-primary px-1 py-px text-[8px] font-bold uppercase leading-none tracking-wide text-primary-foreground">
              You
            </span>
            <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
            <span className="w-px flex-1 bg-primary/70" />
          </div>
        )}
      </div>
    </section>
  );
}
