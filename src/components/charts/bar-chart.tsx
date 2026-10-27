"use client";

/**
 * Horizontal bars for magnitude comparison across a handful of categories.
 *
 * Every bar is directly labelled with its name and value, which is also what
 * satisfies the relief rule: two of the light-mode format hues sit under 3:1
 * against a white surface, so identity never rests on colour alone here.
 */

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  color: string;
  /** Optional target line drawn across the track. */
  /** Right-hand caption, e.g. "12 units". */
  note?: string;
}

export function BarChart({
  data,
  formatValue,
  emptyLabel = "No data yet",
  barHeight = 10,
}: {
  data: BarDatum[];
  formatValue: (value: number) => string;
  emptyLabel?: string;
  barHeight?: number;
}) {
  const rows = data.filter((row) => Number.isFinite(row.value));
  if (rows.length === 0 || rows.every((row) => row.value === 0)) {
    return <p className="py-6 text-center text-[12px] text-[var(--color-ink-3)]">{emptyLabel}</p>;
  }

  const ceiling = Math.max(...rows.map((row) => row.value));

  return (
    <ul className="space-y-3">
      {rows.map((row) => {
        const width = ceiling > 0 ? (row.value / ceiling) * 100 : 0;

        return (
          <li key={row.key}>
            <div className="mb-1.5 flex items-baseline gap-2">
              <span className="flex items-center gap-1.5 text-[12px]">
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-[2px]"
                  style={{ background: row.color }}
                />
                {row.label}
              </span>
              <span className="tabular ml-auto text-[12.5px] font-medium">
                {formatValue(row.value)}
              </span>
              {row.note && (
                <span className="tabular w-16 shrink-0 text-right text-[11px] text-[var(--color-ink-3)]">
                  {row.note}
                </span>
              )}
            </div>

            <div
              className="relative w-full overflow-hidden rounded-full"
              style={{ height: barHeight, background: "var(--color-surface-3)" }}
              role="img"
              aria-label={`${row.label}: ${formatValue(row.value)}`}
            >
              <div
                className="h-full rounded-full transition-[width] duration-500 ease-[var(--ease-out-quick)]"
                style={{ width: `${width}%`, background: row.color }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
