'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CloudSunIcon,
  ListIcon,
  SettingsIcon,
  SunriseIcon,
  type LucideIcon,
} from 'lucide-react';

/**
 * Floating "glass" pill tab bar — from design_handoff_waypoint_logo/source/wp-shared.jsx.
 * Icon-only; active tab is an orange lozenge with a soft glow.
 */

type Tab = {
  href: string;
  label: string;
  Icon: LucideIcon;
  /** Returns true when this tab owns the current route. */
  isActive: (path: string) => boolean;
};

const TABS: Tab[] = [
  {
    href: '/',
    label: 'Trasy',
    Icon: ListIcon,
    isActive: (p) => p === '/' || p.startsWith('/trails'),
  },
  {
    href: '/today',
    label: 'Dnes',
    Icon: SunriseIcon,
    isActive: (p) => p.startsWith('/today'),
  },
  {
    href: '/weather',
    label: 'Počasí',
    Icon: CloudSunIcon,
    isActive: (p) => p.startsWith('/weather'),
  },
  {
    href: '/settings',
    label: 'Nastavení',
    Icon: SettingsIcon,
    isActive: (p) => p.startsWith('/settings') || p.startsWith('/account'),
  },
];

export function TabBar() {
  const pathname = usePathname();

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 22px)' }}
    >
      <div
        className="pointer-events-auto flex items-center gap-1 p-1.5"
        style={{
          background: 'rgba(26,30,34,0.82)',
          backdropFilter: 'blur(24px) saturate(170%)',
          WebkitBackdropFilter: 'blur(24px) saturate(170%)',
          borderRadius: 999,
          border: '1px solid rgba(255,255,255,0.14)',
          boxShadow:
            '0 16px 34px -10px rgba(18,22,26,0.55), inset 0 1px 0 rgba(255,255,255,0.12)',
        }}
      >
        {TABS.map(({ href, label, Icon, isActive }) => {
          const on = isActive(pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              title={label}
              aria-current={on ? 'page' : undefined}
              className="flex h-12 w-[54px] items-center justify-center rounded-full transition-colors active:scale-95"
              style={{
                background: on ? 'var(--wp-orange)' : 'transparent',
                color: on ? '#fff' : 'rgba(255,255,255,0.6)',
                boxShadow: on
                  ? '0 2px 10px -4px rgba(243,112,19,0.55)'
                  : 'none',
              }}
            >
              <Icon size={23} strokeWidth={on ? 2.1 : 1.8} />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
