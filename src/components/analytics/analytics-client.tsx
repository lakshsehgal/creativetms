"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DailyScorecard, FormatBenchmark, Profile } from "@/lib/types";
import { FORMAT_ORDER, FORMATS, canSeeAllTime } from "@/lib/types";
import { humanDuration, isoDay, minutesToHuman, pct } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/queries";
import { Card, PageHeader, StatTile } from "@/components/ui/primitives";
import { BarChart, type BarDatum } from "@/components/charts/bar-chart";
import { TrendChart } from "@/components/charts/trend-chart";
import { DesignerTable } from "./designer-table";

const RANGES = [
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "90", label: "90 days" },
];

interface FormatStat {
  format: keyof typeof FORMATS;
  tickets: number;
  units: number;
  total_seconds: number;
  seconds_per_unit: number | null;
  first_pass_tickets: number;
  on_time_tickets: number;
  dated_tickets: number;
  revision_rounds: number;
}

export function AnalyticsClient({
  profile,
  benchmarks,
  designers,
}: {
  profile: Profile;
  benchmarks: FormatBenchmark[];
  designers: Profile[];
}) {
  const supabase = supabaseBrowser();
  const [range, setRange] = useState("30");
  const isAdmin = canSeeAllTime(profile.role);

  const { from, to } = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (Number(range) - 1));
    return { from: isoDay(start), to: isoDay(end) };
  }, [range]);

  const stats = useQuery({
    queryKey: [...queryKeys.analytics(range), "formats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("team_format_stats", {
        p_from: from,
        p_to: to,
      });
      if (error) throw error;
      return (data ?? []) as FormatStat[];
    },
  });

  const daily = useQuery({
    queryKey: [...queryKeys.analytics(range), "daily"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("team_daily_output", {
        p_from: from,
        p_to: to,
      });
      if (error) throw error;
      return (data ?? []) as { day: string; units: number; tickets: number; active_seconds: number }[];
    },
  });

  // Per-designer breakdown is admin-only, and comes from the nightly cards.
  const scorecards = useQuery({
    queryKey: [...queryKeys.analytics(range), "scorecards"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_scorecards")
        .select("*")
        .gte("day", from)
        .lte("day", to);
      if (error) throw error;
      return (data ?? []) as DailyScorecard[];
    },
  });

  const rows = stats.data ?? [];
  const totals = rows.reduce(
    (acc, row) => ({
      units: acc.units + row.units,
      tickets: acc.tickets + row.tickets,
      seconds: acc.seconds + Number(row.total_seconds ?? 0),
      firstPass: acc.firstPass + row.first_pass_tickets,
      onTime: acc.onTime + row.on_time_tickets,
      dated: acc.dated + row.dated_tickets,
      revisions: acc.revisions + row.revision_rounds,
    }),
    { units: 0, tickets: 0, seconds: 0, firstPass: 0, onTime: 0, dated: 0, revisions: 0 },
  );

  const paceBars: BarDatum[] = FORMAT_ORDER.map((format) => {
    const row = rows.find((item) => item.format === format);
    const benchmark = benchmarks.find((item) => item.format === format);
    return {
      key: format,
      label: FORMATS[format].label,
      value: row?.seconds_per_unit ?? 0,
      color: FORMATS[format].series,
      // An unmeasured format shows its real time with no target line.
      benchmark: benchmark?.target_minutes_per_unit
        ? benchmark.target_minutes_per_unit * 60
        : null,
      note: row ? `${row.units} unit${row.units === 1 ? "" : "s"}` : "—",
    };
  });

  const volumeBars: BarDatum[] = FORMAT_ORDER.map((format) => {
    const row = rows.find((item) => item.format === format);
    return {
      key: format,
      label: FORMATS[format].label,
      value: row?.units ?? 0,
      color: FORMATS[format].series,
      note: row ? `${row.tickets} ticket${row.tickets === 1 ? "" : "s"}` : "—",
    };
  });

  const trend = useMemo(() => {
    const points = (daily.data ?? []).map((row) => ({
      x: new Date(row.day).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      y: row.units,
    }));
    return [
      {
        key: "units",
        label: "Units signed off",
        color: "var(--color-series-1)",
        points,
      },
    ];
  }, [daily.data]);

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle={`${totals.units} units signed off across ${totals.tickets} tickets`}
      >
        <div
          role="tablist"
          aria-label="Date range"
          className="flex items-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--color-line)] p-0.5"
        >
          {RANGES.map((option) => (
            <button
              key={option.key}
              role="tab"
              aria-selected={range === option.key}
              onClick={() => setRange(option.key)}
              className={`rounded-[var(--radius-sm)] px-2.5 py-1 text-[12px] transition-colors ${
                range === option.key
                  ? "bg-[var(--color-surface-3)] font-medium text-[var(--color-ink)]"
                  : "text-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="mx-auto max-w-6xl space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Units delivered" value={totals.units} hint={`${totals.tickets} tickets`} />
            <StatTile
              label="First-pass approval"
              value={pct(totals.firstPass, totals.tickets)}
              unit="%"
              hint="Signed off with no revision round"
              accent={
                pct(totals.firstPass, totals.tickets) >= 70 ? "var(--color-good)" : undefined
              }
            />
            <StatTile
              label="On time"
              value={totals.dated ? pct(totals.onTime, totals.dated) : "—"}
              unit={totals.dated ? "%" : undefined}
              hint={`${totals.dated} tickets had a deadline`}
            />
            <StatTile
              label="Tracked time"
              value={humanDuration(totals.seconds)}
              hint="Across everything signed off"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="text-[13px] font-semibold tracking-tight">Time per unit</h2>
              <p className="mb-4 mt-0.5 text-[11.5px] text-[var(--color-ink-3)]">
                Actual against the benchmark line. Shorter is faster.
              </p>
              <BarChart
                data={paceBars}
                formatValue={(seconds) => humanDuration(seconds)}
                emptyLabel="Nothing signed off in this window yet"
              />
            </Card>

            <Card>
              <h2 className="text-[13px] font-semibold tracking-tight">Volume by format</h2>
              <p className="mb-4 mt-0.5 text-[11.5px] text-[var(--color-ink-3)]">
                Units signed off in the last {range} days.
              </p>
              <BarChart
                data={volumeBars}
                formatValue={(units) => `${units}`}
                emptyLabel="Nothing signed off in this window yet"
              />
            </Card>
          </div>

          <Card>
            <h2 className="text-[13px] font-semibold tracking-tight">Output over time</h2>
            <p className="mb-3 mt-0.5 text-[11.5px] text-[var(--color-ink-3)]">
              Units signed off per day.
            </p>
            <TrendChart series={trend} formatValue={(value) => String(value)} />
          </Card>

          {isAdmin ? (
            <DesignerTable
              designers={designers}
              scorecards={scorecards.data ?? []}
              benchmarks={benchmarks}
              loading={scorecards.isLoading}
            />
          ) : (
            <Card>
              <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">
                Per-designer timing is for admins and operators. These team figures are the
                planning numbers — what a{" "}
                {FORMATS.static.label.toLowerCase()} or{" "}
                {FORMATS.video.label.toLowerCase()} actually costs in hours, so
                you can quote a deadline you can keep.
              </p>
              <p className="mt-2 text-[12px] text-[var(--color-ink-3)]">
                Current benchmarks:{" "}
                {FORMAT_ORDER.map((format) => {
                  const target = benchmarks.find((item) => item.format === format)
                    ?.target_minutes_per_unit;
                  return `${FORMATS[format].label} ${
                    target ? minutesToHuman(target) : "not set"
                  }`;
                }).join(" · ")}
              </p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
