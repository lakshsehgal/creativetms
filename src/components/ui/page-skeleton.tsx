/**
 * Shown the instant a nav link is clicked, while the server fetches.
 *
 * Without this, clicking a sidebar item leaves the previous screen frozen
 * until the round trip finishes — which reads as the app hanging even when
 * it's only a couple of hundred milliseconds.
 */
export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-4 border-b border-[var(--color-line)] px-5">
        <div className="skeleton h-4 w-28" />
        <div className="ml-auto skeleton h-7 w-24" />
      </div>
      <div className="space-y-2 p-5">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="skeleton h-11" style={{ opacity: 1 - index * 0.1 }} />
        ))}
      </div>
    </div>
  );
}

export function BoardSkeleton() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-4 border-b border-[var(--color-line)] px-5">
        <div className="skeleton h-4 w-16" />
        <div className="ml-auto skeleton h-7 w-64" />
      </div>
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--color-line)] px-5">
        {[52, 40, 40, 44, 44].map((width, index) => (
          <div key={index} className="skeleton h-6" style={{ width: width * 2 }} />
        ))}
      </div>
      <div className="flex gap-3 overflow-hidden px-5 py-4">
        {Array.from({ length: 6 }).map((_, column) => (
          <div key={column} className="w-[286px] shrink-0 space-y-2">
            <div className="skeleton h-7" />
            {Array.from({ length: 3 - (column % 3) }).map((_, card) => (
              <div key={card} className="skeleton h-24" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
