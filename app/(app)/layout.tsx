import Link from 'next/link';
import { MapIcon, ListIcon, SettingsIcon } from 'lucide-react';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1 pb-20">{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-lg items-center justify-around px-4 py-2">
          <NavItem href="/" icon={<ListIcon className="h-5 w-5" />} label="Trails" />
          <NavItem href="/settings" icon={<SettingsIcon className="h-5 w-5" />} label="Settings" />
        </div>
      </nav>
    </div>
  );
}

function NavItem({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-w-[56px] flex-col items-center gap-1 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:text-foreground active:scale-95"
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </Link>
  );
}
