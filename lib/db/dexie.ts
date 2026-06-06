import Dexie, { type Table } from 'dexie';
import type { GeoJSONLineString } from '@/lib/domain/geo';
import type { WeatherAlert } from '@/lib/alerts/meteoalarm';
import type { OpenMeteoForecast } from '@/lib/weather/types';

type Sync = {
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  _dirty: 0 | 1;
};

export interface TrailRow extends Sync {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  start_date: string | null;
  default_pace_kmh: number;
  preferences: Record<string, unknown>;
}

export interface RouteRow extends Sync {
  id: string;
  trail_id: string;
  // Per-stage geometry: each hiking day owns one route. null = legacy trail-level route.
  stage_id: string | null;
  user_id: string;
  geojson: GeoJSONLineString;
  total_distance_km: number;
  total_ascent_m: number;
  total_descent_m: number;
  elevation_profile: { d_km: number; ele_m: number }[];
  source: 'gpx' | 'manual';
}

export type StageType = 'trek' | 'transit';

export type MilestoneKind =
  | 'bus'
  | 'train'
  | 'flight'
  | 'transfer'
  | 'checkin'
  | 'meal'
  | 'note';

// One entry on a transit day's timeline. Stored as a JSON array on the stage —
// always loaded and edited together with the day, so it needs no own table.
export interface Milestone {
  id: string; // local UUID, used for React keys + reorder
  time: string | null; // "HH:MM" local, null = unscheduled
  title: string;
  kind: MilestoneKind;
  location: string | null;
  notes: string | null;
}

export interface StageRow extends Sync {
  id: string;
  trail_id: string;
  user_id: string;
  title: string;
  order_index: number;
  // Explicit calendar date (YYYY-MM-DD). null = derive from trail.start_date + order_index.
  date: string | null;
  // 'trek' = hiking day (metrics/route/weather). 'transit' = technical day (timeline).
  stage_type: StageType;
  distance_km: number;
  ascent_m: number;
  descent_m: number;
  start_distance_km: number | null;
  end_distance_km: number | null;
  difficulty_score: number | null;
  difficulty_class: string | null;
  notes: string | null;
  // Transit-day timeline + optional weather anchor (transit has no route midpoint).
  timeline: Milestone[];
  location_lat: number | null;
  location_lon: number | null;
  location_name: string | null;
}

export interface WaypointRow extends Sync {
  id: string;
  trail_id: string;
  user_id: string;
  name: string;
  type: 'water' | 'camp' | 'shelter' | 'resupply' | 'town' | 'peak' | 'other';
  latitude: number;
  longitude: number;
  elevation_m: number | null;
  distance_along_route_km: number | null;
  description: string | null;
}

export interface WeatherRow extends Sync {
  id: string;
  trail_id: string;
  stage_id: string | null;
  user_id: string;
  latitude: number;
  longitude: number;
  forecast_json: unknown;
  valid_from: string | null;
  valid_to: string | null;
  fetched_at: string;
}

export interface TodoRow extends Sync {
  id: string;
  user_id: string;
  trail_id: string;
  // Optional anchors: pin to a specific stage and/or a calendar day. Both null
  // = a trail-level reminder.
  stage_id: string | null;
  date: string | null;
  text: string;
  done: boolean;
  order_index: number;
}

// Derived cache (not synced to Supabase). One row per trail — MeteoAlarm
// warnings are country-level, so the whole trail shares them.
export interface AlertCacheRow {
  trail_id: string; // primary key
  country: string | null;
  alerts: WeatherAlert[];
  fetched_at: string;
}

// Ephemeral, local-only cache for the /weather page's current-position
// forecast. NOT user content: never synced to Supabase, no RLS, no _dirty.
// It is a read-through cache keyed by coarse (~1 km) coordinates and pruned
// after 24 h. Distinct from `weather` (trail-scoped, route-aware, synced cache).
export interface EphemeralWeatherRow {
  cacheKey: string; // "{lat2}:{lon2}" — coordinates rounded to 2dp (~1 km)
  forecast: OpenMeteoForecast;
  fetched_at: number; // Date.now()
}

export interface SyncOp {
  seq?: number;
  entity: string;
  op: 'upsert' | 'delete';
  row_id: string;
  created_at: string;
}

class WaypointDB extends Dexie {
  trails!: Table<TrailRow, string>;
  routes!: Table<RouteRow, string>;
  stages!: Table<StageRow, string>;
  waypoints!: Table<WaypointRow, string>;
  weather!: Table<WeatherRow, string>;
  alerts!: Table<AlertCacheRow, string>;
  todos!: Table<TodoRow, string>;
  ephemeral_weather!: Table<EphemeralWeatherRow, string>;
  syncQueue!: Table<SyncOp, number>;

  constructor() {
    super('waypoint');
    this.version(1).stores({
      trails: 'id, user_id, updated_at, _dirty',
      routes: 'id, trail_id, _dirty',
      stages: 'id, trail_id, order_index, _dirty',
      waypoints: 'id, trail_id, type, _dirty',
      weather: 'id, trail_id, stage_id, fetched_at',
      syncQueue: '++seq, entity, created_at',
    });

    // v2: route per stage — index stage_id, backfill existing rows to null.
    this.version(2)
      .stores({
        routes: 'id, trail_id, stage_id, _dirty',
      })
      .upgrade((tx) =>
        tx
          .table<RouteRow>('routes')
          .toCollection()
          .modify((r) => {
            if (r.stage_id === undefined) r.stage_id = null;
          }),
      );

    // v3: MeteoAlarm warnings cache (F5), keyed by trail_id.
    this.version(3).stores({
      alerts: 'trail_id, fetched_at',
    });

    // v4: stage_type + transit-day timeline. Backfill existing rows to 'trek'
    // with an empty timeline and no location anchor. Index stage_type for
    // type-filtered queries.
    this.version(4)
      .stores({
        stages: 'id, trail_id, order_index, stage_type, _dirty',
      })
      .upgrade((tx) =>
        tx
          .table<StageRow>('stages')
          .toCollection()
          .modify((s) => {
            if (s.stage_type === undefined) s.stage_type = 'trek';
            if (s.timeline === undefined) s.timeline = [];
            if (s.location_lat === undefined) s.location_lat = null;
            if (s.location_lon === undefined) s.location_lon = null;
            if (s.location_name === undefined) s.location_name = null;
          }),
      );

    // v5: per-stage override date. Backfill existing rows to null (= derive from
    // trail.start_date + order_index, the prior behaviour). No index needed —
    // dates are read with the already-loaded stage, never queried on directly.
    this.version(5).upgrade((tx) =>
      tx
        .table<StageRow>('stages')
        .toCollection()
        .modify((s) => {
          if (s.date === undefined) s.date = null;
        }),
    );

    // v6: todos store (dashboard reminders). Compound [trail_id+done] index
    // backs the "N left" count; stage_id index backs per-day pinning.
    this.version(6).stores({
      todos: 'id, trail_id, stage_id, [trail_id+done], _dirty',
    });

    // v7: ephemeral current-position weather cache for the /weather page.
    // Local-only (not synced) — primary key is a coarse coordinate cacheKey,
    // fetched_at indexed for staleness checks and 24 h pruning.
    this.version(7).stores({
      ephemeral_weather: '&cacheKey, fetched_at',
    });
  }
}

export const db = new WaypointDB();
