/** Skeleton placeholders for the /weather page — three stacked panels.
 *  The default export is the route-level loading UI; the named skeletons back
 *  the lazy Meteogram / RadarMap fallbacks. */

export function MeteogramSkeleton() {
  return (
    <div className="space-y-2 rounded-2xl border bg-card p-3">
      <div className="h-36 animate-pulse rounded-lg bg-muted" />
      <div className="h-24 animate-pulse rounded-lg bg-muted" />
      <div className="h-24 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}

export function RadarSkeleton() {
  return <div className="h-72 w-full animate-pulse rounded-2xl bg-muted" />;
}

export default function Loading() {
  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pt-4">
      <div className="h-8 w-32 animate-pulse rounded-lg bg-muted" />
      <MeteogramSkeleton />
      <RadarSkeleton />
    </div>
  );
}
