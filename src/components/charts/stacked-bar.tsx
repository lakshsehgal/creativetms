"use client";

/**
 * Part-to-whole in one thin bar.
 *
 * Used for "where did this designer's week go" — three kinds of work against
 * one total. Segments are separated by a 2px gap of the surface colour rather
 * than by a border, so nothing gains a rim that reads as a fourth colour, and
 * only the outer ends are rounded so the bar still reads as one quantity.
 *
 * A value is drawn inside a segment only when it fits with padding. Anything
 * narrower falls back to the legend and the table beside it, which is where
 * every number lives anyway — nothing here is reachable only by hovering.
 */

export interface Segment {
  key: string;
  label: string;
  value: number;
  color: string;
}

export function StackedBar({
  segments,
  format,
  height = 10,
  showLabels = false,
  emptyLabel = "Nothing tracked",
  scale = 1,
}: {
  segments: Segment[];
  format: (value: number) => string;
  height?: number;
  /** Draw the value inside segments wide enough to hold it. */
  showLabels?: boolean;
  emptyLabel?: string;
  /**
   * How much of the track this bar's total is entitled to, 0..1.
   *
   * Without it every row fills the full width and a format that cost eight
   * hours looks identical to one that cost forty — the split is right and the
   * magnitude is a lie. Pass total / largest total when the rows are meant to
   * be compared with each other.
   */
  scale?: number;
}) {
  const rows = segments.filter((segment) => segment.value > 0);
  const total = rows.reduce((sum, segment) => sum + segment.value, 0);

  if (total <= 0) {
    return (
      <div
        className="w-full rounded-full bg-[var(--color-surface-3)]"
        style={{ height }}
        role="img"
        aria-label={emptyLabel}
      />
    );
  }

  const description = rows
    .map((segment) => `${segment.label} ${format(segment.value)}`)
    .join(", ");

  const clamped = Math.max(0, Math.min(1, scale));

  return (
    <div
      className="flex items-stretch overflow-hidden"
      style={{ height, gap: 2, width: `${clamped * 100}%` }}
      role="img"
      aria-label={description}
    >
      {rows.map((segment, index) => {
        const share = (segment.value / total) * 100;
        const first = index === 0;
        const last = index === rows.length - 1;
        // ~46px is where a duration like "1h 42m" stops fitting.
        const roomy = showLabels && share > 14;

        return (
          <div
            key={segment.key}
            title={`${segment.label} — ${format(segment.value)} (${Math.round(share)}%)`}
            className="flex min-w-0 items-center justify-center"
            style={{
              width: `${share}%`,
              background: segment.color,
              borderTopLeftRadius: first ? 999 : 0,
              borderBottomLeftRadius: first ? 999 : 0,
              borderTopRightRadius: last ? 999 : 0,
              borderBottomRightRadius: last ? 999 : 0,
            }}
          >
            {roomy && (
              <span className="tabular truncate px-1 text-[9.5px] font-semibold text-white">
                {Math.round(share)}%
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The same encoding over time: one column per day.
 *
 * Days with nothing tracked keep their slot rather than being dropped, so a
 * quiet Sunday reads as a gap in the week instead of silently closing it up.
 */
export function StackedColumns({
  days,
  keys,
  format,
  height = 120,
}: {
  days: { day: string; label: string; values: Record<string, number> }[];
  keys: { key: string; label: string; color: string }[];
  format: (value: number) => string;
  height?: number;
}) {
  const totals = days.map((day) =>
    keys.reduce((sum, series) => sum + (day.values[series.key] ?? 0), 0),
  );
  const ceiling = Math.max(...totals, 1);

  if (totals.every((total) => total === 0)) {
    return (
      <p className="py-8 text-center text-[12px] text-[var(--color-ink-3)]">
        Nothing tracked in this window.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-end gap-[3px]" style={{ height }}>
        {days.map((day, index) => {
          const total = totals[index];
          const columnHeight = (total / ceiling) * 100;

          return (
            <div
              key={day.day}
              className="flex min-w-0 flex-1 flex-col justify-end"
              style={{ height: "100%" }}
              title={`${day.label} — ${format(total)}`}
            >
              <div
                className="flex w-full flex-col-reverse overflow-hidden rounded-[3px]"
                style={{ height: `${columnHeight}%`, gap: 2 }}
              >
                {keys.map((series) => {
                  const value = day.values[series.key] ?? 0;
                  if (value <= 0) return null;
                  return (
                    <div
                      key={series.key}
                      style={{
                        height: `${(value / total) * 100}%`,
                        background: series.color,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* The axis band lives inside the same box as the plot, so the card
          never grows a nested scrollbar to reach its own labels. */}
      <div className="mt-1.5 flex gap-[3px]">
        {days.map((day, index) => (
          <span
            key={day.day}
            className="min-w-0 flex-1 truncate text-center text-[9px] text-[var(--color-ink-3)]"
          >
            {/* Only label where there's room; the tooltip carries the rest. */}
            {days.length <= 14 || index % 7 === 0 ? day.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

export function PhaseLegend({
  keys,
}: {
  keys: { key: string; label: string; color: string }[];
}) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] text-[var(--color-ink-2)]">
      {keys.map((series) => (
        <li key={series.key} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-[8px] w-[14px] rounded-full"
            style={{ background: series.color }}
          />
          {series.label}
        </li>
      ))}
    </ul>
  );
}
