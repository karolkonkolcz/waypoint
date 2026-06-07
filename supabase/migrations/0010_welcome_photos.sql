-- Admin-managed welcome screen photos.
-- Public visitors can read active photo metadata; only admins can upload/manage
-- the backing Supabase Storage objects and metadata rows.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.welcome_photos (
  id uuid primary key,
  storage_path text not null unique,
  public_url text not null,
  alt_text text not null,
  location_label text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger t_welcome_photos
  before update on public.welcome_photos
  for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$$;

alter table public.admin_users enable row level security;
alter table public.welcome_photos enable row level security;

drop policy if exists "admins read admin users" on public.admin_users;
create policy "admins read admin users" on public.admin_users
  for select to authenticated
  using (public.is_admin());

drop policy if exists "public read active welcome photos" on public.welcome_photos;
create policy "public read active welcome photos" on public.welcome_photos
  for select to anon, authenticated
  using (is_active = true and deleted_at is null);

drop policy if exists "admins read welcome photos" on public.welcome_photos;
create policy "admins read welcome photos" on public.welcome_photos
  for select to authenticated
  using (public.is_admin());

drop policy if exists "admins insert welcome photos" on public.welcome_photos;
create policy "admins insert welcome photos" on public.welcome_photos
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "admins update welcome photos" on public.welcome_photos;
create policy "admins update welcome photos" on public.welcome_photos
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins delete welcome photos" on public.welcome_photos;
create policy "admins delete welcome photos" on public.welcome_photos
  for delete to authenticated
  using (public.is_admin());

insert into storage.buckets (id, name, public)
values ('welcome-photos', 'welcome-photos', true)
on conflict (id) do nothing;

drop policy if exists "welcome photos: admin insert" on storage.objects;
create policy "welcome photos: admin insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'welcome-photos'
    and public.is_admin()
  );

drop policy if exists "welcome photos: admin update" on storage.objects;
create policy "welcome photos: admin update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'welcome-photos'
    and public.is_admin()
  )
  with check (
    bucket_id = 'welcome-photos'
    and public.is_admin()
  );

drop policy if exists "welcome photos: admin delete" on storage.objects;
create policy "welcome photos: admin delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'welcome-photos'
    and public.is_admin()
  );
