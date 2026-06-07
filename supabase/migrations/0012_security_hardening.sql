-- Security hardening (audit 2026-06-07). Three medium-severity findings:
--
-- M1  Public storage buckets accepted ANY file type — an authenticated user
--     could upload an SVG/HTML payload and get a public URL on our domain
--     (stored XSS / phishing hosting). The client-side MIME check is bypassable.
--     Fix: enforce an image allow-list + size cap at the bucket level, which the
--     Storage API applies on every upload regardless of the client.
--
-- M2  SECURITY DEFINER functions (handle_new_user, is_admin, set_updated_at)
--     were executable by anon/authenticated via /rest/v1/rpc/* and one had a
--     mutable search_path. Lock down EXECUTE and pin search_path.
--
-- This migration also codifies handle_new_user, which lived only on the remote
-- (from a dropped 0003) and was never on disk — closing a schema drift so the
-- auth-signup trigger is now version-controlled.

-- ── M1: restrict public buckets to images + 10 MB ──────────────────────────
update storage.buckets
set allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png'],
    file_size_limit = 10 * 1024 * 1024
where id in ('trail-covers', 'welcome-photos');

-- ── M2: codify the auth-signup trigger function (drift from dropped 0003) ───
-- Auto-creates the profiles row on signup; postAuthPath() also upserts it, so
-- the app works with or without this trigger. search_path already pinned.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ── M2: pin search_path on the updated_at trigger function ──────────────────
alter function public.set_updated_at() set search_path = public, pg_temp;

-- ── M2: revoke direct RPC EXECUTE on SECURITY DEFINER / trigger functions ───
-- Trigger functions (handle_new_user, set_updated_at) still fire on their
-- triggers — Postgres does not check EXECUTE privilege for trigger invocation —
-- so a full lockdown is safe and removes the /rest/v1/rpc/* attack surface.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- is_admin() is evaluated inside RLS policies (welcome_photos, storage.objects)
-- by the authenticated role, so authenticated MUST keep EXECUTE — only anon is
-- revoked (anon never hits a policy that calls it, and it must not be callable
-- via /rest/v1/rpc/is_admin while signed out).
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
