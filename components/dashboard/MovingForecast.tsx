'use client';

import { useEffect, useState } from 'react';
import { CloudRainIcon, MapPinIcon, FlagIcon, RouteIcon } from 'lucide-react';
import type { WeatherSnapshot, WeatherCondition, ForecastPhase } from '@/lib/weather/forecast';
import { CONDITION_ICON } from '@/components/weather/conditionIcon';
import { selectVisibleSlots } from '@/lib/weather/visibleSlots';
import { Eyebrow } from '@/components/ui/primitives';
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
  phase: ForecastPhase;
}

/** Local calendar date as YYYY-MM-DD — to tell "today" from a future stage. */
function localDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/**
 * The day's forecast along its timeline. A route-aware snapshot spans three
 * phases — weather at the start point before you leave, the route-projected
 * "moving" weather while you walk (visually emphasised), and the destination's
 * weather once you've arrived (incl. evening/night). When viewing today the
 * card trims to the hours still ahead, so you never look at weather that has
 * already passed. The "YOU" marker tracks the current local time.
 */
export function MovingForecast({ snapshot, loading }: Props) {
  // Prefer the route-aware "moving" entries; fall back to the fixed-hour ones.
  const allSlots: Slot[] = snapshot.moving
    ? snapshot.moving.map((m) => ({
        hour: m.hour,
        tempC: m.tempC,
        precipMm: m.precipMm,
        condition: m.condition,
        km: m.km,
        phase: m.phase,
      }))
    : snapshot.entries.map((e) => ({
        hour: e.hour,
        tempC: e.tempC,
        precipMm: e.precipMm,
        condition: e.condition,
        km: null,
        phase: 'moving' as ForecastPhase,
      }));

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

  // Trim past hours only for a route-aware view of *today* — a future stage or
  // a plain fallback snapshot shows from the start of its window.
  const isToday = snapshot.date === localDate();
  const nowHour = nowMin !== null && isToday && snapshot.moving ? Math.floor(nowMin / 60) : null;
  const slots = selectVisibleSlots(allSlots, nowHour);

  if (slots.length === 0) return null;

  // Map "now" onto the track: slot hours sit at column centres, so the marker
  // travels from the first slot's centre to the last slot's centre.
  const n = slots.length;
  const firstH = slots[0].hour;
  const lastH = slots[n - 1].hour;
  let markerPct: number | null = null;
  if (nowMin !== null && isToday && lastH > firstH && nowMin >= firstH * 60 && nowMin <= lastH * 60) {
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
        <Eyebrow>Moving forecast</Eyebrow>
        <div className="flex items-center gap-1.5">
          {loading && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />}
          {snapshot.moving && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <RouteIcon className="h-3 w-3" />
              route-aware
            </span>
          )}
        </div>
      </div>

      {/* pt leaves room for the YOU label sitting above the track */}
      <div className="relative pt-4">
        <div className="flex overflow-hidden rounded-lg bg-muted/60">
          {slots.map((slot, i) => {
            const Icon = CONDITION_ICON[slot.condition];
            const wet = slot.precipMm > 0;
            const moving = slot.phase === 'moving';
            // A heavier divider where the phase changes brackets the moving run
            // from the stationary start/end columns.
            const phaseBreak = i > 0 && slots[i - 1].phase !== slot.phase;
            return (
              <div
                key={slot.hour}
                className={cn(
                  'flex flex-1 flex-col items-center gap-0.5 py-2',
                  i > 0 && (phaseBreak ? 'border-l-2 border-primary/40' : 'border-l border-border/60'),
                  !moving && 'bg-muted/50', // start/end recede behind the journey
                  wet && 'bg-primary/10', // rain tint takes precedence
                )}
              >
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {String(slot.hour % 24).padStart(2, '0')}
                </span>
                <Icon className={cn('h-4 w-4', moving ? 'text-primary' : 'text-muted-foreground')} />
                <span
                  className={cn(
                    'text-xs font-semibold tabular-nums',
                    !moving && 'text-muted-foreground',
                  )}
                >
                  {slot.tempC}°
                </span>
                {moving ? (
                  slot.km != null && (
                    <span className="text-[9px] tabular-nums text-muted-foreground">{slot.km} km</span>
                  )
                ) : (
                  <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
                    {slot.phase === 'start' ? (
                      <MapPinIcon className="h-2.5 w-2.5" />
                    ) : (
                      <FlagIcon className="h-2.5 w-2.5" />
                    )}
                    {slot.phase === 'start' ? 'start' : 'dest'}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Marker parked at the current time within the visible window. */}
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
            ? `Rain reaches you around ${String(rainHour % 24).padStart(2, '0')}:00${rainKm != null ? ` · km ${rainKm}` : ''}`
            : 'Dry the whole way'}
        </p>
      )}
    </section>
  );
}
