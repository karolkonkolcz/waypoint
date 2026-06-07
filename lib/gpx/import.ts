import { parseGPXTracks, type ParsedTrack } from './parse';
import { trailRepo } from '@/lib/db/repositories/trail.repo';
import { stageRepo } from '@/lib/db/repositories/stage.repo';
import { routeRepo, type CreateRouteInput } from '@/lib/db/repositories/route.repo';

export interface TrekPreview {
  /** Suggested trail name (from file name). */
  trailName: string;
  tracks: ParsedTrack[];
  totalDistanceKm: number;
  totalAscentM: number;
}

export interface TrekImportOptions {
  userId: string;
  trailName: string;
  startDate?: string | null;
  defaultPaceKmh?: number;
}

export interface TrekImportResult {
  trailId: string;
  stageCount: number;
}

/**
 * Derives a human trail name from a GPX file name:
 * "export-Korzika.gpx" → "Korzika", "gr20_corsica.gpx" → "Gr20 Corsica".
 */
export function deriveTrailName(fileName: string): string {
  const base = fileName.replace(/\.gpx$/i, '').replace(/^export[-_\s]*/i, '');
  const words = base.replace(/[-_]+/g, ' ').trim();
  if (!words) return 'Importovaný trek';
  return words.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Parses a GPX file into a preview (days + totals) without writing anything. */
export function buildTrekPreview(xmlText: string, fileName: string): TrekPreview {
  const tracks = parseGPXTracks(xmlText);
  return {
    trailName: deriveTrailName(fileName),
    tracks,
    totalDistanceKm: Math.round(tracks.reduce((s, t) => s + t.total_distance_km, 0) * 10) / 10,
    totalAscentM: tracks.reduce((s, t) => s + t.total_ascent_m, 0),
  };
}

/**
 * Imports a multi-day GPX trek: creates one trail, one stage per track (day),
 * and one route per stage carrying that day's geometry. Difficulty is computed
 * automatically by stageRepo.create. Returns the new trail id.
 */
export async function importTrek(
  tracks: ParsedTrack[],
  opts: TrekImportOptions,
): Promise<TrekImportResult> {
  if (tracks.length === 0) throw new Error('Nejsou dostupné žádné trasy k importu');

  const trail = await trailRepo.create({
    user_id: opts.userId,
    name: opts.trailName,
    description: null,
    start_date: opts.startDate ?? null,
    default_pace_kmh: opts.defaultPaceKmh ?? 4,
    preferences: {},
  });

  const routeInputs: (CreateRouteInput & { stage_id: string })[] = [];

  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    const stage = await stageRepo.create({
      trail_id: trail.id,
      user_id: opts.userId,
      title: t.name ?? `Den ${i + 1}`,
      order_index: i,
      distance_km: t.total_distance_km,
      ascent_m: t.total_ascent_m,
      descent_m: t.total_descent_m,
      start_distance_km: null,
      end_distance_km: null,
      notes: null,
    });

    routeInputs.push({
      trail_id: trail.id,
      stage_id: stage.id,
      user_id: opts.userId,
      geojson: t.geojson,
      total_distance_km: t.total_distance_km,
      total_ascent_m: t.total_ascent_m,
      total_descent_m: t.total_descent_m,
      elevation_profile: t.elevation_profile,
      source: 'gpx',
    });
  }

  await routeRepo.bulkCreate(routeInputs);

  return { trailId: trail.id, stageCount: tracks.length };
}
