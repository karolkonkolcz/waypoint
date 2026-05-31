import Dexie, { type Table } from 'dexie';
import type { GeoJSONLineString } from '@/lib/domain/geo';

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

export interface StageRow extends Sync {
  id: string;
  trail_id: string;
  user_id: string;
  title: string;
  order_index: number;
  distance_km: number;
  ascent_m: number;
  descent_m: number;
  start_distance_km: number | null;
  end_distance_km: number | null;
  difficulty_score: number | null;
  difficulty_class: string | null;
  notes: string | null;
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
  }
}

export const db = new WaypointDB();
