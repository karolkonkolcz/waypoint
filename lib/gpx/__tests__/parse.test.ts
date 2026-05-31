import { describe, it, expect } from 'vitest';
import { parseGPX, parseGPXTracks, GPXParseError } from '../parse';

const SIMPLE_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <trk>
    <trkseg>
      <trkpt lat="47.0" lon="8.0"><ele>500</ele></trkpt>
      <trkpt lat="47.1" lon="8.0"><ele>600</ele></trkpt>
      <trkpt lat="47.2" lon="8.0"><ele>550</ele></trkpt>
    </trkseg>
  </trk>
</gpx>`;

// Route format (<rte>/<rtept>) instead of track
const ROUTE_GPX = `<?xml version="1.0"?>
<gpx version="1.1" creator="test">
  <rte>
    <rtept lat="47.0" lon="8.0"><ele>500</ele></rtept>
    <rtept lat="47.1" lon="8.0"><ele>600</ele></rtept>
  </rte>
</gpx>`;

const NO_ELE_GPX = `<?xml version="1.0"?>
<gpx version="1.1">
  <trk><trkseg>
    <trkpt lat="47.0" lon="8.0"/>
    <trkpt lat="47.1" lon="8.0"/>
  </trkseg></trk>
</gpx>`;

describe('parseGPX', () => {
  it('extracts coordinates in GeoJSON [lon, lat, ele] order', () => {
    const result = parseGPX(SIMPLE_GPX);
    expect(result.geojson.type).toBe('LineString');
    expect(result.geojson.coordinates).toHaveLength(3);
    // GeoJSON uses [lon, lat, ele] — note swap from GPX lat/lon attribute order
    expect(result.geojson.coordinates[0]).toEqual([8.0, 47.0, 500]);
  });

  it('computes total distance (~22.24 km for 0.2° lat at 47°N)', () => {
    const result = parseGPX(SIMPLE_GPX);
    // Two segments of ~11.12 km each
    expect(result.total_distance_km).toBeGreaterThan(22);
    expect(result.total_distance_km).toBeLessThan(23);
  });

  it('computes ascent (500→600 = 100 m)', () => {
    const result = parseGPX(SIMPLE_GPX);
    expect(result.total_ascent_m).toBe(100);
  });

  it('computes descent (600→550 = 50 m)', () => {
    const result = parseGPX(SIMPLE_GPX);
    expect(result.total_descent_m).toBe(50);
  });

  it('builds elevation profile with matching point count', () => {
    const result = parseGPX(SIMPLE_GPX);
    expect(result.elevation_profile).toHaveLength(3);
    expect(result.elevation_profile[0]).toEqual({ d_km: 0, ele_m: 500 });
    expect(result.elevation_profile[2].ele_m).toBe(550);
  });

  it('supports <rtept> (route format) in addition to <trkpt>', () => {
    const result = parseGPX(ROUTE_GPX);
    expect(result.geojson.coordinates).toHaveLength(2);
    expect(result.total_ascent_m).toBe(100);
  });

  it('uses 0 for missing elevation and produces zero ascent/descent', () => {
    const result = parseGPX(NO_ELE_GPX);
    expect(result.total_ascent_m).toBe(0);
    expect(result.total_descent_m).toBe(0);
    expect(result.geojson.coordinates[0][2]).toBe(0);
  });

  it('filters sub-noise elevation changes (< 3 m)', () => {
    const gpx = `<gpx><trk><trkseg>
      <trkpt lat="47.0" lon="8.0"><ele>500</ele></trkpt>
      <trkpt lat="47.1" lon="8.0"><ele>502</ele></trkpt>
      <trkpt lat="47.2" lon="8.0"><ele>500</ele></trkpt>
    </trkseg></trk></gpx>`;
    const result = parseGPX(gpx);
    // 2m changes are below NOISE_M=3, so should be 0
    expect(result.total_ascent_m).toBe(0);
    expect(result.total_descent_m).toBe(0);
  });

  it('throws GPXParseError when no track points found', () => {
    expect(() => parseGPX('<gpx><metadata/></gpx>')).toThrow(GPXParseError);
  });

  it('throws GPXParseError when fewer than 2 track points', () => {
    const singlePoint = `<gpx><trk><trkseg>
      <trkpt lat="47.0" lon="8.0"><ele>500</ele></trkpt>
    </trkseg></trk></gpx>`;
    expect(() => parseGPX(singlePoint)).toThrow(GPXParseError);
    expect(() => parseGPX(singlePoint)).toThrow('at least 2');
  });

  it('downsamples elevation profile to ≤ 500 points when track is large', () => {
    const pts = Array.from({ length: 600 }, (_, i) => {
      const lat = (47 + i * 0.001).toFixed(6);
      return `<trkpt lat="${lat}" lon="8.0"><ele>${500 + i}</ele></trkpt>`;
    }).join('\n');
    const gpx = `<gpx><trk><trkseg>${pts}</trkseg></trk></gpx>`;
    const result = parseGPX(gpx);
    expect(result.elevation_profile.length).toBeLessThanOrEqual(500);
    // Last profile point preserves the final elevation
    expect(result.elevation_profile[result.elevation_profile.length - 1].ele_m).toBe(1099);
  });
});

// Two days that connect end→start: day 1 ends where day 2 begins.
const day1 = `<trk><name>Deň 1 - pondelok</name><trkseg>
  <trkpt lat="42.0" lon="9.0"><ele>1000</ele></trkpt>
  <trkpt lat="42.01" lon="9.01"><ele>1100</ele></trkpt>
