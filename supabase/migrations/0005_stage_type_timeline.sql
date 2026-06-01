-- Two kinds of stage: 'trek' (a hiking day — distance/ascent/route/weather)
-- and 'transit' (a technical day — arrival/departure, focus on a day timeline).
-- A transit day carries an editable list of milestones (timeline) and an
-- optional location anchor used to sample weather (it has no route midpoint).
-- RLS is already user_id-scoped (see 0002_rls.sql), so no new policy is needed.

alter table public.stages
  add column stage_type    text not null default 'trek'
    check (stage_type in ('trek', 'transit')),
  add column timeline      jsonb not null default '[]'::jsonb,
  add column location_lat  numeric(9, 6),
  add column location_lon  numeric(9, 6),
  add column location_name text;

create index on public.stages (trail_id, stage_type);
