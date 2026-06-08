import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeftIcon } from 'lucide-react';
import { WelcomePhotoManager } from '@/components/admin/WelcomePhotoManager';
import { createClient } from '@/lib/supabase/server';

export default async function WelcomePhotosAdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login?next=/admin/welcome-photos');

  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (!isAdmin) redirect('/settings');

  return (
    <div className="mx-auto max-w-lg px-4 pt-6">
      <div className="mb-6 flex items-center gap-2">
        <Link
          href="/settings"
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Fotky uvítací obrazovky</h1>
          <p className="text-sm text-muted-foreground">Správa veřejného úvodního obrázku na /welcome.</p>
        </div>
      </div>

      <WelcomePhotoManager />
    </div>
  );
}
