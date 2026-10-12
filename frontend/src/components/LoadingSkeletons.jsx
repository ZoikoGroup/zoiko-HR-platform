// Loading placeholders in the app's slate palette: they show the shape of what is coming, so the page does not jump
// when the data arrives. They are for a FIRST load only; when cached data is on screen and a refresh runs behind it,
// use <RefreshBar /> instead (a thin strip, no blocking spinner).

const bar = "rounded bg-slate-100 dark:bg-slate-700/60";

export function SkeletonLine({ className = "h-3 w-full" }) {
  return <div className={`${bar} ${className}`} />;
}

/** Placeholder rows for a table or list. */
export function TableSkeleton({ rows = 6, label = "Loading" }) {
  return (
    <div role="status" aria-label={label} aria-busy="true" className="divide-y divide-slate-100 dark:divide-slate-700/60 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-6 py-4">
          <div className={`h-9 w-9 shrink-0 rounded-xl ${bar}`} />
          <div className="flex-1 space-y-2">
            <SkeletonLine className="h-3 w-2/5" />
            <SkeletonLine className="h-2.5 w-3/5" />
          </div>
          <SkeletonLine className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Placeholder for a row of summary cards. */
export function CardGridSkeleton({ cards = 4, label = "Loading" }) {
  return (
    <div role="status" aria-label={label} aria-busy="true" className="grid gap-4 grid-cols-2 lg:grid-cols-4 animate-pulse">
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-3">
          <SkeletonLine className="h-3 w-1/3" />
          <SkeletonLine className="h-7 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/** Placeholder for a detail page: a header block and a couple of panels. */
export function DetailSkeleton({ label = "Loading" }) {
  return (
    <div role="status" aria-label={label} aria-busy="true" className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <SkeletonLine className="h-7 w-64" />
        <SkeletonLine className="h-3 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-3">
            <SkeletonLine className="h-4 w-1/2" />
            <SkeletonLine className="h-3 w-full" />
            <SkeletonLine className="h-3 w-4/5" />
            <SkeletonLine className="h-3 w-3/5" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A thin strip along the top of a block while cached data is being refreshed behind it. */
export function RefreshBar({ active }) {
  if (!active) return null;
  return (
    <div role="status" aria-label="Refreshing" className="relative h-0.5 w-full overflow-hidden bg-transparent">
      <div className="absolute inset-y-0 left-0 w-1/3 animate-pulse rounded bg-[#3B82F6]/70" />
    </div>
  );
}
