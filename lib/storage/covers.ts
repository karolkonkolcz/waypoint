import { createClient } from '@/lib/supabase/client';

const BUCKET = 'trail-covers';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB accepted in (resized + WebP'd down after)
const MAX_DIM = 1600; // longest side after resize — plenty for a cover
const WEBP_QUALITY = 0.82;

interface Encoded {
  blob: Blob;
  ext: string;
  type: string;
}

/**
 * Client-side: decode the image, cap its longest side to MAX_DIM, and re-encode
 * as WebP. Returns the original file unchanged if the browser can't produce
 * WebP (older engines) or anything goes wrong — upload still succeeds, just
 * without the size win.
 */
async function toWebp(file: File): Promise<Encoded> {
  const fallback: Encoded = {
    blob: file,
    ext: file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg',
    type: file.type || 'application/octet-stream',
  };

  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
    return fallback;
  }

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return fallback;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY),
    );
    // Some engines ignore the type and hand back PNG — only accept real WebP.
    if (!blob || blob.type !== 'image/webp') return fallback;

    return { blob, ext: 'webp', type: 'image/webp' };
  } catch {
    return fallback;
  }
}

/**
 * Upload a trail cover photo to Supabase Storage and return its public URL.
 * The image is resized + converted to WebP in the browser first. Path:
 * {userId}/{trailId}-{timestamp}.{ext} — the leading folder is the owner so
 * storage RLS can scope writes. The timestamp makes each
 * upload a fresh URL, sidestepping CDN caching of a replaced image.
 */
export async function uploadTrailCover(
  file: File,
  trailId: string,
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file.');
  }
  if (file.size > MAX_BYTES) {
    throw new Error('Image is too large (max 10 MB).');
  }

  const { blob, ext, type } = await toWebp(file);

  const supabase = createClient();
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError || !data.user) {
    throw new Error('Sign in before uploading a cover photo.');
  }

  const path = `${data.user.id}/${trailId}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    cacheControl: '3600',
    contentType: type,
    upsert: false,
  });
  if (error) throw error;

  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
