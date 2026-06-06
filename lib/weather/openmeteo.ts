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

/**
 * Fetches the same single-day forecast for several coordinates in ONE request.
 * Open-Meteo accepts comma-separated latitude/longitude lists and returns an
 * array (a single object when only one point is given — normalized here).
 * Used to sample weather along a route at the positions a hiker will reach.
 * Pass `endDate` (defaults to `date`) to also pull the next day's early hours,
 * which the route-aware snapshot uses for evening/night weather at the
 * destination.
 */
export async function fetchOpenMeteoMulti(
  points: { lat: number; lon: number }[],
  date: string,
  endDate: string = date,
): Promise<OpenMeteoResult[]> {
  if (points.length === 0) return [];

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', points.map((p) => p.lat.toFixed(4)).join(','));
  url.searchParams.set('longitude', points.map((p) => p.lon.toFixed(4)).join(','));
  url.searchParams.set('hourly', 'temperature_2m,precipitation,windspeed_10m,weathercode');
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('start_date', date);
  url.searchParams.set('end_date', endDate);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Open-Meteo API error: ${res.status}`);
  const data = await res.json();
  return (Array.isArray(data) ? data : [data]) as OpenMeteoResult[];
}
