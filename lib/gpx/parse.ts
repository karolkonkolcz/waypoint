import { haversineKm } from '@/lib/domain/geo';
import type { GeoJSONLineString } from '@/lib/domain/geo';

export interface ParsedGPX {
  geojson: GeoJSONLineString;
  total_distance_km: number;
  total_ascent_m: number;
  total_descent_m: number;
  elevation_profile: { d_km: number; ele_m: number }[];
}

/** A single `<trk>`/`<rte>` from a GPX file — one hiking day. */
export interface ParsedTrack extends ParsedGPX {
  name: string | null;
  /** First integer found in the track name (e.g. "Deň 6" → 6), or null. */
  dayNumber: number | null;
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

// One <trk>…</trk> or <rte>…</rte> block (a single day/segment).
const TRACK_RE = /<(trk|rte)\b[\s\S]*?<\/\1>/g;
// First <name> inside a track block.
const NAME_RE = /<name>\s*([\s\S]*?)\s*<\/name>/;
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

/** Computes geometry + statistics from an ordered list of raw points. */
function buildFromPoints(points: RawPoint[]): ParsedGPX {
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

/** Extracts the first integer in a track name ("Deň 6 - nedela" → 6). */
function extractDayNumber(name: string | null): number | null {
  if (!name) return null;
  const m = name.match(/\d{1,4}/);
  return m ? parseInt(m[0], 10) : null;
}

function firstPoint(t: ParsedTrack): [number, number] {
  const [lon, lat] = t.geojson.coordinates[0];
  return [lon, lat];
}

function lastPoint(t: ParsedTrack): [number, number] {
  const [lon, lat] = t.geojson.coordinates[t.geojson.coordinates.length - 1];
  return [lon, lat];
}

/** Sum of the gaps between consecutive tracks' end → next start (km). */
function gapSum(tracks: ParsedTrack[]): number {
  let sum = 0;
  for (let i = 0; i < tracks.length - 1; i++) {
    sum += haversineKm(lastPoint(tracks[i]), firstPoint(tracks[i + 1]));
  }
  return sum;
}

/**
 * Orders day-tracks into hiking sequence.
 * - If every track carries a distinct day number (e.g. mapy.com "Deň N"),
 *   sort by it ascending.
 * - Otherwise pick the orientation (file order vs reversed) whose consecutive
 *   tracks connect best — mapy.com exports days in reverse, so this un-reverses
 *   them and avoids stitching the route with phantom inter-day jumps.
 */
function orderTracks(tracks: ParsedTrack[]): ParsedTrack[] {
  if (tracks.length <= 1) return tracks;

  const days = tracks.map((t) => t.dayNumber);
  const allNumbered = days.every((d) => d !== null);
  const allDistinct = new Set(days).size === tracks.length;
  if (allNumbered && allDistinct) {
    return [...tracks].sort((a, b) => (a.dayNumber as number) - (b.dayNumber as number));
  }

  const reversed = [...tracks].reverse();
  return gapSum(reversed) < gapSum(tracks) ? reversed : tracks;
}

/**
 * Parses a GPX file into one ParsedTrack per `<trk>`/`<rte>` (one per hiking day),
 * ordered into hiking sequence. Each track keeps its own geometry and statistics —
 * tracks are never stitched together, so cross-day jumps never pollute the numbers.
 *
 * Works in browser and Node.js (no DOMParser dependency).
 */
export function parseGPXTracks(xmlText: string): ParsedTrack[] {
  const tracks: ParsedTrack[] = [];
  let block: RegExpExecArray | null;
  TRACK_RE.lastIndex = 0;

  while ((block = TRACK_RE.exec(xmlText)) !== null) {
    const blockXml = block[0];
    const points = extractPoints(blockXml);
    if (points.length < 2) continue; // skip empty/degenerate tracks

    const nameM = NAME_RE.exec(blockXml);
    const name = nameM ? nameM[1].trim() || null : null;

    tracks.push({
      ...buildFromPoints(points),
      name,
      dayNumber: extractDayNumber(name),
    });
  }

  if (tracks.length === 0) {
    throw new GPXParseError('GPX contains no track with at least 2 points');
  }

  return orderTracks(tracks);
}

/**
 * Parses a GPX file into a single merged route (all tracks concatenated in
 * hiking order). Kept for single-track files and the trail-level overview.
 * For per-day stages use {@link parseGPXTracks}.
 */
export function parseGPX(xmlText: string): ParsedGPX {
  const tracks = parseGPXTracks(xmlText);
  if (tracks.length === 1) return stripTrackMeta(tracks[0]);

  // Merge ordered tracks, dropping a duplicated boundary point where one day's
  // end coincides with the next day's start.
  const merged: RawPoint[] = [];
  for (const t of tracks) {
    for (const [lon, lat, ele] of t.geojson.coordinates) {
      const prev = merged[merged.length - 1];
      if (prev && prev.lon === lon && prev.lat === lat) continue;
      merged.push({ lon, lat, ele: ele ?? 0 });
    }
  }
  return buildFromPoints(merged);
}

function stripTrackMeta(t: ParsedTrack): ParsedGPX {
  const { name: _name, dayNumber: _dayNumber, ...rest } = t;
  return rest;
}
