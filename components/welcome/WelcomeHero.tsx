import Link from 'next/link';
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CloudSunIcon,
  ClockIcon,
  DownloadIcon,
  MapIcon,
} from 'lucide-react';
import { WaypointLockup } from '@/components/brand/Waypoint';
import type { WelcomePhoto } from '@/lib/welcome/photos';

const FEATURES = [
  { label: 'Etapy bez připojení', icon: DownloadIcon },
  { label: 'Časová osa ETA', icon: ClockIcon },
  { label: 'Výstrahy počasí', icon: AlertTriangleIcon },
  { label: 'Stažené mapy', icon: CloudSunIcon },
];

export function WelcomeHero({ photo }: { photo: WelcomePhoto | null }) {
  return (
    <main className="relative min-h-[100svh] overflow-hidden bg-[#0f1515] text-white">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_top,#273231_0%,#111717_55%,#080c0c_100%)]"
      />
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo.public_url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          fetchPriority="high"
        />
      )}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(6,10,10,0.62)_0%,rgba(6,10,10,0.26)_34%,rgba(6,10,10,0.78)_68%,rgba(6,10,10,0.96)_100%)]"
      />
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-40 bg-black/30 blur-3xl" />

      <div className="relative mx-auto flex min-h-[100svh] w-full max-w-[430px] flex-col px-6 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(3.5rem+env(safe-area-inset-top))] sm:max-w-[480px]">
        <header className="flex items-center justify-between gap-4">
          <WaypointLockup markSize={42} wordmarkClassName="!text-white" />
          <div className="flex items-center gap-2 text-right text-xs font-semibold uppercase text-white/72">
            <MapIcon className="hidden h-4 w-4 sm:block" />
            {photo?.location_label ?? 'Vysoké Tatry'}
          </div>
        </header>

        <section className="mt-auto space-y-6 pb-1">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase text-[var(--wp-orange)]">
              Průvodce po trase bez připojení
            </p>
            <div className="space-y-4">
              <h1 className="text-4xl font-extrabold leading-tight text-white drop-shadow-sm min-[390px]:text-5xl">
                Vyraz i mimo signál.
              </h1>
              <p className="text-lg font-medium leading-snug text-white/80">
                Plánuj etapy, sleduj ETA, počasí a stažené mapy i tam, kde signál zmizí.
              </p>
            </div>
          </div>

          <ul className="grid grid-cols-2 gap-3" aria-label="Hlavní funkce Waypointu">
            {FEATURES.map(({ label, icon: Icon }) => (
              <li key={label}>
                <span className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/18 bg-white/14 px-3 text-sm font-semibold text-white shadow-sm backdrop-blur-md">
                  <Icon className="h-5 w-5 shrink-0" />
                  <span>{label}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="space-y-5 pt-2">
            <Link
              href="/login?next=/onboarding"
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[var(--wp-orange)] px-5 text-center text-base font-semibold text-white shadow-[0_18px_40px_rgba(243,112,19,0.35)] transition hover:bg-[var(--wp-orange-700)] active:scale-[0.99]"
            >
              Vytvořit účet zdarma
              <ArrowRightIcon className="h-5 w-5" />
            </Link>
            <p className="text-center text-sm font-semibold text-white/70">
              Už máš účet?{' '}
              <Link href="/login" className="text-white underline decoration-2 underline-offset-4">
                Přihlásit se
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
