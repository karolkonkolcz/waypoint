-- todos: lightweight per-day reminders surfaced on the daily dashboard.
-- Offline-first and synced like the other entities (user_id ownership, soft
-- delete, sync timestamps). A todo may be pinned to a specific stage or a
-- calendar date, or just live at the trail level.

create table public.todos (
  id          uuid primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  trail_id    uuid not null references public.trails(id) on delete cascade,
  stage_id    uuid references public.stages(id) on delete cascade,
  date        date,
  text        text not null,
  done        boolean not null default false,
  order_index integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index on public.todos (trail_id);
create index on public.todos (stage_id);

create trigger t_todos before update on public.todos
  for each row execute function public.set_updated_at();

-- Owner-only access, same shape as the other entities (see 0002_rls.sql).
alter table public.todos enable row level security;

create policy "own todos" on public.todos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
