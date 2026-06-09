'use client';

import {
  CloudLightningIcon,
  DropletsIcon,
  FlagIcon,
  HomeIcon,
  MapPinIcon,
  MountainIcon,
  PackageIcon,
  ShieldIcon,
  TentIcon,
} from 'lucide-react';
import { Eyebrow } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import type { RouteTimelineRow, TimelinePointKind } from '@/lib/domain/routeTimeline';

const ICONS: Record<TimelinePointKind, typeof FlagIcon> = {
  start: FlagIcon,
  water: DropletsIcon,
  peak: MountainIcon,
  town: HomeIcon,
  camp: TentIcon,
  shelter: ShieldIcon,
  resupply: PackageIcon,
  storm: CloudLightningIcon,
  finish: FlagIcon,
  other: MapPinIcon,
};

function timeLabel(hour: number): string {
  const total = Math.round(hour * 60);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timeInputValue(hour: number): string {
  const total = Math.round(hour * 60);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parseHour(value: string): number | null {
  const [h, m] = value.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h + m / 60;
}

export function EtaPrecipTimeline({
  rows,
  startHour,
  onStartHourChange,
  hasForecast,
  updating,
}: {
  rows: RouteTimelineRow[];
  startHour: number;
  onStartHourChange: (hour: number) => void;
  hasForecast: boolean;
  updating?: boolean;
}) {
  if (rows.length === 0) return null;

  const hasStorm = rows.some((row) => row.isStorm);

  return (
    <section className="rounded-2xl border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <Eyebrow>Kde budeš v kolik · ETA × srážky</Eyebrow>
          <p className="mt-1 text-xs text-muted-foreground">
            {hasForecast
              ? hasStorm
                ? 'Srážkový řádek je zvýrazněný.'
                : 'Po trase zatím bez významných srážek.'
              : 'Počasí zatím není v cache.'}
          </p>
        </div>
        <label className="shrink-0 text-right">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Odchod
          </span>
          <input
            type="time"
            value={timeInputValue(startHour)}
            onChange={(e) => {
              const next = parseHour(e.currentTarget.value);
              if (next !== null) onStartHourChange(next);
            }}
            className="mt-1 h-9 w-[86px] rounded-lg border bg-background px-2 text-sm font-semibold tabular-nums"
            aria-label="Čas odchodu"
          />
        </label>
      </div>

      <div className="relative">
        <div className="absolute bottom-3 left-[47px] top-3 w-px bg-border" />
        <ul className="space-y-1">
          {rows.map((row) => {
            const Icon = ICONS[row.kind];
            return (
              <li
                key={row.id}
                className={cn(
                  'relative grid min-h-[42px] grid-cols-[34px_24px_minmax(0,1fr)] items-center gap-3 rounded-lg px-2 py-1.5',
                  row.isStorm && 'bg-[color-mix(in_oklch,var(--wp-orange)_14%,transparent)]',
                )}
              >
                <span
                  className={cn(
                    'font-mono text-xs font-semibold tabular-nums text-muted-foreground',
                    row.isStorm && 'text-[var(--wp-orange)]',
                  )}
                >
                  {timeLabel(row.hour)}
                </span>
                <span
                  className={cn(
                    'z-10 flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground',
                    row.isStorm && 'bg-[var(--wp-orange)] text-white',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      'block truncate text-sm font-medium',
                      row.isStorm && 'font-bold text-foreground',
                    )}
                  >
                    {row.detail && !row.isStorm ? `${row.detail} · ` : ''}
                    {row.title}
                  </span>
                  <span className="block font-mono text-[10.5px] tabular-nums text-muted-foreground">
                    {row.distanceKm.toFixed(1)} km
                    {row.elevationM != null ? ` · ${row.elevationM} m` : ''}
                    {row.isStorm && row.precipMm != null ? ` · ${row.precipMm.toFixed(1)} mm/h` : ''}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {updating && (
        <p className="mt-3 text-xs text-muted-foreground">Aktualizuji časový model podle nového odchodu…</p>
      )}
    </section>
  );
}
