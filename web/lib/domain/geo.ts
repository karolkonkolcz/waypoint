// GeoJSON LineString: coordinates are [lon, lat, ele?]
export interface GeoJSONLineString {
  type: 'LineString';
  coordinates: ([number, number] | [number, number, number])[];
}

/** Bounding box as [west, south, east, north] (lon/lat degrees). */
export type BBox = [number, number, number, number];

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

type Coord2 = [number, number];

function toCoord2(c: [number, number] | [number, number, number]): Coord2 {
  return [c[0], c[1]];
}

/** Haversine distance in km between two [lon, lat] points. */
export function haversineKm([lon1, lat1]: Coord2, [lon2, lat2]: Coord2): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/** Total length of a LineString in km. */
export function totalDistance(line: GeoJSONLineString): number {
  const coords = line.coordinates.map(toCoord2);
  let dist = 0;
  for (let i = 1; i < coords.length; i++) {
    dist += haversineKm(coords[i - 1], coords[i]);
  }
  return dist;
}

/**
 * Returns cumulative distances array (km) with one entry per vertex.
 * cumulative[0] = 0, cumulative[n-1] = totalDistance.
 */
export function cumulativeDistances(line: GeoJSONLineString): number[] {
  const coords = line.coordinates.map(toCoord2);
  const cum: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    cum.push(cum[i - 1] + haversineKm(coords[i - 1], coords[i]));
  }
  return cum;
}

/**
 * Linear interpolation: returns [lon, lat] at `targetKm` along the LineString.
 * Clamps to start/end if targetKm is out of range.
 */
export function pointAtDistance(line: GeoJSONLineString, targetKm: number): Coord2 {
  const coords = line.coordinates.map(toCoord2);
  const cum = cumulativeDistances(line);
  const total = cum[cum.length - 1];

  if (targetKm <= 0) return coords[0];
  if (targetKm >= total) return coords[coords.length - 1];

  for (let i = 1; i < cum.length; i++) {
    if (cum[i] >= targetKm) {
      const t = (targetKm - cum[i - 1]) / (cum[i] - cum[i - 1]);
      const [lon1, lat1] = coords[i - 1];
      const [lon2, lat2] = coords[i];
      return [lon1 + t * (lon2 - lon1), lat1 + t * (lat2 - lat1)];
    }
  }

  return coords[coords.length - 1];
}

/**
 * Extracts a sub-LineString from startKm to endKm along the original route.
 * Used to get the geometry for a single stage.
 */
export function sliceLineString(
  line: GeoJSONLineString,
  startKm: number,
  endKm: number,
): GeoJSONLineString {
  const coords = line.coordinates.map(toCoord2);
  const cum = cumulativeDistances(line);
  const slice: Coord2[] = [];

  slice.push(pointAtDistance(line, startKm));

  for (let i = 0; i < coords.length; i++) {
    if (cum[i] > startKm && cum[i] < endKm) {
      slice.push(coords[i]);
    }
  }

  slice.push(pointAtDistance(line, endKm));

  return { type: 'LineString', coordinates: slice };
}

/**
 * Sample N evenly-spaced points along a LineString (inclusive of both ends).
 * Used to pick weather-fetch coordinates for a stage.
 */
export function samplePoints(
  line: GeoJSONLineString,
  n: number,
): [number, number][] {
  if (n <= 0) return [];
  const total = totalDistance(line);
  const points: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    points.push(pointAtDistance(line, (i / (n - 1)) * total));
  }
  return points;
}

/**
 * Bounding box of a LineString as [west, south, east, north].
 * Elevation (third coordinate slot) is ignored. Assumes ≥1 coordinate.
 */
export function bboxOf(line: GeoJSONLineString): BBox {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [lon, lat] of line.coordinates) {
    if (lon < west) west = lon;
    if (lon > east) east = lon;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  return [west, south, east, north];
}

/** Union of several bounding boxes. Returns null for an empty list. */
export function mergeBboxes(boxes: BBox[]): BBox | null {
  if (boxes.length === 0) return null;
  let [west, south, east, north] = boxes[0];
  for (let i = 1; i < boxes.length; i++) {
    const b = boxes[i];
    if (b[0] < west) west = b[0];
    if (b[1] < south) south = b[1];
    if (b[2] > east) east = b[2];
    if (b[3] > north) north = b[3];
  }
  return [west, south, east, north];
}
