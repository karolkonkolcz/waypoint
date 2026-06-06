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

// ---------------------------------------------------------------------------
// Reverse geocoding — coordinates → place name, for the /weather page header.
// Open-Meteo's geocoding API is forward-only (name → coords), so this uses
// BigDataCloud's client endpoint (keyless, CORS-enabled, built for browser use).
// ---------------------------------------------------------------------------

export interface ReverseGeocodeResult {
  /** Best human label: town/village, else the wider area, else country. */
  place: string | null;
  region: string | null; // admin1 / principal subdivision
  country: string | null;
}

interface BigDataCloudResponse {
  city?: string;
  locality?: string;
  principalSubdivision?: string;
  countryName?: string;
}

/**
 * Resolve coordinates to a place name. Prefers the most specific populated
 * place (city → locality); in rural / unpopulated terrain those are blank, so
 * it falls back to the region (principal subdivision), then the country. Throws
 * on network/HTTP failure so the caller can simply hide the label.
 */
export async function reverseGeocode(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<ReverseGeocodeResult> {
  const url = new URL('https://api.bigdatacloud.net/data/reverse-geocode-client');
  url.searchParams.set('latitude', lat.toFixed(4));
  url.searchParams.set('longitude', lon.toFixed(4));
  url.searchParams.set('localityLanguage', 'en');

  const res = await fetch(url.toString(), { signal });
  if (!res.ok) throw new Error(`Reverse geocoding error: ${res.status}`);
  const d = (await res.json()) as BigDataCloudResponse;

  const region = d.principalSubdivision || null;
  const country = d.countryName || null;
  // Rural fallback chain: populated place → region (area) → country.
  const place = d.city || d.locality || region || country;

  return { place, region, country };
}

/** Display label for a reverse-geocode hit, e.g. "Ústí nad Labem, Czechia". */
export function formatReverse(r: ReverseGeocodeResult): string {
  const parts: string[] = [];
  if (r.place) parts.push(r.place);
  if (r.country && r.country !== r.place) parts.push(r.country);
  return parts.join(', ');
}
