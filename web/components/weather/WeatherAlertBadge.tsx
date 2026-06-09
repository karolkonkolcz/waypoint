'use client';

import { CheckCircle2Icon, Loader2Icon, TriangleAlertIcon, WifiOffIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WeatherAlert, AlertSeverity } from '@/lib/alerts/meteoalarm';

const SEVERITY_STYLE: Record<AlertSeverity, string> = {
  yellow:
    'border-yellow-300 bg-yellow-100 text-yellow-900 dark:border-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
  orange:
    'border-orange-300 bg-orange-100 text-orange-900 dark:border-orange-800 dark:bg-orange-900/30 dark:text-orange-200',
  red: 'border-red-300 bg-red-100 text-red-900 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200',
};

interface Props {
  alerts: WeatherAlert[];
  stale?: boolean;
  showEmpty?: boolean;
  loading?: boolean;
  checkedAt?: string | null;
  offline?: boolean;
}

export function WeatherAlertBadge({ alerts, stale, showEmpty, loading, checkedAt, offline }: Props) {
  if (alerts.length === 0 && !showEmpty) return null;

  if (alerts.length === 0) {
    return (
      <div className="rounded-2xl border bg-card px-3 py-3">
        <div className="flex items-start gap-2">
          {loading ? (
            <Loader2Icon className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
          ) : offline ? (
            <WifiOffIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <CheckCircle2Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#1c7c43]" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {loading
                ? 'Kontroluji meteorologické výstrahy'
                : offline
                  ? 'Výstrahy bez aktuální kontroly'
                  : 'Bez aktivních meteorologických výstrah'}
            </p>
            <p className="text-xs text-muted-foreground">
              {checkedAt
                ? `MeteoAlarm kontrolován ${formatWhen(checkedAt)}${stale ? ' · cache může být starší' : ''}`
                : 'Panel zůstává viditelný pro kontrolu MeteoAlarm API.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {alerts.map((alert, i) => (
        <div
          key={`${alert.severity}-${alert.event}-${i}`}
          className={cn(
            'flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm',
            SEVERITY_STYLE[alert.severity],
          )}
        >
          <TriangleAlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">{alert.event}</p>
            {alert.areas.length > 0 && (
              <p className="text-xs opacity-80">
                {alert.areas.slice(0, 3).join(', ')}
                {alert.areas.length > 3 ? ` +${alert.areas.length - 3} další` : ''}
              </p>
            )}
            {alert.expires && (
              <p className="text-xs opacity-70">do {formatWhen(alert.expires)}</p>
            )}
          </div>
        </div>
      ))}
      {stale && (
        <p className="text-xs text-muted-foreground">Výstrahy mohou být zastaralé (bez připojení).</p>
      )}
    </div>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('cs-CZ', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
