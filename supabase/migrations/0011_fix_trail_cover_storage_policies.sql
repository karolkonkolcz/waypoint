-- Tighten and complete trail cover storage policies.
-- Uploads write to {auth.uid()}/{trail_id}-{timestamp}.{ext}; reads are public
-- because the bucket is public and cover URLs are shown on trail cards.

insert into storage.buckets (id, name, public)
values ('trail-covers', 'trail-covers', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "trail covers: public read" on storage.objects;
create policy "trail covers: public read"
  on storage.objects for select to public
  using (bucket_id = 'trail-covers');

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
  )
  with check (
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
