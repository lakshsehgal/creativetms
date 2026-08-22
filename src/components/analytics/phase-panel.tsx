"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, RotateCcw, Scaling } from "lucide-react";
import type {
  CreativeFormat,
  DesignerPhaseRow,
  FormatPhaseRow,
  PhaseDayRow,
  Profile,
  WorkPhase,
} from "@/lib/types";
import { FORMAT_ORDER, PHASES, PHASE_ORDER, formatMeta } from "@/lib/types";
import { humanDuration, dayLabel, pct } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Card, StatTile } from "@/components/ui/primitives";
import { StackedBar, StackedColumns, PhaseLegend } from "@/components/charts/stacked-bar";
import { Avatar } from "@/components/ui/primitives";

const SERIES = PHASE_ORDER.map((phase) => ({
  key: phase,
  label: PHASES[phase].label,
  color: PHASES[phase].tone,
}));

type Totals = Record<WorkPhase, number>;

const ZERO: Totals = { initial: 0, revision: 0, size_change: 0 };

function sum(totals: Totals): number {
  return totals.initial + totals.revision + totals.size_change;
}

function rework(totals: Totals): number {
  return totals.revision + totals.size_change;
}

/**
 * Where the studio's hours actually went.
 *
 * The clock has recorded a phase on every session since the workflow rewrite,
 * but until now it only ever showed up as one number per ticket. Split three
 * ways it answers the question the scorecard couldn't: is a designer slow, or
 * is a third of their week going into resizes nobody counted?
 *
 * Admin and operator only. This is per-person timing, which is management
 * information — a strategist gets delivery status and a designer gets their
 * own finished totals.
 */
