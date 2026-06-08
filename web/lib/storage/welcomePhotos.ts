import { uuidv7 } from 'uuidv7';
import { createClient } from '@/lib/supabase/client';

export const WELCOME_PHOTOS_BUCKET = 'welcome-photos';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_DIM = 2200;
const WEBP_QUALITY = 0.84;

interface Encoded {
  blob: Blob;
  ext: string;
  type: string;
}

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
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return fallback;

    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY),
    );
    if (!blob || blob.type !== 'image/webp') return fallback;

    return { blob, ext: 'webp', type: 'image/webp' };
  } catch {
    return fallback;
  }
}

export async function uploadWelcomePhoto(file: File): Promise<{
  publicUrl: string;
  storagePath: string;
}> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Vyber prosím soubor obrázku.');
  }
  if (file.size > MAX_BYTES) {
    throw new Error('Obrázek je příliš velký (max. 10 MB).');
  }

  const { blob, ext, type } = await toWebp(file);
  const supabase = createClient();
  const storagePath = `welcome/${uuidv7()}.${ext}`;

  const { error } = await supabase.storage.from(WELCOME_PHOTOS_BUCKET).upload(storagePath, blob, {
    cacheControl: '31536000',
    contentType: type,
    upsert: false,
  });
  if (error) throw error;

  return {
    publicUrl: supabase.storage.from(WELCOME_PHOTOS_BUCKET).getPublicUrl(storagePath).data.publicUrl,
    storagePath,
  };
}

export async function removeWelcomePhoto(storagePath: string): Promise<void> {
  const { error } = await createClient()
    .storage
    .from(WELCOME_PHOTOS_BUCKET)
    .remove([storagePath]);
  if (error) throw error;
}
