create extension if not exists pgcrypto;

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- profiles (mirrors auth.users)
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  display_name text,
  units        text not null default 'metric' check (units in ('metric', 'imperial')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- trails (= a user's hike plan)
create table public.trails (
  id               uuid primary key,
  user_id          uuid not null references auth.users(id) on delete cascade,
  name             text not null,
  description      text,
  start_date       date,
  default_pace_kmh numeric(4, 2) not null default 4.0,
  preferences      jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

-- routes (geometry)
create table public.routes (
  id                uuid primary key,
  trail_id          uuid not null references public.trails(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  geojson           jsonb not null,
  total_distance_km numeric(8, 2) not null,
  total_ascent_m    integer not null,
  total_descent_m   integer not null,
  elevation_profile jsonb not null default '[]'::jsonb,
  source            text not null default 'gpx' check (source in ('gpx', 'manual')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

-- stages
create table public.stages (
  id                uuid primary key,
  trail_id          uuid not null references public.trails(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  title             text not null,
  order_index       integer not null,
  distance_km       numeric(6, 2) not null,
  ascent_m          integer not null default 0,
  descent_m         integer not null default 0,
  start_distance_km numeric(8, 2),
  end_distance_km   numeric(8, 2),
  difficulty_score  smallint check (difficulty_score between 0 and 100),
  difficulty_class  text check (difficulty_class in ('easy', 'moderate', 'hard', 'extreme')),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

-- waypoints
create table public.waypoints (
  id                      uuid primary key,
  trail_id                uuid not null references public.trails(id) on delete cascade,
  user_id                 uuid not null references auth.users(id) on delete cascade,
  name                    text not null,
  type                    text not null check (type in ('water', 'camp', 'shelter', 'resupply', 'town', 'peak', 'other')),
  latitude                double precision not null,
  longitude               double precision not null,
  elevation_m             integer,
  distance_along_route_km numeric(8, 2),
  description             text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  deleted_at              timestamptz
);

-- weather_cache (per stage + sample point)
create table public.weather_cache (
  id            uuid primary key,
  trail_id      uuid not null references public.trails(id) on delete cascade,
  stage_id      uuid references public.stages(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  latitude      double precision not null,
  longitude     double precision not null,
  forecast_json jsonb not null,
  valid_from    timestamptz,
  valid_to      timestamptz,
  fetched_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

-- indexes
create index on public.trails        (user_id, updated_at);
create index on public.routes        (trail_id);
create index on public.stages        (trail_id, order_index);
create index on public.waypoints     (trail_id, type);
create index on public.weather_cache (stage_id, fetched_at);

-- updated_at triggers
create trigger t_profiles      before update on public.profiles      for each row execute function public.set_updated_at();
create trigger t_trails        before update on public.trails        for each row execute function public.set_updated_at();
create trigger t_routes        before update on public.routes        for each row execute function public.set_updated_at();
create trigger t_stages        before update on public.stages        for each row execute function public.set_updated_at();
create trigger t_waypoints     before update on public.waypoints     for each row execute function public.set_updated_at();
create trigger t_weather_cache before update on public.weather_cache for each row execute function public.set_updated_at();
