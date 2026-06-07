import { OtpLoginForm } from './OtpLoginForm';
import { createClient } from '@/lib/supabase/server';
import { getActiveWelcomePhoto } from '@/lib/welcome/photos';

interface Props {
  searchParams: Promise<{ message?: string; error?: string; next?: string }>;
}

export default async function LoginPage({ searchParams }: Props) {
  const { message, error, next } = await searchParams;
  const supabase = await createClient();
  const photo = await getActiveWelcomePhoto(supabase);

  return (
    <main className="min-h-[100svh] overflow-hidden bg-[#0f1515] text-white">
      <OtpLoginForm
        initialMessage={message ? decodeURIComponent(message) : undefined}
        initialError={error ? decodeURIComponent(error) : undefined}
        next={next ?? '/'}
        photoUrl={photo?.public_url}
      />
    </main>
  );
}
