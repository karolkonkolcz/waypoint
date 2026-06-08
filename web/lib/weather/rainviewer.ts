// RainViewer API client for the radar overlay. Free tier (effective 2026-01-01):
// past radar only — last ~2 h at 10-min intervals (~12 frames), max zoom 7,
// Universal Blue colour scheme only, attribution required. Nowcast is
// discontinued and deliberately ignored. See HANDOFF §RainViewer.

export interface RainViewerFrame {
  time: number; // Unix timestamp (seconds)
  path: string; // e.g. "/v2/radar/1720000000"
}

const FRAMES_URL = 'https://api.rainviewer.com/public/weather-maps.json';

/** Maximum zoom radar tiles carry data for — locks the map so tiles never upscale. */
export const RAINVIEWER_MAX_ZOOM = 7;

/** Required attribution markup for the map UI. */
export const RAINVIEWER_ATTRIBUTION =
  '<a href="https://www.rainviewer.com" target="_blank" rel="noreferrer">Rain Viewer</a>';

/**
 * Fetch the list of past radar frames. Returns an empty array on any failure
 * (network, 4xx/5xx, malformed body) so the caller can show an empty state and
 * never crash — RainViewer does not guarantee data availability.
 */
export async function fetchRainViewerFrames(): Promise<RainViewerFrame[]> {
  try {
    const res = await fetch(FRAMES_URL);
    if (!res.ok) return [];
    const data = await res.json();
    // Only `radar.past` — nowcast is discontinued and intentionally ignored.
    return (data?.radar?.past ?? []) as RainViewerFrame[];
  } catch {
    return [];
  }
}

/**
 * Build a MapLibre raster tile URL template for a frame path.
 * size=512, color=2 (Universal Blue), options=1_1 (smooth + show snow).
 * `{z}/{x}/{y}` stay as MapLibre template variables — pass the string as-is to
 * a raster source's `tiles` array.
 */
export function buildRainViewerTileUrl(path: string): string {
  return `https://tilecache.rainviewer.com${path}/512/{z}/{x}/{y}/2/1_1.png`;
}
