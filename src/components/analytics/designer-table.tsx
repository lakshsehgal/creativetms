"use client";

import { useMemo, useState } from "react";
import type { CreativeFormat, DailyScorecard, Profile } from "@/lib/types";
import { FORMAT_ORDER, FORMATS } from "@/lib/types";
import { pct } from "@/lib/format";
import { Avatar, Card } from "@/components/ui/primitives";

type SortKey = "name" | "units" | "firstPass" | "onTime";

interface Row {
  designer: Profile;
  units: number;
  tickets: number;
  firstPass: number;
  onTime: number;
  late: number;
  revisions: number;
  perFormat: Partial<Record<CreativeFormat, number>>;
}

/**
 * Per-designer rollup for the admin.
 *
 * Sorted by output rather than by a score — what was delivered, how cleanly,
 * and whether it landed when it was promised.
 */
export function DesignerTable({
  designers,
  scorecards,
  loading,
}: {
  designers: Profile[];
  scorecards: DailyScorecard[];
  loading: boolean;
}) {
  const [sort, setSort] = useState<SortKey>("units");

  const rows = useMemo<Row[]>(() => {
    const built = designers.map((designer) => {
      const cards = scorecards.filter((card) => card.designer_id === designer.id);

      const perFormat: Row["perFormat"] = {};
      cards.forEach((card) => {
        FORMAT_ORDER.forEach((format) => {
          const units = card.units_by_format?.[format] ?? 0;
          if (units) perFormat[format] = (perFormat[format] ?? 0) + units;
        });
      });

      const totals = cards.reduce(
        (acc, card) => ({
          units: acc.units + card.units_completed,
          tickets: acc.tickets + card.tickets_completed,
          firstPass: acc.firstPass + card.first_pass_count,
          onTime: acc.onTime + card.on_time_count,
          late: acc.late + card.late_count,
          revisions: acc.revisions + card.revision_rounds,
        }),
        { units: 0, tickets: 0, firstPass: 0, onTime: 0, late: 0, revisions: 0 },
      );

      return { designer, ...totals, perFormat };
    });

    return built.sort((a, b) => {
      if (sort === "name") {
        return (a.designer.full_name || a.designer.email).localeCompare(
          b.designer.full_name || b.designer.email,
        );
      }
      if (sort === "firstPass") return pct(b.firstPass, b.tickets) - pct(a.firstPass, a.tickets);
      if (sort === "onTime") {
        return pct(b.onTime, b.onTime + b.late) - pct(a.onTime, a.onTime + a.late);
      }
      return b.units - a.units;
    });
  }, [designers, scorecards, sort]);

  const active = rows.filter((row) => row.units > 0);

  return (
    <Card padded={false}>
      <div className="flex items-center gap-3 border-b border-[var(--color-line)] px-4 py-3">
        <div>
          <h2 className="text-[13px] font-semibold tracking-tight">Designers</h2>
          <p className="mt-0.5 text-[11.5px] text-[var(--color-ink-3)]">
            Built from the nightly scorecards: what each person had signed off,
            how much of it landed first time, and how much of it was on time.
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
          <table className="w-full min-w-[820px] border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-[var(--color-line)] text-[11px] uppercase tracking-[0.06em] text-[var(--color-ink-3)]">
                <Th onClick={() => setSort("name")} active={sort === "name"} align="left">
                  Designer
                </Th>
                <Th onClick={() => setSort("units")} active={sort === "units"}>
                  Units
                </Th>
                {FORMAT_ORDER.map((format) => (
                  <Th key={format}>{FORMATS[format].short}</Th>
                ))}
                <Th>Revisions</Th>
                <Th onClick={() => setSort("firstPass")} active={sort === "firstPass"}>
                  1st pass
                </Th>
                <Th onClick={() => setSort("onTime")} active={sort === "onTime"}>
                  On time
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

                  {FORMAT_ORDER.map((format) => (
                    <td
                      key={format}
                      className="tabular px-3 py-2.5 text-right"
                      style={{ color: row.perFormat[format] ? undefined : "var(--color-ink-3)" }}
                    >
                      {row.perFormat[format] ?? "—"}
                    </td>
                  ))}

                  <td className="tabular px-3 py-2.5 text-right text-[var(--color-ink-2)]">
                    {row.revisions}
                  </td>
                  <td className="tabular px-3 py-2.5 text-right">
                    {row.tickets > 0 ? `${pct(row.firstPass, row.tickets)}%` : "—"}
                  </td>
                  <td className="tabular px-4 py-2.5 text-right">
                    {row.onTime + row.late > 0 ? `${pct(row.onTime, row.onTime + row.late)}%` : "—"}
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
