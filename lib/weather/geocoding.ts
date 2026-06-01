export interface GeocodeResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country: string | null;
  admin1: string | null;
}

interface OpenMeteoGeocodeRow {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
}

/**
 * Searches place names via Open-Meteo's geocoding API (keyless, free, CORS-enabled).
 * Returns up to `count` matches; an empty array for blank/too-short queries.
 */
export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
  count = 5,
): Promise<GeocodeResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', q);
  url.searchParams.set('count', String(count));
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');

  const res = await fetch(url.toString(), { signal });
  if (!res.ok) throw new Error(`Open-Meteo geocoding error: ${res.status}`);
  const data = (await res.json()) as { results?: OpenMeteoGeocodeRow[] };

  return (data.results ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    latitude: r.latitude,
    longitude: r.longitude,
    country: r.country ?? null,
    admin1: r.admin1 ?? null,
  }));
}

/** "Bastia, Corsica, France" — name, then region, then country, skipping blanks. */
export function formatPlace(r: GeocodeResult): string {
  return [r.name, r.admin1, r.country].filter(Boolean).join(', ');
}
