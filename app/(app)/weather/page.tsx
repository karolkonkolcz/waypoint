'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { MapPinIcon } from 'lucide-react';

import { getLocalUserId } from '@/lib/auth/session';
import {
  forecastToMeteogram,
  getCurrentPosition,
  getCurrentPositionForecast,
  pruneEphemeralWeather,
} from '@/lib/weather/current-position';
import { getOfflineFallback } from '@/lib/weather/offline-fallback';
import { formatReverse, reverseGeocode } from '@/lib/weather/geocoding';
import type { OpenMeteoForecast, WeatherMode } from '@/lib/weather/types';
import OfflineBanner from '@/components/weather/OfflineBanner';
import WeatherEmptyState from '@/components/weather/WeatherEmptyState';
import { MeteogramSkeleton, RadarSkeleton } from './loading';

// Both heavy deps are browser-only and code-split so they never cost the daily
// stage screen or trail list bundle (HANDOFF §Bundle and code-splitting).
const Meteogram = dynamic(() => import('@/components/weather/Meteogram'), {
  ssr: false,
  loading: () => <MeteogramSkeleton />,
});
const RadarMap = dynamic(() => import('@/components/weather/RadarMap'), {
  ssr: false,
  loading: () => <RadarSkeleton />,
});

const PERMISSION_DENIED = 1; // GeolocationPositionError.PERMISSION_DENIED

/** Temperature at the hour nearest to now, for the header readout. */
function currentTemp(forecast: OpenMeteoForecast): number | null {
  const { time, temperature_2m } = forecast.hourly;
  if (!time.length) return null;
  const now = Date.now();
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < time.length; i++) {
    const diff = Math.abs(new Date(time[i]).getTime() - now);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return Math.round(temperature_2m[best]);
}

export default function WeatherPage() {
  const [mode, setMode] = useState<WeatherMode>({ kind: 'loading' });
  // undefined = still resolving, null = unavailable, string = label.
  const [place, setPlace] = useState<string | null | undefined>(undefined);

  const resolve = useCallback(async () => {
    setMode({ kind: 'loading' });
    setPlace(undefined);
    pruneEphemeralWeather(); // fire-and-forget cleanup

    const online = typeof navigator === 'undefined' ? true : navigator.onLine;
    const userId = await getLocalUserId();
    const fallback = async (reason: 'offline-no-cache' | 'position-unavailable' | 'fetch-failed') => {
      const fb = userId ? await getOfflineFallback(userId) : null;
      if (fb) {
        setMode({
          kind: 'offline-fallback',
          data: fb.data,
          trailName: fb.trailName,
          stageTitle: fb.stageTitle,
          fetchedAt: fb.fetchedAt,
        });
      } else {
        setMode({ kind: 'empty', reason });
      }
    };

    // Mode 2/3: offline → derive from cache, else empty.
    if (!online) {
      await fallback('offline-no-cache');
      return;
    }

    // Mode 1: online → need GPS for a live current-position forecast.
    let pos;
    try {
      pos = await getCurrentPosition();
    } catch (err) {
      if (err && typeof err === 'object' && (err as GeolocationPositionError).code === PERMISSION_DENIED) {
        setMode({ kind: 'empty', reason: 'permission-denied' });
      } else {
        await fallback('position-unavailable');
      }
      return;
    }

    try {
      const forecast = await getCurrentPositionForecast(pos.lat, pos.lon);
      setMode({ kind: 'online', lat: pos.lat, lon: pos.lon, forecast });
      // Resolve the place name in the background — never gates the chart.
      reverseGeocode(pos.lat, pos.lon)
        .then((r) => setPlace(formatReverse(r) || null))
        .catch(() => setPlace(null));
    } catch {
      await fallback('fetch-failed');
    }
  }, []);

  useEffect(() => {
    resolve();
  }, [resolve]);

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pt-4">
      <header className="space-y-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="text-2xl font-bold">Weather</h1>
          {mode.kind === 'online' && currentTemp(mode.forecast) !== null && (
            <span className="text-2xl font-semibold tabular-nums text-muted-foreground">
              {currentTemp(mode.forecast)}°
            </span>
          )}
        </div>

        {mode.kind === 'online' && place !== null && (
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPinIcon className="h-3.5 w-3.5 shrink-0" />
            {place === undefined ? (
              <span className="inline-block h-3 w-28 animate-pulse rounded bg-muted" />
            ) : (
              place
            )}
          </p>
        )}
      </header>

      {mode.kind === 'loading' && (
        <>
          <MeteogramSkeleton />
          <RadarSkeleton />
        </>
      )}

      {mode.kind === 'online' && (
        <>
          <Meteogram data={forecastToMeteogram(mode.forecast)} />
          <RadarMap lat={mode.lat} lon={mode.lon} />
        </>
      )}

      {mode.kind === 'offline-fallback' && (
        <>
          <OfflineBanner
            trailName={mode.trailName}
            stageTitle={mode.stageTitle}
            fetchedAt={mode.fetchedAt}
          />
          <Meteogram data={mode.data} />
          <WeatherEmptyState reason="radar-offline" />
        </>
      )}

      {mode.kind === 'empty' && <WeatherEmptyState reason={mode.reason} onRetry={resolve} />}
    </div>
  );
}
