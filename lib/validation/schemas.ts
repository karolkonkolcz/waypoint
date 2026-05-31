import { z } from 'zod';

export const trailSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().nullable(),
  start_date: z.string().nullable(),
  default_pace_kmh: z.number().positive().max(20),
  preferences: z.record(z.string(), z.unknown()).default({}),
});

export const stageSchema = z.object({
  id: z.string().uuid(),
  trail_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  order_index: z.number().int().nonnegative(),
  distance_km: z.number().positive(),
  ascent_m: z.number().int().nonnegative(),
  descent_m: z.number().int().nonnegative(),
  start_distance_km: z.number().nonnegative().nullable(),
  end_distance_km: z.number().nonnegative().nullable(),
  notes: z.string().nullable(),
});

export const waypointSchema = z.object({
  id: z.string().uuid(),
  trail_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  type: z.enum(['water', 'camp', 'shelter', 'resupply', 'town', 'peak', 'other']),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  elevation_m: z.number().int().nullable(),
  distance_along_route_km: z.number().nonnegative().nullable(),
  description: z.string().nullable(),
});

export const geoJSONLineStringSchema = z.object({
  type: z.literal('LineString'),
  coordinates: z
    .array(z.union([z.tuple([z.number(), z.number()]), z.tuple([z.number(), z.number(), z.number()])]))
    .min(2),
});

export type TrailInput = z.infer<typeof trailSchema>;
export type StageInput = z.infer<typeof stageSchema>;
export type WaypointInput = z.infer<typeof waypointSchema>;
