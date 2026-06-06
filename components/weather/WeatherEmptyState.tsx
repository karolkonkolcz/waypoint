'use client';

import { CloudOffIcon, MapPinOffIcon, RadarIcon, WifiOffIcon } from 'lucide-react';
import type { EmptyReason } from '@/lib/weather/types';

type Variant = EmptyReason | 'radar-offline';

interface Props {
  reason: Variant;
  /** Retry hook for transient failures (geolocation timeout / fetch error). */
  onRetry?: () => void;
}

const COPY: Record<Variant, { title: string; body: string; Icon: typeof CloudOffIcon }> = {
  'offline-no-cache': {
    title: 'Weather needs a connection',
    body: 'Weather for your current position requires a connection. Open a trail while online to cache its forecast for offline use.',
    Icon: WifiOffIcon,
  },
  'permission-denied': {
    title: 'Location is off',
    body: 'Enable location to see weather for your position.',
    Icon: MapPinOffIcon,
  },
  'position-unavailable': {
    title: "Couldn't find your position",
    body: 'Your location is unavailable right now. Try again in a moment.',
    Icon: MapPinOffIcon,
  },
  'fetch-failed': {
    title: 'Weather unavailable',
    body: "Couldn't load the forecast. Check your connection and try again.",
    Icon: CloudOffIcon,
  },
  'radar-offline': {
    title: 'Radar needs a connection',
    body: 'Live precipitation radar requires a connection.',
    Icon: RadarIcon,
  },
};

/**
 * Full-width empty state for the /weather page modes that have nothing to chart:
 * offline with no cache, denied/unavailable geolocation, a failed fetch, or the
 * offline radar placeholder.
 */
export default function WeatherEmptyState({ reason, onRetry }: Props) {
  const { title, body, Icon } = COPY[reason];
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-border px-6 py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground active:scale-95"
        >
          Try again
        </button>
      )}
    </div>
  );
}
