import { describe, it, expect } from 'vitest';
import { parseGPX, GPXParseError } from '../parse';

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
