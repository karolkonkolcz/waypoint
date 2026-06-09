'use client';

import { CloudRainIcon } from 'lucide-react';
import { ElevationChart } from '@/components/route/ElevationChart';
import { Eyebrow } from '@/components/ui/primitives';
import type { ElevationPoint } from '@/lib/domain/eta';
import type { RainOnset } from '@/lib/domain/routeTimeline';

export function RouteProfilePanel({
  profile,
  rainOnset,
}: {
  profile: ElevationPoint[];
  rainOnset: RainOnset | null;
}) {
  if (profile.length < 2) return null;

  return (
    <section className="rounded-2xl border bg-card p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <Eyebrow>Profil trasy</Eyebrow>
        {rainOnset && (
          <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <CloudRainIcon className="h-3.5 w-3.5" />
            {rainOnset.distanceKm.toFixed(1)} km
          </span>
        )}
      </div>
      <ElevationChart
        profile={profile}
        marker={
          rainOnset && rainOnset.elevationM != null
            ? {
                distanceKm: rainOnset.distanceKm,
                elevationM: rainOnset.elevationM,
                label: 'První srážky',
              }
            : null
        }
      />
    </section>
  );
}
