import { SyncProvider } from '@/components/sync/SyncProvider';
import { TabBar } from '@/components/nav/TabBar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <SyncProvider />
      <main className="flex-1 pb-28">{children}</main>
      <TabBar />
    </div>
  );
}
