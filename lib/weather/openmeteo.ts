export interface HourlyForecast {
  time: string[];
  temperature_2m: number[];
  precipitation: number[];
  windspeed_10m: number[];
  weathercode: number[];
}

export interface OpenMeteoResult {
  latitude: number;
  longitude: number;
  hourly: HourlyForecast;
}

/**
 * Fetches a single-day hourly forecast from Open-Meteo (keyless, free).
 * @param lat Latitude
 * @param lon Longitude
 * @param date YYYY-MM-DD — must be within the next 16 days
 */
export async function fetchOpenMeteo(
  lat: number,
  lon: number,
  date: string,
): Promise<OpenMeteoResult> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', lat.toFixed(4));
  url.searchParams.set('longitude', lon.toFixed(4));
  url.searchParams.set('hourly', 'temperature_2m,precipitation,windspeed_10m,weathercode');
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('start_date', date);
  url.searchParams.set('end_date', date);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Open-Meteo API error: ${res.status}`);
  return res.json() as Promise<OpenMeteoResult>;
}
