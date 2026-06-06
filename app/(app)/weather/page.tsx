'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import {
  forecastToMeteogram,
  getCurrentPosition,
  getCurrentPositionForecast,
  pruneEphemeralWeather,
} from '@/lib/weather/current-position';
import { getOfflineFallback } from '@/lib/weather/offline-fallback';
import type { WeatherMode } from '@/lib/weather/types';
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

/** Read the logged-in user id from the locally stored session (no network, so
 *  it works offline — unlike auth.getUser which validates with the server). */
async function getUserId(): Promise<string | null> {
  try {
    const { data } = await createClient().auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

const PERMISSION_DENIED = 1; // GeolocationPositionError.PERMISSION_DENIED

export default function WeatherPage() {
  const [mode, setMode] = useState<WeatherMode>({ kind: 'loading' });

  const resolve = useCallback(async () => {
    setMode({ kind: 'loading' });
    pruneEphemeralWeather(); // fire-and-forget cleanup

    const online = typeof navigator === 'undefined' ? true : navigator.onLine;
    const userId = await getUserId();
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
    } catch {
      await fallback('fetch-failed');
    }
  }, []);

  useEffect(() => {
    resolve();
  }, [resolve]);

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pt-4">
      <h1 className="text-2xl font-bold">Weather</h1>

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
