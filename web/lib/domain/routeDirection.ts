import type { RouteRow, StageRow } from '@/lib/db/dexie';
import type { GeoJSONLineString } from '@/lib/domain/geo';

export interface RouteDirection {
  start: string;
  destination: string;
  label: string;
}

const ARROW_RE = /\s*(?:→|->|=>|–|—|-| do | to )\s*/i;

function cleanPart(value: string): string {
  return value
    .replace(/^\s*(?:den|deň|day)\s*\d+\s*[:.\-–—]?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDirectionFromTitle(title: string | null | undefined): RouteDirection | null {
  const cleaned = cleanPart(title ?? '');
  if (!cleaned) return null;

  const parts = cleaned.split(ARROW_RE).map(cleanPart).filter(Boolean);
  if (parts.length < 2) return null;

  const start = parts[0];
  const destination = parts[parts.length - 1];
  if (!start || !destination || start === destination) return null;
  return { start, destination, label: `${start} → ${destination}` };
}

function pointLabel(point: [number, number] | [number, number, number]): string {
  const [lon, lat] = point;
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

export function routeDirectionFromLine(
  line: GeoJSONLineString | null | undefined,
  title?: string | null,
): RouteDirection | null {
  const fromTitle = parseDirectionFromTitle(title);
  if (fromTitle) return fromTitle;

  const coords = line?.coordinates;
  if (!coords || coords.length < 2) return null;

  const start = pointLabel(coords[0]);
  const destination = pointLabel(coords[coords.length - 1]);
  return { start, destination, label: `${start} → ${destination}` };
}

export function stageDirection(stage: StageRow, route?: RouteRow | null): RouteDirection | null {
  return routeDirectionFromLine(route?.geojson, stage.title);
}

export function generatedStageTitle(
  stage: StageRow,
  route?: RouteRow | null,
  fallbackIndex?: number,
): string {
  const direction = stageDirection(stage, route);
  if (direction) return direction.label;

  const day = fallbackIndex ?? stage.order_index + 1;
  return stage.stage_type === 'transit' ? `Přesunový den ${day}` : `Den ${day}`;
}

export function stageDisplayTitle(
  stage: StageRow,
  route?: RouteRow | null,
  fallbackIndex?: number,
): string {
  const title = stage.title.trim();
  return title || generatedStageTitle(stage, route, fallbackIndex);
}
