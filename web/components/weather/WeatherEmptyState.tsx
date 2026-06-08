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
    title: 'Počasí potřebuje připojení',
    body: 'Počasí pro aktuální polohu vyžaduje připojení. Otevři trasu s připojením, aby se její předpověď uložila pro použití bez připojení.',
    Icon: WifiOffIcon,
  },
  'permission-denied': {
    title: 'Poloha je vypnutá',
    body: 'Povol polohu, aby se zobrazilo počasí pro tvoje místo.',
    Icon: MapPinOffIcon,
  },
  'position-unavailable': {
    title: 'Polohu se nepodařilo zjistit',
    body: 'Tvoje poloha teď není dostupná. Zkus to za chvíli znovu.',
    Icon: MapPinOffIcon,
  },
  'fetch-failed': {
    title: 'Počasí není dostupné',
    body: 'Předpověď se nepodařilo načíst. Zkontroluj připojení a zkus to znovu.',
    Icon: CloudOffIcon,
  },
  'radar-offline': {
    title: 'Radar potřebuje připojení',
    body: 'Živý srážkový radar vyžaduje připojení.',
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
          Zkusit znovu
        </button>
      )}
    </div>
  );
}
