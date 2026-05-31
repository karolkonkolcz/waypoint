alter table public.profiles      enable row level security;
alter table public.trails        enable row level security;
alter table public.routes        enable row level security;
alter table public.stages        enable row level security;
alter table public.waypoints     enable row level security;
alter table public.weather_cache enable row level security;

create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own trails" on public.trails
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own routes" on public.routes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own stages" on public.stages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own waypoints" on public.waypoints
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own weather" on public.weather_cache
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
