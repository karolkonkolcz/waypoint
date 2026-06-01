-- Per-stage override date. The calendar date of a stage normally derives from
-- the trail's start_date plus the stage's day offset (order_index). This column
-- lets a single day be pinned to an explicit date (rest days, schedule drift)
-- without disturbing its neighbours. NULL = use the derived date.
-- RLS is already user_id-scoped (see 0002_rls.sql), so no new policy is needed.

alter table public.stages
  add column date date;
