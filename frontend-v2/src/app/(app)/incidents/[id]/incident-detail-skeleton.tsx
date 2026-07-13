export function IncidentDetailSkeleton() {
  return (
    <div
      data-testid="incident-skeleton"
      className="flex flex-col overflow-hidden animate-pulse"
      style={{ height: "calc(100vh - 80px)", margin: "-24px", width: "calc(100% + 48px)" }}
    >
      {/* Header skeleton */}
      <div className="px-4 py-3 border-b border-surface-border bg-surface-primary shrink-0 space-y-2">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 bg-muted rounded" />
          <div className="h-5 bg-muted rounded w-1/3" />
          <div className="ml-auto flex gap-2">
            <div className="h-7 w-20 bg-muted rounded" />
            <div className="h-7 w-24 bg-muted rounded" />
            <div className="h-7 w-24 bg-muted rounded" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-4 w-16 bg-muted rounded" />
          <div className="h-4 w-16 bg-muted rounded" />
          <div className="h-4 w-24 bg-muted rounded" />
          <div className="h-4 w-20 bg-muted rounded" />
        </div>
      </div>
      {/* Tab bar skeleton */}
      <div className="flex items-center gap-0 px-4 bg-surface-primary border-b border-surface-border shrink-0">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 w-32 bg-muted/30 rounded mx-1 my-1" />
        ))}
      </div>
      {/* Content skeleton */}
      <div className="flex-1 p-4 grid grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-32 bg-muted rounded" />
        ))}
      </div>
    </div>
  );
}
