'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl, { type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { PauseIcon, PlayIcon } from 'lucide-react';
import {
  buildRainViewerTileUrl,
  fetchRainViewerFrames,
  RAINVIEWER_ATTRIBUTION,
  RAINVIEWER_MAX_ZOOM,
  type RainViewerFrame,
} from '@/lib/weather/rainviewer';

interface Props {
  lat: number;
  lon: number;
}

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_API_KEY;
const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#e8eae6' } }],
};

/** Same basemap as the rest of the app (MapView), replicated to keep MapLibre
 *  confined to this lazy chunk rather than importing across modules. */
function resolveStyle(): string | StyleSpecification {
  return MAPTILER_KEY
    ? `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${MAPTILER_KEY}`
    : FALLBACK_STYLE;
}

const RADAR_SRC = 'rainviewer';
const RADAR_LAYER = 'rainviewer-layer';
const FRAME_MS = 500; // ~500 ms per frame
const REFRESH_MS = 10 * 60 * 1000; // new radar data arrives every 5–10 min

export default function RadarMap({ lat, lon }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const styleReadyRef = useRef(false);

  const [frames, setFrames] = useState<RainViewerFrame[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [failed, setFailed] = useState(false);

  // Create the map once, centred on and locked to the current position / zoom 7.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: resolveStyle(),
      center: [lon, lat],
      zoom: RAINVIEWER_MAX_ZOOM,
      // Radar tiles carry no data above zoom 7 — lock so they never upscale.
      maxZoom: RAINVIEWER_MAX_ZOOM,
      minZoom: 3,
      // No on-map attribution — it's rendered as a static credit line below the
      // map so it never overlaps the timestamp or the scrub bar.
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    new maplibregl.Marker({ color: '#2563eb' }).setLngLat([lon, lat]).addTo(map);
    map.on('load', () => {
      styleReadyRef.current = true;
    });
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      styleReadyRef.current = false;
    };
  }, [lat, lon]);

  // Load the frame list on mount and refresh it every 10 minutes.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const list = await fetchRainViewerFrames();
      if (cancelled) return;
      if (list.length === 0) {
        setFailed(true);
        return;
      }
      setFailed(false);
      setFrames(list);
      setIndex((i) => (i >= list.length ? list.length - 1 : i));
    };
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Auto-play loop.
  useEffect(() => {
    if (!playing || frames.length === 0) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % frames.length), FRAME_MS);
    return () => clearInterval(id);
  }, [playing, frames.length]);

  // Swap the raster source/layer to the current frame (low memory — one layer).
  useEffect(() => {
    const map = mapRef.current;
    const frame = frames[index];
    if (!map || !frame) return;

    const apply = () => {
      if (map.getLayer(RADAR_LAYER)) map.removeLayer(RADAR_LAYER);
      if (map.getSource(RADAR_SRC)) map.removeSource(RADAR_SRC);
      map.addSource(RADAR_SRC, {
        type: 'raster',
        tiles: [buildRainViewerTileUrl(frame.path)],
        tileSize: 512,
        maxzoom: RAINVIEWER_MAX_ZOOM,
        attribution: RAINVIEWER_ATTRIBUTION,
      });
      map.addLayer({ id: RADAR_LAYER, type: 'raster', source: RADAR_SRC, paint: { 'raster-opacity': 0.7 } });
    };

    if (styleReadyRef.current && map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [frames, index]);

  const currentTime = frames[index]
        ? new Date(frames[index].time * 1000).toLocaleTimeString('cs-CZ', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

  return (
    <div className="space-y-1">
      <div className="relative h-72 w-full overflow-hidden rounded-2xl border bg-card">
        <div ref={containerRef} className="h-full w-full" />

        {/* Frame timestamp overlay (top-left). */}
        <div className="pointer-events-none absolute left-2 top-2 rounded-lg bg-card/85 px-2 py-1 text-xs font-medium backdrop-blur">
          {failed ? 'Radar není dostupný' : `Radar · ${currentTime}`}
        </div>

        {/* Play/pause + scrub controls (bottom bar). */}
        {frames.length > 0 && (
          <div className="absolute inset-x-2 bottom-2 flex items-center gap-2 rounded-xl bg-card/90 px-2 py-1.5 backdrop-blur">
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? 'Pozastavit radar' : 'Spustit radar'}
              className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-muted active:scale-95"
            >
              {playing ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
            </button>
            <input
              type="range"
              min={0}
              max={frames.length - 1}
              value={index}
              onChange={(e) => {
                setPlaying(false);
                setIndex(Number(e.target.value));
              }}
              className="flex-1 accent-primary"
              aria-label="Snímek radaru"
            />
          </div>
        )}
      </div>

      {/* Attribution placed below the map (required Rain Viewer link + basemap). */}
      <p className="px-1 text-right text-[10px] leading-tight text-muted-foreground">
        <a
          href="https://www.rainviewer.com"
          target="_blank"
          rel="noreferrer"
          className="hover:underline"
        >
          Rain Viewer
        </a>
        {MAPTILER_KEY ? ' · © MapTiler © OpenStreetMap contributors' : ''}
      </p>
    </div>
  );
}
