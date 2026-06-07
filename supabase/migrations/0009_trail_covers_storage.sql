-- Public storage bucket for trail cover photos. Path convention:
--   trail-covers/{user_id}/{trail_id}-{timestamp}.{ext}
-- so RLS can scope writes to the owner's folder. Public read (the hero/cards
-- load the public URL); writes restricted to the authenticated owner.

insert into storage.buckets (id, name, public)
values ('trail-covers', 'trail-covers', true)
on conflict (id) do nothing;

drop policy if exists "trail covers: owner insert" on storage.objects;
create policy "trail covers: owner insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'trail-covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "trail covers: owner update" on storage.objects;
create policy "trail covers: owner update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'trail-covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "trail covers: owner delete" on storage.objects;
create policy "trail covers: owner delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'trail-covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
