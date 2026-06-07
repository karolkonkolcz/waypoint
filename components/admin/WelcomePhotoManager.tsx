'use client';

import { useEffect, useRef, useState } from 'react';
import { ImagePlusIcon, Loader2Icon, Trash2Icon } from 'lucide-react';
import { uuidv7 } from 'uuidv7';
import { createClient } from '@/lib/supabase/client';
import type { Tables } from '@/lib/supabase/types';
import { removeWelcomePhoto, uploadWelcomePhoto } from '@/lib/storage/welcomePhotos';

type WelcomePhotoRow = Tables<'welcome_photos'>;

export function WelcomePhotoManager() {
  const [photos, setPhotos] = useState<WelcomePhotoRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [altText, setAltText] = useState('Hiker on a mountain trail');
  const [locationLabel, setLocationLabel] = useState('High Tatras');
  const [sortOrder, setSortOrder] = useState('0');
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadPhotos() {
    setLoaded(false);
    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from('welcome_photos')
      .select('*')
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (loadError) {
      setError(loadError.message);
    } else {
      setPhotos(data ?? []);
    }
    setLoaded(true);
  }

  useEffect(() => {
    void loadPhotos();
  }, []);

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus(null);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError('Choose a photo first.');
      return;
    }

    const trimmedAlt = altText.trim();
    if (!trimmedAlt) {
      setError('Alt text is required.');
      return;
    }

    setPending(true);
    let uploadedPath: string | null = null;
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in.');

      const upload = await uploadWelcomePhoto(file);
      uploadedPath = upload.storagePath;

      const { error: insertError } = await supabase.from('welcome_photos').insert({
        id: uuidv7(),
        storage_path: upload.storagePath,
        public_url: upload.publicUrl,
        alt_text: trimmedAlt,
        location_label: locationLabel.trim() || null,
        sort_order: Number.parseInt(sortOrder, 10) || 0,
        is_active: true,
        created_by: user.id,
      });
      if (insertError) throw insertError;

      if (fileRef.current) fileRef.current.value = '';
      setStatus('Photo uploaded.');
      await loadPhotos();
    } catch (err) {
      if (uploadedPath) {
        await removeWelcomePhoto(uploadedPath).catch(() => undefined);
      }
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setPending(false);
    }
  }

  async function updatePhoto(id: string, patch: Pick<WelcomePhotoRow, 'is_active'> | Pick<WelcomePhotoRow, 'sort_order'>) {
    setError(null);
    setStatus(null);
    const { error: updateError } = await createClient()
      .from('welcome_photos')
      .update(patch)
      .eq('id', id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setPhotos((current) =>
      current.map((photo) => (photo.id === id ? { ...photo, ...patch } : photo)),
    );
    setStatus('Saved.');
  }

  async function deletePhoto(photo: WelcomePhotoRow) {
    setError(null);
    setStatus(null);
    const confirmed = window.confirm('Remove this welcome photo?');
    if (!confirmed) return;

    const { error: updateError } = await createClient()
      .from('welcome_photos')
      .update({ is_active: false, deleted_at: new Date().toISOString() })
      .eq('id', photo.id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await removeWelcomePhoto(photo.storage_path).catch(() => undefined);
    setPhotos((current) => current.filter((item) => item.id !== photo.id));
    setStatus('Photo removed.');
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleUpload} className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm">
        <div>
          <h2 className="text-lg font-bold">Upload hero photo</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Photos are resized in the browser and stored in the Supabase welcome-photos bucket.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="welcome-photo" className="text-xs font-medium text-muted-foreground">
            Photo
          </label>
          <input
            ref={fileRef}
            id="welcome-photo"
            type="file"
            accept="image/*"
            className="input"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="alt_text" className="text-xs font-medium text-muted-foreground">
              Alt text
            </label>
            <input
              id="alt_text"
              value={altText}
              onChange={(event) => setAltText(event.target.value)}
              className="input"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="location_label" className="text-xs font-medium text-muted-foreground">
              Location label
            </label>
            <input
              id="location_label"
              value={locationLabel}
              onChange={(event) => setLocationLabel(event.target.value)}
              className="input"
              placeholder="High Tatras"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="sort_order" className="text-xs font-medium text-muted-foreground">
              Sort order
            </label>
            <input
              id="sort_order"
              type="number"
              inputMode="numeric"
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
              className="input"
            />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {status && <p className="text-sm text-green-600 dark:text-green-400">{status}</p>}

        <button
          type="submit"
          disabled={pending}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {pending ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <ImagePlusIcon className="h-4 w-4" />}
          {pending ? 'Uploading…' : 'Upload photo'}
        </button>
      </form>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold">Current photos</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The public welcome screen uses the first active photo by sort order.
          </p>
        </div>

        {!loaded ? (
          <div className="space-y-3">
            <div className="h-40 animate-pulse rounded-2xl bg-muted" />
            <div className="h-40 animate-pulse rounded-2xl bg-muted" />
          </div>
        ) : photos.length === 0 ? (
          <p className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            No welcome photos yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {photos.map((photo) => (
              <li key={photo.id} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.public_url} alt={photo.alt_text} className="h-44 w-full object-cover" />
                <div className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{photo.location_label ?? 'No location label'}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{photo.alt_text}</p>
                    </div>
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">
                      {photo.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={photo.is_active}
                        onChange={(event) => updatePhoto(photo.id, { is_active: event.target.checked })}
                      />
                      Show on welcome
                    </label>
                    <input
                      type="number"
                      aria-label="Sort order"
                      defaultValue={photo.sort_order}
                      onBlur={(event) =>
                        updatePhoto(photo.id, {
                          sort_order: Number.parseInt(event.target.value, 10) || 0,
                        })
                      }
                      className="input w-24"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => deletePhoto(photo)}
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-destructive/30 px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive/5"
                  >
                    <Trash2Icon className="h-4 w-4" />
                    Remove photo
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
