"use client";

import type { DailyScorecard, FormatBenchmark, Profile } from "@/lib/types";
import { FORMAT_ORDER, FORMATS } from "@/lib/types";
import { humanDuration, pct } from "@/lib/format";
import { Avatar } from "@/components/ui/primitives";
import { totalUnits } from "./compute";

/**
 * One designer, one day.
 *
 * Written to be readable by the person it describes: the capacity bar is the
 * headline, the format breakdown explains it, and pace is shown against the
 * benchmark with the benchmark spelled out — no bare score, no ranking.
 */
export function ScorecardCard({
  card,
  designer,
  benchmarks,
  live,
}: {
  card: DailyScorecard;
  designer: Profile;
  benchmarks: FormatBenchmark[];
  live?: boolean;
}) {
  const capacitySeconds = designer.daily_capacity_minutes * 60;
  const usedPct = capacitySeconds > 0 ? Math.min(150, (card.active_seconds / capacitySeconds) * 100) : 0;
  const units = totalUnits(card);

  return (
    <article className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
      <header className="flex items-center gap-2.5">
        <Avatar id={designer.id} name={designer.full_name} email={designer.email} size={30} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium leading-tight">
            {designer.full_name || designer.email}
          </p>
          <p className="text-[11px] leading-tight text-[var(--color-ink-3)]">
            {card.tickets_completed} signed off · {card.tickets_touched} worked on
          </p>
        </div>
        {live && (
          <span
            className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
            style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
          >
            <span className="breathe h-1 w-1 rounded-full" style={{ background: "var(--color-accent)" }} />
            Live
          </span>
        )}
      </header>

      <div className="mt-4">
        <div className="flex items-baseline justify-between">
          <span className="tabular text-[22px] font-semibold leading-none tracking-tight">
            {humanDuration(card.active_seconds)}
          </span>
          <span className="text-[11px] text-[var(--color-ink-3)]">
            of {Math.round(designer.daily_capacity_minutes / 60)}h
          </span>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full"
          style={{ background: "var(--color-surface-3)" }}
        >
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${Math.min(100, usedPct)}%`,
              background:
                usedPct > 105
                  ? "var(--color-warning)"
                  : usedPct >= 55
                    ? "var(--color-good)"
                    : "var(--color-accent)",
            }}
          />
        </div>
        <p className="mt-1.5 text-[11px] text-[var(--color-ink-3)]">
          {Math.round(usedPct)}% of the working day tracked
        </p>
      </div>

      {units > 0 && (
        <ul className="mt-4 flex flex-wrap gap-1.5">
          {FORMAT_ORDER.map((format) => {
            const count = card.units_by_format?.[format] ?? 0;
            if (!count) return null;
            const seconds = card.seconds_by_format?.[format] ?? 0;
            const perUnit = count > 0 && seconds > 0 ? Math.round(seconds / count) : null;
            const target = benchmarks.find((row) => row.format === format);
            return (
              <li
                key={format}
                title={
                  perUnit
                    ? `${humanDuration(perUnit)} per unit · benchmark ${humanDuration(
                        (target?.target_minutes_per_unit ?? 0) * 60,
                      )}`
                    : undefined
                }
                className="inline-flex items-center gap-1 rounded-[var(--radius-xs)] px-1.5 py-0.5 text-[11px]"
                style={{
                  background: `color-mix(in srgb, ${FORMATS[format].series} 14%, transparent)`,
                  color: FORMATS[format].series,
                }}
              >
                <span className="font-semibold">{count}</span>
                {FORMATS[format].label}
                {perUnit && (
                  <span className="tabular opacity-75">· {humanDuration(perUnit)}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-[var(--color-line)] pt-3">
        <Metric
          label="Pace"
          value={card.efficiency_pct == null ? "—" : String(card.efficiency_pct)}
          tone={
            card.efficiency_pct == null
              ? undefined
              : card.efficiency_pct >= 100
                ? "var(--color-good)"
                : "var(--color-serious)"
          }
          hint="vs benchmark"
        />
        <Metric
          label="1st pass"
          value={card.tickets_completed ? `${pct(card.first_pass_count, card.tickets_completed)}%` : "—"}
          hint={`${card.revision_rounds} revisions`}
        />
        <Metric
          label="On time"
          value={
            card.on_time_count + card.late_count > 0
              ? `${pct(card.on_time_count, card.on_time_count + card.late_count)}%`
              : "—"
          }
          hint={card.late_count > 0 ? `${card.late_count} late` : "no misses"}
        />
      </dl>
    </article>
  );
}

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div>
      <dt className="text-[10.5px] uppercase tracking-[0.06em] text-[var(--color-ink-3)]">{label}</dt>
      <dd className="tabular mt-0.5 text-[15px] font-semibold leading-none" style={{ color: tone }}>
        {value}
      </dd>
      {hint && <p className="mt-1 text-[10.5px] text-[var(--color-ink-3)]">{hint}</p>}
    </div>
  );
}
