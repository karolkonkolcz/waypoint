-- Audit L2: child-table RLS only checked user_id, not that the referenced
-- trail_id belongs to the same user. No data leak (foreign trails are unreadable
-- anyway), but an authenticated user could INSERT/UPDATE a row pointing at
-- someone else's trail_id — an integrity hole. Tighten WITH CHECK to also
-- require the parent trail to be owned by the caller.
--
-- USING stays user_id-only (reads are already owner-scoped). The exists()
-- subquery is itself filtered by trails' own RLS, so a foreign trail_id simply
-- isn't visible and the check fails closed.

create or replace function public._owns_trail(p_trail_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.trails t
    where t.id = p_trail_id and t.user_id = auth.uid()
  );
$$;

revoke execute on function public._owns_trail(uuid) from public, anon;
grant execute on function public._owns_trail(uuid) to authenticated;

-- routes
drop policy if exists "own routes" on public.routes;
create policy "own routes" on public.routes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and public._owns_trail(trail_id));

-- stages
drop policy if exists "own stages" on public.stages;
create policy "own stages" on public.stages
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and public._owns_trail(trail_id));

-- waypoints
drop policy if exists "own waypoints" on public.waypoints;
create policy "own waypoints" on public.waypoints
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and public._owns_trail(trail_id));

-- weather_cache
drop policy if exists "own weather" on public.weather_cache;
create policy "own weather" on public.weather_cache
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and public._owns_trail(trail_id));

-- todos
drop policy if exists "own todos" on public.todos;
create policy "own todos" on public.todos
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and public._owns_trail(trail_id));
