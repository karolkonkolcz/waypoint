import { haversineKm } from '@/lib/domain/geo';
import type { GeoJSONLineString } from '@/lib/domain/geo';

export interface ParsedGPX {
  geojson: GeoJSONLineString;
  total_distance_km: number;
  total_ascent_m: number;
  total_descent_m: number;
  elevation_profile: { d_km: number; ele_m: number }[];
}

// Filter elevation changes below this threshold to reduce GPS noise.
const NOISE_M = 3;
const MAX_PROFILE_POINTS = 500;

export class GPXParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GPXParseError';
  }
}

// Matches trkpt/rtept in both self-closing (<trkpt .../>) and full (<trkpt ...>...</trkpt>) form.
const POINT_RE = /<(trkpt|rtept)([\s\S]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g;
const LAT_RE = /\blat=["']([^"']+)["']/;
const LON_RE = /\blon=["']([^"']+)["']/;
const ELE_RE = /<ele>\s*([\d.eE+\-]+)\s*<\/ele>/;

interface RawPoint {
  lat: number;
  lon: number;
  ele: number;
}

function extractPoints(xml: string): RawPoint[] {
  const points: RawPoint[] = [];
  let match: RegExpExecArray | null;
  POINT_RE.lastIndex = 0;

  while ((match = POINT_RE.exec(xml)) !== null) {
    const attrs = match[2];
    // match[3] is undefined for self-closing tags (<trkpt .../>) — treat as empty body
    const body = match[3] ?? '';

    const latM = LAT_RE.exec(attrs);
    const lonM = LON_RE.exec(attrs);
    if (!latM || !lonM) throw new GPXParseError('Track point is missing valid lat/lon attributes');

    const lat = parseFloat(latM[1]);
    const lon = parseFloat(lonM[1]);
    if (isNaN(lat) || isNaN(lon)) throw new GPXParseError('Track point has invalid lat/lon value');

    const eleM = ELE_RE.exec(body);
    const ele = eleM ? parseFloat(eleM[1]) : 0;

    points.push({ lat, lon, ele: isNaN(ele) ? 0 : ele });
  }

  return points;
}

function downsampleProfile(
  profile: { d_km: number; ele_m: number }[],
): { d_km: number; ele_m: number }[] {
  if (profile.length <= MAX_PROFILE_POINTS) return profile;
  const step = (profile.length - 1) / (MAX_PROFILE_POINTS - 1);
  const result = Array.from({ length: MAX_PROFILE_POINTS }, (_, i) =>
    profile[Math.round(i * step)],
  );
  result[result.length - 1] = profile[profile.length - 1];
  return result;
}

/**
 * Parses a GPX XML string and returns geometry + statistics.
 * Supports both <trkpt> (track) and <rtept> (route) elements.
 * Works in browser and Node.js (no DOMParser dependency).
 */
export function parseGPX(xmlText: string): ParsedGPX {
  const points = extractPoints(xmlText);

  if (points.length < 2) {
    throw new GPXParseError('GPX must contain at least 2 track points');
  }

  // GeoJSON coordinates: [lon, lat, ele]
  const coords: [number, number, number][] = points.map((p) => [p.lon, p.lat, p.ele]);

  let distKm = 0;
  let ascentM = 0;
  let descentM = 0;
  const rawProfile: { d_km: number; ele_m: number }[] = [
    { d_km: 0, ele_m: coords[0][2] },
  ];

  for (let i = 1; i < coords.length; i++) {
    const [lon1, lat1, ele1] = coords[i - 1];
    const [lon2, lat2, ele2] = coords[i];
    distKm += haversineKm([lon1, lat1], [lon2, lat2]);
    const dEle = ele2 - ele1;
    if (dEle > NOISE_M) ascentM += dEle;
    else if (dEle < -NOISE_M) descentM -= dEle;
    rawProfile.push({ d_km: distKm, ele_m: ele2 });
  }

  return {
    geojson: { type: 'LineString', coordinates: coords },
    total_distance_km: Math.round(distKm * 100) / 100,
    total_ascent_m: Math.round(ascentM),
    total_descent_m: Math.round(descentM),
    elevation_profile: downsampleProfile(rawProfile),
  };
}
