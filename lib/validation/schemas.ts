import { z } from 'zod';

export const trailSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().nullable(),
  start_date: z.string().nullable(),
  default_pace_kmh: z.number().positive().max(20),
  preferences: z.record(z.string(), z.unknown()).default({}),
});

export const milestoneSchema = z.object({
  id: z.string().uuid(),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time must be HH:MM')
    .nullable(),
  title: z.string().min(1).max(200),
  kind: z.enum(['bus', 'train', 'flight', 'transfer', 'checkin', 'meal', 'note']),
  location: z.string().max(200).nullable(),
  notes: z.string().max(2000).nullable(),
});

// Fields shared by both stage kinds.
const stageBase = {
  id: z.string().uuid(),
  trail_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  order_index: z.number().int().nonnegative(),
  date: z.string().nullable(),
  notes: z.string().nullable(),
};

// Trek day: a hiking day with metrics and an optional route segment.
export const trekStageSchema = z.object({
  ...stageBase,
  stage_type: z.literal('trek'),
  distance_km: z.number().positive(),
  ascent_m: z.number().int().nonnegative(),
  descent_m: z.number().int().nonnegative(),
  start_distance_km: z.number().nonnegative().nullable(),
  end_distance_km: z.number().nonnegative().nullable(),
});

// Transit day: a technical day driven by an editable timeline; metrics are 0.
export const transitStageSchema = z.object({
  ...stageBase,
  stage_type: z.literal('transit'),
  distance_km: z.literal(0),
  ascent_m: z.literal(0),
  descent_m: z.literal(0),
  start_distance_km: z.null(),
  end_distance_km: z.null(),
  timeline: z.array(milestoneSchema),
  location_lat: z.number().min(-90).max(90).nullable(),
  location_lon: z.number().min(-180).max(180).nullable(),
  location_name: z.string().max(200).nullable(),
});

export const stageSchema = z.discriminatedUnion('stage_type', [
  trekStageSchema,
  transitStageSchema,
]);

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
export type MilestoneInput = z.infer<typeof milestoneSchema>;
export type WaypointInput = z.infer<typeof waypointSchema>;
