'use client';

import { useEffect, useState } from 'react';
import { CloudRainIcon } from 'lucide-react';
import type { WeatherSnapshot, WeatherCondition } from '@/lib/weather/forecast';
import { CONDITION_ICON } from '@/components/weather/conditionIcon';
import { cn } from '@/lib/utils';

interface Props {
  snapshot: WeatherSnapshot;
  loading?: boolean;
}

interface Slot {
  hour: number;
  tempC: number;
  precipMm: number;
  condition: WeatherCondition;
  km: number | null;
}

/**
 * The day's forecast along its timeline. When the snapshot is route-aware each
 * slot is the weather AT the position you'll have reached that hour, so the
 * rain band marks where on the route it catches you. The "YOU" marker is a
 * progress indicator parked at the current local time (updates each minute).
 */
export function MovingForecast({ snapshot, loading }: Props) {
  // Prefer the route-aware "moving" entries; fall back to the fixed-hour ones.
  const slots: Slot[] = snapshot.moving
    ? snapshot.moving.map((m) => ({ hour: m.hour, tempC: m.tempC, precipMm: m.precipMm, condition: m.condition, km: m.km }))
    : snapshot.entries.map((e) => ({ hour: e.hour, tempC: e.tempC, precipMm: e.precipMm, condition: e.condition, km: null }));

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

  if (slots.length === 0) return null;

  // Map "now" onto the track: slot hours sit at column centres, so the marker
  // travels from the first slot's centre to the last slot's centre.
  const n = slots.length;
  const firstH = slots[0].hour;
  const lastH = slots[n - 1].hour;
  let markerPct: number | null = null;
  if (nowMin !== null && lastH > firstH) {
    const frac = Math.min(1, Math.max(0, (nowMin - firstH * 60) / ((lastH - firstH) * 60)));
    const firstCentre = (0.5 / n) * 100;
    const lastCentre = ((n - 0.5) / n) * 100;
    markerPct = firstCentre + frac * (lastCentre - firstCentre);
  }

  const rainHour = snapshot.rainStartsHour;
  const rainKm = snapshot.rainStartsKm;

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
          {slots.map((slot, i) => {
            const Icon = CONDITION_ICON[slot.condition];
            const wet = slot.precipMm > 0;
            return (
              <div
                key={slot.hour}
                className={cn(
                  'flex flex-1 flex-col items-center gap-0.5 py-2',
                  i > 0 && 'border-l border-border/60',
                  wet && 'bg-primary/10',
                )}
              >
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {String(slot.hour).padStart(2, '0')}
                </span>
                <Icon className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold tabular-nums">{slot.tempC}°</span>
                {slot.km != null && (
                  <span className="text-[9px] tabular-nums text-muted-foreground">{slot.km} km</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Marker parked at the current time within the forecast window. */}
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

      {/* Route-aware payoff: when/where rain catches you. */}
      {snapshot.moving && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <CloudRainIcon className="h-3.5 w-3.5" />
          {rainHour != null
            ? `Rain reaches you around ${String(rainHour).padStart(2, '0')}:00${rainKm != null ? ` · km ${rainKm}` : ''}`
            : 'Dry the whole way'}
        </p>
      )}
    </section>
  );
}
