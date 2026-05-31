import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '@/lib/db/dexie';
import { parseGPXTracks } from '../parse';
import { importTrek, deriveTrailName, buildTrekPreview } from '../import';
import { stageRepo } from '@/lib/db/repositories/stage.repo';
import { routeRepo } from '@/lib/db/repositories/route.repo';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const day = (n: number, lat: number, lon: number, ele: number, ele2: number) =>
  `<trk><name>Deň ${n}</name><trkseg>
    <trkpt lat="${lat}" lon="${lon}"><ele>${ele}</ele></trkpt>
    <trkpt lat="${lat + 0.01}" lon="${lon + 0.01}"><ele>${ele2}</ele></trkpt>
  </trkseg></trk>`;

// 3 days, exported in reverse (mapy.com style)
const TREK = `<?xml version="1.0"?><gpx version="1.1">
  ${day(3, 42.2, 9.2, 1000, 1200)}
  ${day(2, 42.1, 9.1, 1100, 900)}
  ${day(1, 42.0, 9.0, 1000, 1100)}
</gpx>`;

const USER = '00000000-0000-0000-0000-000000000001';

describe('deriveTrailName', () => {
  it('strips export- prefix and extension, title-cases', () => {
    expect(deriveTrailName('export-Korzika.gpx')).toBe('Korzika');
    expect(deriveTrailName('gr20_corsica.GPX')).toBe('Gr20 Corsica');
    expect(deriveTrailName('export-.gpx')).toBe('Imported trek');
  });
});

describe('buildTrekPreview', () => {
  it('summarizes days and totals without writing', async () => {
    const p = buildTrekPreview(TREK, 'export-Korzika.gpx');
    expect(p.trailName).toBe('Korzika');
    expect(p.tracks).toHaveLength(3);
    expect(p.tracks.map((t) => t.dayNumber)).toEqual([1, 2, 3]);
    expect(p.totalAscentM).toBe(300); // 100 + 0 + 200
    expect(await db.trails.count()).toBe(0); // nothing persisted
  });
});

describe('importTrek', () => {
  it('creates one trail, one stage per day, one route per stage', async () => {
    const tracks = parseGPXTracks(TREK);
    const { trailId, stageCount } = await importTrek(tracks, {
      userId: USER,
      trailName: 'Corsica GR20',
      startDate: '2026-06-01',
    });

    expect(stageCount).toBe(3);

    const trail = await db.trails.get(trailId);
    expect(trail?.name).toBe('Corsica GR20');
    expect(trail?.start_date).toBe('2026-06-01');

    const stages = await stageRepo.findByTrail(trailId);
    expect(stages).toHaveLength(3);
    expect(stages.map((s) => s.order_index)).toEqual([0, 1, 2]);
    expect(stages.map((s) => s.title)).toEqual(['Deň 1', 'Deň 2', 'Deň 3']);
    // difficulty computed automatically
    expect(stages[0].difficulty_class).toBeTruthy();

    // each stage has its own route with matching geometry
    for (const s of stages) {
      const route = await routeRepo.findByStage(s.id);
      expect(route).toBeTruthy();
      expect(route?.stage_id).toBe(s.id);
      expect(route?.total_distance_km).toBe(s.distance_km);
      expect(route?.geojson.coordinates).toHaveLength(2);
    }

    // no trail-level (stage_id=null) route was created
    expect(await routeRepo.findByTrail(trailId)).toBeUndefined();
  });

  it('falls back to Day N titles when tracks are unnamed', async () => {
    const noNames = TREK.replace(/Deň \d/g, '');
    const tracks = parseGPXTracks(noNames);
    const { trailId } = await importTrek(tracks, { userId: USER, trailName: 'X' });
    const stages = await stageRepo.findByTrail(trailId);
    expect(stages.map((s) => s.title)).toEqual(['Day 1', 'Day 2', 'Day 3']);
  });
});
