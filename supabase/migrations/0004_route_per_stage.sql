-- Route per stage: each hiking day owns its own geometry.
-- Adds routes.stage_id (nullable — null = legacy trail-level route).
-- RLS is already user_id-scoped (see 0002_rls.sql), so no new policy is needed.

alter table public.routes
  add column stage_id uuid references public.stages(id) on delete cascade;

create index on public.routes (stage_id);
