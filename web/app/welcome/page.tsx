import { redirect } from 'next/navigation';
import { WelcomeHero } from '@/components/welcome/WelcomeHero';
import { createClient } from '@/lib/supabase/server';
import { getActiveWelcomePhoto } from '@/lib/welcome/photos';

export default async function WelcomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect('/');

  const photo = await getActiveWelcomePhoto(supabase);

  return <WelcomeHero photo={photo} />;
}
