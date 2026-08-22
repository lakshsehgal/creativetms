"use client";

import { useMemo, useState } from "react";
import type { CreativeFormat, DailyScorecard, FormatBenchmark, Profile } from "@/lib/types";
import { FORMAT_ORDER, FORMATS } from "@/lib/types";
import { humanDuration, pct } from "@/lib/format";
import { Avatar, Card } from "@/components/ui/primitives";

type SortKey = "name" | "units" | "time" | "pace" | "firstPass";

interface Row {
  designer: Profile;
  activeSeconds: number;
  units: number;
  tickets: number;
  firstPass: number;
  onTime: number;
  late: number;
  revisions: number;
  perFormat: Partial<Record<CreativeFormat, { units: number; seconds: number }>>;
  paceIndex: number | null;
}

/**
 * Per-designer rollup for the admin.
 *
 * Sorted by output rather than by a score, and every timing cell carries the
 * benchmark next to it — the comparison that matters is against the bar for
 * the format, not against whoever happens to sit at the top of the list.
 */
export function DesignerTable({
  designers,
  scorecards,
  benchmarks,
  loading,
}: {
  designers: Profile[];
  scorecards: DailyScorecard[];
  benchmarks: FormatBenchmark[];
  loading: boolean;
}) {
  const [sort, setSort] = useState<SortKey>("units");

  const rows = useMemo<Row[]>(() => {
    const benchmarkFor = new Map(
      benchmarks.map((item) => [item.format, item.target_minutes_per_unit]),
    );

    const built = designers.map((designer) => {
      const cards = scorecards.filter((card) => card.designer_id === designer.id);

      const perFormat: Row["perFormat"] = {};
      cards.forEach((card) => {
        FORMAT_ORDER.forEach((format) => {
          const units = card.units_by_format?.[format] ?? 0;
          const seconds = card.seconds_by_format?.[format] ?? 0;
          if (!units && !seconds) return;
          const bucket = (perFormat[format] ??= { units: 0, seconds: 0 });
          bucket.units += units;
          bucket.seconds += seconds;
        });
      });

      const totals = cards.reduce(
        (acc, card) => ({
          activeSeconds: acc.activeSeconds + card.active_seconds,
          units: acc.units + card.units_completed,
          tickets: acc.tickets + card.tickets_completed,
          firstPass: acc.firstPass + card.first_pass_count,
          onTime: acc.onTime + card.on_time_count,
          late: acc.late + card.late_count,
          revisions: acc.revisions + card.revision_rounds,
        }),
        { activeSeconds: 0, units: 0, tickets: 0, firstPass: 0, onTime: 0, late: 0, revisions: 0 },
      );

      // Benchmark minutes earned vs minutes spent. Above 100 = ahead of the bar.
      const earnedMinutes = FORMAT_ORDER.reduce((sum, format) => {
        const units = perFormat[format]?.units ?? 0;
        return sum + units * (benchmarkFor.get(format) ?? 0);
      }, 0);

      const paceIndex =
        totals.activeSeconds > 0 && earnedMinutes > 0
          ? Math.round((earnedMinutes * 60 * 100) / totals.activeSeconds)
          : null;

      return { designer, ...totals, perFormat, paceIndex };
    });

    return built.sort((a, b) => {
      if (sort === "name") {
        return (a.designer.full_name || a.designer.email).localeCompare(
          b.designer.full_name || b.designer.email,
        );
      }
      if (sort === "time") return b.activeSeconds - a.activeSeconds;
      if (sort === "pace") return (b.paceIndex ?? -1) - (a.paceIndex ?? -1);
      if (sort === "firstPass") return pct(b.firstPass, b.tickets) - pct(a.firstPass, a.tickets);
      return b.units - a.units;
    });
  }, [designers, scorecards, benchmarks, sort]);

  const active = rows.filter((row) => row.units > 0 || row.activeSeconds > 0);

  return (
    <Card padded={false}>
      <div className="flex items-center gap-3 border-b border-[var(--color-line)] px-4 py-3">
        <div>
          <h2 className="text-[13px] font-semibold tracking-tight">Designers</h2>
          <p className="mt-0.5 text-[11.5px] text-[var(--color-ink-3)]">
            Built from the nightly scorecards. Pace compares each person against
            the format benchmark, not against each other.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2 p-4">
          {[0, 1, 2].map((n) => (
            <div key={n} className="skeleton h-9" />
          ))}
        </div>
      ) : active.length === 0 ? (
        <p className="px-4 py-8 text-center text-[12.5px] text-[var(--color-ink-3)]">
          No scorecards in this window yet. They&apos;re written once a day, so a
          brand-new instance stays empty until the first nightly run.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-[var(--color-line)] text-[11px] uppercase tracking-[0.06em] text-[var(--color-ink-3)]">
                <Th onClick={() => setSort("name")} active={sort === "name"} align="left">
                  Designer
                </Th>
                <Th onClick={() => setSort("units")} active={sort === "units"}>
                  Units
                </Th>
                <Th onClick={() => setSort("time")} active={sort === "time"}>
                  Tracked
                </Th>
                {FORMAT_ORDER.map((format) => (
                  <Th key={format}>{FORMATS[format].short}/unit</Th>
                ))}
                <Th onClick={() => setSort("firstPass")} active={sort === "firstPass"}>
                  1st pass
                </Th>
                <Th onClick={() => setSort("pace")} active={sort === "pace"}>
                  Pace
                </Th>
              </tr>
            </thead>
            <tbody>
              {active.map((row) => (
                <tr
                  key={row.designer.id}
                  className="border-b border-[var(--color-line)] transition-colors last:border-0 hover:bg-[var(--color-surface-2)]"
                >
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      <Avatar
                        id={row.designer.id}
                        name={row.designer.full_name}
                        email={row.designer.email}
                        size={22}
                      />
                      <span className="truncate">
                        {row.designer.full_name || row.designer.email}
                      </span>
                    </span>
                  </td>
                  <td className="tabular px-3 py-2.5 text-right font-medium">{row.units}</td>
                  <td className="tabular px-3 py-2.5 text-right text-[var(--color-ink-2)]">
                    {humanDuration(row.activeSeconds)}
                  </td>

                  {FORMAT_ORDER.map((format) => {
                    const bucket = row.perFormat[format];
                    const perUnit =
                      bucket && bucket.units > 0 ? Math.round(bucket.seconds / bucket.units) : null;
                    const target =
                      (benchmarks.find((item) => item.format === format)?.target_minutes_per_unit ??
                        0) * 60;
                    const over = perUnit != null && target > 0 && perUnit > target;
                    return (
                      <td
                        key={format}
                        className="tabular px-3 py-2.5 text-right"
                        style={{
                          color: perUnit == null ? "var(--color-ink-3)" : over ? "var(--color-serious)" : "var(--color-good)",
                        }}
                        title={
                          perUnit == null
                            ? "No units of this format"
                            : `Benchmark ${humanDuration(target)}`
                        }
                      >
                        {perUnit == null ? "—" : humanDuration(perUnit)}
                      </td>
                    );
                  })}

                  <td className="tabular px-3 py-2.5 text-right">
                    {row.tickets > 0 ? `${pct(row.firstPass, row.tickets)}%` : "—"}
                  </td>
                  <td className="tabular px-4 py-2.5 text-right font-medium">
                    {row.paceIndex == null ? (
                      <span className="text-[var(--color-ink-3)]">—</span>
                    ) : (
                      <span
                        style={{
                          color:
                            row.paceIndex >= 100 ? "var(--color-good)" : "var(--color-serious)",
                        }}
                      >
                        {row.paceIndex}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Th({
  children,
  onClick,
  active,
  align = "right",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  align?: "left" | "right";
}) {
  return (
    <th
      scope="col"
      className={`px-3 py-2 font-medium first:pl-4 last:pr-4 ${
        align === "left" ? "text-left" : "text-right"
      } ${onClick ? "cursor-pointer select-none hover:text-[var(--color-ink)]" : ""}`}
      style={active ? { color: "var(--color-ink)" } : undefined}
      onClick={onClick}
      aria-sort={active ? "descending" : undefined}
    >
      {children}
      {active && <span aria-hidden> ↓</span>}
    </th>
  );
}
