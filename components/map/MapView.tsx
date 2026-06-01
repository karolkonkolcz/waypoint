'use client';

import { useEffect, useRef } from 'react';
import maplibregl, { type StyleSpecification } from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { BBox, GeoJSONLineString } from '@/lib/domain/geo';
import { bboxOf, mergeBboxes } from '@/lib/domain/geo';

export interface MapRoute {
  id: string;
  geojson: GeoJSONLineString;
  color: string;
}

interface Props {
  routes: MapRoute[];
  className?: string;
  interactive?: boolean;
  /** When set, clicking the map reports the tapped coordinates (pick mode). */
  onPick?: (lat: number, lon: number) => void;
  /** A pin to display, e.g. the currently picked location. */
  marker?: { lat: number; lon: number } | null;
}

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_API_KEY;

/**
 * Offline-safe fallback style: a blank canvas. The route polyline is drawn on
 * top from local GeoJSON, so the day stays readable even with no API key and
 * no tile network (matches ARCHITECTURE §7.3 fallback).
 */
const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#e8eae6' } }],
};

function resolveStyle(): string | StyleSpecification {
  // MapTiler "outdoor" is a hiking-oriented vector basemap. The key is public
  // (NEXT_PUBLIC_*) because the map runs in the browser.
  return MAPTILER_KEY
    ? `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${MAPTILER_KEY}`
    : FALLBACK_STYLE;
}

// The PMTiles protocol is registered globally once so F4b (offline tiles from
// OPFS) can point a source at `pmtiles://…` without further wiring.
let pmtilesRegistered = false;
function ensurePmtilesProtocol() {
  if (pmtilesRegistered) return;
  maplibregl.addProtocol('pmtiles', new Protocol().tile);
  pmtilesRegistered = true;
}

export function MapView({ routes, className, interactive = true, onPick, marker }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const centeredRef = useRef(false);

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    ensurePmtilesProtocol();

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: resolveStyle(),
      center: [19, 48.7], // Slovakia-ish default until fitBounds kicks in
      zoom: 5,
      interactive,
      attributionControl: { compact: true },
    });
    if (interactive) {
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    }
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [interactive]);

  // (Re)draw route polylines whenever they change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || routes.length === 0) return;

    const draw = () => {
      const boxes: BBox[] = [];
      for (const r of routes) {
        const srcId = `route-${r.id}`;
        const layerId = `${srcId}-line`;
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getSource(srcId)) map.removeSource(srcId);

        map.addSource(srcId, {
          type: 'geojson',
          data: { type: 'Feature', geometry: r.geojson, properties: {} },
        });
        map.addLayer({
          id: layerId,
          type: 'line',
          source: srcId,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': r.color, 'line-width': 4 },
        });
        if (r.geojson.coordinates.length > 0) boxes.push(bboxOf(r.geojson));
      }

      const bounds = mergeBboxes(boxes);
      if (bounds) {
        map.fitBounds(
          [
            [bounds[0], bounds[1]],
            [bounds[2], bounds[3]],
          ],
          { padding: 40, animate: false, maxZoom: 15 },
        );
      }
    };

    if (map.isStyleLoaded()) draw();
    else map.once('load', draw);
  }, [routes]);

  // Pick mode: report tapped coordinates and use a crosshair cursor.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !onPick) return;
    const handler = (e: maplibregl.MapMouseEvent) => onPick(e.lngLat.lat, e.lngLat.lng);
    map.on('click', handler);
    const canvas = map.getCanvas();
    canvas.style.cursor = 'crosshair';
    return () => {
      map.off('click', handler);
      canvas.style.cursor = '';
    };
  }, [onPick]);

  // Place / move / remove the marker pin.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!marker) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) markerRef.current = new maplibregl.Marker({ color: '#2563eb' });
    markerRef.current.setLngLat([marker.lon, marker.lat]).addTo(map);
    // Frame the pin once on first appearance when there's no route to fit to.
    if (!centeredRef.current && routes.length === 0) {
      map.jumpTo({ center: [marker.lon, marker.lat], zoom: Math.max(map.getZoom(), 9) });
      centeredRef.current = true;
    }
  }, [marker, routes.length]);

  return <div ref={containerRef} className={className} />;
}