export function PhasePanel({
  from,
  to,
  range,
  designers,
}: {
  from: string;
  to: string;
  range: string;
  designers: Profile[];
}) {
  const supabase = supabaseBrowser();
  const [sortBy, setSortBy] = useState<"total" | "rework">("total");
  const [openDesigner, setOpenDesigner] = useState<string | null>(null);

  const byDesigner = useQuery({
    queryKey: ["phase-breakdown", range],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("designer_phase_breakdown", {
        p_from: from,
        p_to: to,
      });
      if (error) throw error;
      return (data ?? []) as DesignerPhaseRow[];
    },
  });

  const byFormat = useQuery({
    queryKey: ["format-phase", range],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("designer_format_phase", {
        p_from: from,
        p_to: to,
      });
      if (error) throw error;
      return (data ?? []) as FormatPhaseRow[];
    },
  });

  const daily = useQuery({
    queryKey: ["phase-daily", range],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("studio_phase_daily", {
        p_from: from,
        p_to: to,
      });
      if (error) throw error;
      return (data ?? []) as PhaseDayRow[];
    },
  });

  /* ------------------------------------------------------------ shaping */

  const studio = useMemo(() => {
    const totals = { ...ZERO };
    (byDesigner.data ?? []).forEach((row) => {
      totals[row.phase] = (totals[row.phase] ?? 0) + Number(row.total_seconds);
    });
    return totals;
  }, [byDesigner.data]);

  const people = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; totals: Totals; tickets: number; sessions: number }
    >();

    (byDesigner.data ?? []).forEach((row) => {
      if (!map.has(row.designer_id)) {
        map.set(row.designer_id, {
          id: row.designer_id,
          name: row.designer_name,
          totals: { ...ZERO },
          tickets: 0,
          sessions: 0,
        });
      }
      const entry = map.get(row.designer_id)!;
      entry.totals[row.phase] = (entry.totals[row.phase] ?? 0) + Number(row.total_seconds);
      entry.tickets += row.tickets;
      entry.sessions += row.sessions;
    });

    const rows = [...map.values()];
    rows.sort((a, b) =>
      sortBy === "rework"
        ? pct(rework(b.totals), sum(b.totals)) - pct(rework(a.totals), sum(a.totals))
        : sum(b.totals) - sum(a.totals),
    );
    return rows;
  }, [byDesigner.data, sortBy]);

  /** Format × phase for the studio, plus per designer for the drill-down. */
  const formats = useMemo(() => {
    const map = new Map<CreativeFormat, { totals: Totals; units: number; tickets: number }>();
    (byFormat.data ?? []).forEach((row) => {
      if (!map.has(row.format)) {
        map.set(row.format, { totals: { ...ZERO }, units: 0, tickets: 0 });
      }
      const entry = map.get(row.format)!;
      entry.totals[row.phase] = (entry.totals[row.phase] ?? 0) + Number(row.total_seconds);
      entry.units += row.units;
      entry.tickets += row.tickets;
    });
    return FORMAT_ORDER.filter((format) => map.has(format)).map((format) => ({
      format,
      ...map.get(format)!,
    }));
  }, [byFormat.data]);

  const designerFormats = useMemo(() => {
    if (!openDesigner) return [];
    const map = new Map<CreativeFormat, Totals>();
    (byFormat.data ?? [])
      .filter((row) => row.designer_id === openDesigner)
      .forEach((row) => {
        if (!map.has(row.format)) map.set(row.format, { ...ZERO });
        const entry = map.get(row.format)!;
        entry[row.phase] = (entry[row.phase] ?? 0) + Number(row.total_seconds);
      });
    return FORMAT_ORDER.filter((format) => map.has(format)).map((format) => ({
      format,
      totals: map.get(format)!,
    }));
  }, [byFormat.data, openDesigner]);

  const trend = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    (daily.data ?? []).forEach((row) => {
      const key = row.day.slice(0, 10);
      if (!map.has(key)) map.set(key, {});
      map.get(key)![row.phase] = Number(row.total_seconds);
    });

    // Fill the window so a quiet day is a gap, not a closed-up column.
    const out: { day: string; label: string; values: Record<string, number> }[] = [];
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}`;
      out.push({
        day: key,
        label: dayLabel(key).replace("Today", "Today").slice(0, 6),
        values: map.get(key) ?? {},
      });
    }
    return out;
  }, [daily.data, from, to]);

  /* ---------------------------------------------------------------- UI */

  const tracked = sum(studio);
  const reworkShare = pct(rework(studio), tracked);
  const failed = byDesigner.error || byFormat.error || daily.error;

  if (failed) {
    return (
      <Card>
        <p className="py-6 text-center text-[12.5px] text-[var(--color-ink-3)]">
          Couldn&apos;t load the time breakdown. If this persists, migration
          0011 may not have run yet.
        </p>
      </Card>
    );
  }

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[14px] font-semibold tracking-tight">Where the hours went</h2>
        <p className="text-[11.5px] text-[var(--color-ink-3)]">
          Hands-on time only — the clock runs in In Progress and nowhere else.
        </p>
      </header>

      {/* ------------------------------------------------------ consolidated */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Tracked"
          value={humanDuration(tracked)}
          hint={`${people.length} designer${people.length === 1 ? "" : "s"}`}
        />
        {/* The number stays in ink; the chip beside the label carries which
            segment of the bar below it is. A coloured figure would spend the
            identity channel on something the chip already says, and read
            worse at 26px. */}
        {PHASE_ORDER.map((phase) => (
          <StatTile
            key={phase}
            label={PHASES[phase].label}
            swatch={PHASES[phase].tone}
            value={humanDuration(studio[phase])}
            hint={`${pct(studio[phase], tracked)}% of tracked time`}
          />
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-[12.5px] font-semibold">The studio, split three ways</h3>
          <span className="ml-auto">
            <PhaseLegend keys={SERIES} />
          </span>
        </div>

        <div className="mt-3">
          <StackedBar
            segments={SERIES.map((series) => ({
              ...series,
              value: studio[series.key as WorkPhase],
            }))}
            format={humanDuration}
            height={16}
            showLabels
          />
        </div>

        <p className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-[var(--color-ink-2)]">
          <RotateCcw size={13} className="mt-0.5 shrink-0 text-[var(--color-ink-3)]" />
          <span>
            <span className="font-semibold text-[var(--color-ink)]">
              {reworkShare}% of tracked time was rework
            </span>{" "}
            — {humanDuration(studio.revision)} of revisions and{" "}
            {humanDuration(studio.size_change)} of resizing. Revisions point at
            the brief; resizes point at how many placements each concept has to
            cover.
          </span>
        </p>
      </Card>

      {/* --------------------------------------------------------- per person */}
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-line)] px-4 py-2.5">
          <h3 className="text-[12.5px] font-semibold">By designer</h3>
          <div className="ml-auto flex items-center gap-1.5 text-[11px] text-[var(--color-ink-3)]">
            Sort
            {(["total", "rework"] as const).map((key) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                className={`rounded-[var(--radius-sm)] px-1.5 py-0.5 transition-colors ${
                  sortBy === key
                    ? "bg-[var(--color-surface-3)] font-medium text-[var(--color-ink)]"
                    : "hover:text-[var(--color-ink-2)]"
                }`}
              >
                {key === "total" ? "Most hours" : "Most rework"}
              </button>
            ))}
          </div>
        </div>

        {people.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12.5px] text-[var(--color-ink-3)]">
            No time tracked in this window.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-[10.5px] uppercase tracking-[0.06em] text-[var(--color-ink-3)]">
                  <th className="px-4 py-2 text-left font-medium">Designer</th>
                  <th className="px-2 py-2 text-right font-medium">Tracked</th>
                  {PHASE_ORDER.map((phase) => (
                    <th key={phase} className="px-2 py-2 text-right font-medium">
                      {PHASES[phase].short}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-right font-medium">Rework</th>
                  <th className="w-[190px] px-4 py-2 text-left font-medium">Split</th>
                </tr>
              </thead>

              <tbody>
                {people.map((person) => {
                  const total = sum(person.totals);
                  const share = pct(rework(person.totals), total);
                  const profile = designers.find((row) => row.id === person.id);
                  const open = openDesigner === person.id;

                  return (
                    <tr
                      key={person.id}
                      onClick={() => setOpenDesigner(open ? null : person.id)}
                      className={`cursor-pointer border-b border-[var(--color-line)] transition-colors last:border-0 hover:bg-[var(--color-surface-2)] ${
                        open ? "bg-[var(--color-surface-2)]" : ""
                      }`}
                    >
                      <td className="px-4 py-2">
                        <span className="flex items-center gap-2">
                          <Avatar
                            id={person.id}
                            name={person.name}
                            src={profile?.avatar_url}
                            size={22}
                          />
                          <span className="truncate font-medium">{person.name}</span>
                          <span className="text-[10.5px] text-[var(--color-ink-3)]">
                            {person.tickets} ticket{person.tickets === 1 ? "" : "s"}
                          </span>
                        </span>
                      </td>
                      <td className="tabular px-2 py-2 text-right font-medium">
                        {humanDuration(total)}
                      </td>
                      {PHASE_ORDER.map((phase) => (
                        <td
                          key={phase}
                          className="tabular px-2 py-2 text-right text-[var(--color-ink-2)]"
                        >
                          {person.totals[phase] > 0 ? (
                            <>
                              {humanDuration(person.totals[phase])}
                              <span className="ml-1 text-[10px] text-[var(--color-ink-3)]">
                                {pct(person.totals[phase], total)}%
                              </span>
                            </>
                          ) : (
                            <span className="text-[var(--color-ink-3)]">—</span>
                          )}
                        </td>
                      ))}
                      <td
                        className="tabular px-2 py-2 text-right font-medium"
                        style={
                          share >= 40 ? { color: "var(--color-serious)" } : undefined
                        }
                      >
                        {share}%
                      </td>
                      <td className="px-4 py-2">
                        <StackedBar
                          segments={SERIES.map((series) => ({
                            ...series,
                            value: person.totals[series.key as WorkPhase],
                          }))}
                          format={humanDuration}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {openDesigner && designerFormats.length > 0 && (
          <div className="border-t border-[var(--color-line)] bg-[var(--color-surface-2)] px-4 py-3">
            <p className="mb-2 text-[11.5px] font-medium">
              {people.find((row) => row.id === openDesigner)?.name} — by format
            </p>
            <ul className="space-y-2">
              {designerFormats.map((row) => (
                <li key={row.format} className="flex items-center gap-3">
                  <span className="w-[110px] shrink-0 truncate text-[11.5px]">
                    {formatMeta(row.format).label}
                  </span>
                  <span className="tabular w-[64px] shrink-0 text-right text-[11.5px] text-[var(--color-ink-2)]">
                    {humanDuration(sum(row.totals))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <StackedBar
                      segments={SERIES.map((series) => ({
                        ...series,
                        value: row.totals[series.key as WorkPhase],
                      }))}
                      format={humanDuration}
                      height={8}
                    />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* ---------------------------------------------------------- by format */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <Scaling size={13} className="text-[var(--color-ink-3)]" />
            <h3 className="text-[12.5px] font-semibold">Cost of a format, split by phase</h3>
          </div>

          {formats.length === 0 ? (
            <p className="py-8 text-center text-[12px] text-[var(--color-ink-3)]">
              Nothing tracked in this window.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {formats.map((row) => {
                const total = sum(row.totals);
                // Rows here are read against each other, so bar length has to
                // mean hours, not just "100% of itself".
                const widest = Math.max(...formats.map((item) => sum(item.totals)), 1);
                return (
                  <li key={row.format}>
                    <div className="mb-1 flex items-baseline gap-2 text-[11.5px]">
                      <span className="font-medium">{formatMeta(row.format).label}</span>
                      <span className="tabular text-[var(--color-ink-3)]">
                        {humanDuration(total)} · {row.units} unit
                        {row.units === 1 ? "" : "s"}
                      </span>
                      <span className="tabular ml-auto text-[var(--color-ink-3)]">
                        {row.units > 0
                          ? `${humanDuration(Math.round(total / row.units))}/unit`
                          : "—"}
                      </span>
                    </div>
                    <StackedBar
                      segments={SERIES.map((series) => ({
                        ...series,
                        value: row.totals[series.key as WorkPhase],
                      }))}
                      format={humanDuration}
                      scale={total / widest}
                    />
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-3">
            <PhaseLegend keys={SERIES} />
          </div>
        </Card>

        {/* ------------------------------------------------------------ trend */}
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <Clock size={13} className="text-[var(--color-ink-3)]" />
            <h3 className="text-[12.5px] font-semibold">Day by day</h3>
            <span className="ml-auto">
              <PhaseLegend keys={SERIES} />
            </span>
          </div>

          <div className="mt-3">
            <StackedColumns days={trend} keys={SERIES} format={humanDuration} height={140} />
          </div>
        </Card>
      </div>
    </section>
  );
}
