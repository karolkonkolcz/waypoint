-- Trail cover image for the Home active-trek hero + trail cards.
-- Nullable URL (Supabase Storage public URL or any image URL); existing rows NULL.
alter table trails add column cover_image_url text;
