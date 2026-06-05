import type { FC } from 'react';
import {
  SunIcon,
  CloudIcon,
  CloudSunIcon,
  CloudRainIcon,
  CloudDrizzleIcon,
  CloudSnowIcon,
  CloudLightningIcon,
} from 'lucide-react';
import type { WeatherCondition } from '@/lib/weather/forecast';

export type IconFC = FC<{ className?: string }>;

/**
 * Shared weather-condition → lucide icon map. Used by WeatherCard and the
 * dashboard MovingForecast so both screens speak the same visual vocabulary.
 */
export const CONDITION_ICON: Record<WeatherCondition, IconFC> = {
  'clear': SunIcon,
  'partly-cloudy': CloudSunIcon,
  'cloudy': CloudIcon,
  'fog': CloudIcon,
  'drizzle': CloudDrizzleIcon,
  'rain': CloudRainIcon,
  'snow': CloudSnowIcon,
  'storm': CloudLightningIcon,
};