</trkseg></trk>`;
const day2 = `<trk><name>Deň 2 - utorok</name><trkseg>
  <trkpt lat="42.01" lon="9.01"><ele>1100</ele></trkpt>
  <trkpt lat="42.02" lon="9.02"><ele>1050</ele></trkpt>
</trkseg></trk>`;

const wrap = (inner: string) => `<?xml version="1.0"?><gpx version="1.1">${inner}</gpx>`;
const orderedFile = wrap(`${day1}${day2}`);
// mapy.com exports days in reverse order (last day first).
const reversedFile = wrap(`${day2}${day1}`);

describe('parseGPXTracks', () => {
  it('returns one track per <trk> with its name and day number', () => {
    const tracks = parseGPXTracks(orderedFile);
    expect(tracks).toHaveLength(2);
    expect(tracks[0].name).toBe('Deň 1 - pondelok');
    expect(tracks[0].dayNumber).toBe(1);
    expect(tracks[1].dayNumber).toBe(2);
  });

  it('computes per-track stats independently (no cross-track stitching)', () => {
    const tracks = parseGPXTracks(orderedFile);
    expect(tracks[0].total_ascent_m).toBe(100); // 1000 -> 1100
    expect(tracks[0].total_descent_m).toBe(0);
    expect(tracks[1].total_ascent_m).toBe(0);
    expect(tracks[1].total_descent_m).toBe(50); // 1100 -> 1050
    expect(tracks[0].geojson.coordinates).toHaveLength(2);
  });

  it('orders reverse-exported days by their day number', () => {
    const tracks = parseGPXTracks(reversedFile);
    expect(tracks.map((t) => t.dayNumber)).toEqual([1, 2]);
  });

  it('falls back to continuity ordering when names lack day numbers', () => {
    const noNums = wrap(
      `${day2.replace('Deň 2 - utorok', 'utorok')}${day1.replace('Deň 1 - pondelok', 'pondelok')}`,
    );
    const tracks = parseGPXTracks(noNums);
    // day1 (ends at 42.01,9.01) should come before day2 (starts at 42.01,9.01)
    expect(tracks[0].geojson.coordinates[0]).toEqual([9.0, 42.0, 1000]);
  });

  it('throws when no track has at least 2 points', () => {
    expect(() => parseGPXTracks(wrap(`<trk><name>x</name><trkseg></trkseg></trk>`))).toThrow(
      GPXParseError,
    );
  });

  it('parseGPX merges ordered tracks without phantom inter-day jumps', () => {
    const merged = parseGPX(reversedFile);
    // day1 (~1.4km) + day2 (~1.4km); boundary point deduped → no big jump
    expect(merged.total_distance_km).toBeLessThan(4);
    expect(merged.total_ascent_m).toBe(100);
    expect(merged.total_descent_m).toBe(50);
  });
});
