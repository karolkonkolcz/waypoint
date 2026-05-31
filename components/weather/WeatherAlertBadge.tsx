'use client';

import { TriangleAlertIcon } from 'lucide-react';
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
}

export function WeatherAlertBadge({ alerts, stale }: Props) {
  if (alerts.length === 0) return null;

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
                {alert.areas.length > 3 ? ` +${alert.areas.length - 3} more` : ''}
              </p>
            )}
            {alert.expires && (
              <p className="text-xs opacity-70">until {formatWhen(alert.expires)}</p>
            )}
          </div>
        </div>
      ))}
      {stale && (
        <p className="text-xs text-muted-foreground">Warnings may be out of date (offline).</p>
      )}
    </div>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
