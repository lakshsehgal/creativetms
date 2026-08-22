"use client";

import { Timer } from "lucide-react";
import type {
  FormatBenchmark,
  TicketWithRefs,
  UserRole,
  WorkPhase,
  WorkSession,
} from "@/lib/types";
import { formatMeta, PHASE_ORDER, canSeeLiveTimer, phaseMeta } from "@/lib/types";
import { humanDuration, minutesToHuman, relativeTime, stopwatch } from "@/lib/format";
import { secondsSince, useTicking } from "@/hooks/use-ticking";

/**
 * The time story for one ticket.
 *
 * Deliberately framed against the format benchmark rather than against other
 * designers. "This static took 40 minutes, the bar is 35" is a conversation;
 * a ranked list of colleagues is an argument.
 */
export function TimePanel({
  ticket,
  sessions,
  benchmarks,
  canSeeDetail,
  viewerRole,
}: {
  ticket: TicketWithRefs;
  sessions: WorkSession[];
  benchmarks: FormatBenchmark[];
  canSeeDetail: boolean;
  viewerRole: UserRole;
}) {
  const open = sessions.find((session) => session.ended_at === null);

  /**
   * A designer sees what a piece of work took, not a stopwatch running while
   * they do it. Watching your own seconds tick is pressure, not information —
   * and the number is identical either way. Admins and operators, who are
   * actually managing throughput, do see it live.
   */
  const liveClock = canSeeLiveTimer(viewerRole);
  useTicking(Boolean(open) && liveClock);

  const closedSeconds = sessions
    .filter((session) => session.ended_at)
    .reduce((sum, session) => sum + (session.duration_seconds ?? 0), 0);

  const liveSeconds = open && liveClock ? secondsSince(open.started_at) : 0;
  const total = closedSeconds + liveSeconds;

  // Group the sessions by what kind of work they were.
  const byPhase = new Map<WorkPhase, number>();
  sessions.forEach((session) => {
    const seconds =
      session.duration_seconds ??
      (session.ended_at ? 0 : secondsSince(session.started_at));
    byPhase.set(session.phase, (byPhase.get(session.phase) ?? 0) + seconds);
  });
  const phaseTotals = PHASE_ORDER.filter((phase) => (byPhase.get(phase) ?? 0) > 0).map(
    (phase) => [phase, byPhase.get(phase)!] as const,
  );
  const phaseSum = phaseTotals.reduce((sum, [, seconds]) => sum + seconds, 0) || 1;

  const perUnit = ticket.quantity > 0 ? Math.round(total / ticket.quantity) : total;
  const benchmark = benchmarks.find((row) => row.format === ticket.format);
  const targetSeconds = (benchmark?.target_minutes_per_unit ?? 0) * 60;
  // Formats nobody has measured yet (UGC, to begin with) simply show the time.
  const ratio = targetSeconds > 0 ? perUnit / targetSeconds : null;

  const meta = formatMeta(ticket.format);

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)]">
      <div className="flex items-center gap-2 border-b border-[var(--color-line)] px-4 py-2.5">
        <Timer size={13} className="text-[var(--color-ink-3)]" />
        <h3 className="text-[12px] font-semibold tracking-tight">Time</h3>
        {open && liveClock && (
          <span
            className="ml-auto flex items-center gap-1.5 text-[11px] font-medium"
            style={{ color: "var(--color-ink-2)" }}
          >
            <span
              className="breathe h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--color-accent)" }}
            />
            Running
          </span>
        )}
      </div>

      <div className="px-4 py-3.5">
        <p className="tabular text-[30px] font-semibold leading-none tracking-tight">
          {open && liveClock ? stopwatch(total) : humanDuration(closedSeconds)}
        </p>
        <p className="mt-1.5 text-[11.5px] text-[var(--color-ink-3)]">
          {sessions.length === 0
            ? "Not started yet"
            : open && !liveClock
              ? "Currently being worked on — total updates when you pause or submit"
              : `Across ${sessions.length} work session${sessions.length === 1 ? "" : "s"}`}
        </p>

        {ticket.quantity > 1 && total > 0 && (
          <p className="mt-3 text-[12px] text-[var(--color-ink-2)]">
            <span className="tabular font-medium text-[var(--color-ink)]">
              {humanDuration(perUnit)}
            </span>{" "}
            per {meta.label.toLowerCase()}
          </p>
        )}

        {/* Pace against the benchmark. Under the bar is the good side. */}
        {ratio != null && total > 0 && (
          <div className="mt-3.5">
            <div className="mb-1.5 flex items-baseline justify-between text-[11px]">
              <span className="text-[var(--color-ink-3)]">
                Benchmark {minutesToHuman(benchmark?.target_minutes_per_unit)} / unit
              </span>
              <span
                className="tabular font-medium"
                style={{
                  color: ratio <= 1 ? "var(--color-good)" : "var(--color-serious)",
                }}
              >
                {ratio <= 1
                  ? `${Math.round((1 - ratio) * 100)}% under`
                  : `${Math.round((ratio - 1) * 100)}% over`}
              </span>
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full"
              style={{ background: "var(--color-surface-3)" }}
            >
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${Math.min(100, ratio * 100)}%`,
                  background: ratio <= 1 ? "var(--color-good)" : "var(--color-serious)",
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Where the time went. Original build vs revisions vs resizes — three
          different conversations, and only the first is "how long does this
          format take us". */}
      {phaseTotals.length > 1 && (
        <div className="border-t border-[var(--color-line)] px-4 py-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.07em] text-[var(--color-ink-3)]">
            Where it went
          </p>

          <div className="flex h-2 overflow-hidden rounded-full" style={{ gap: 2 }}>
            {phaseTotals.map(([phase, seconds]) => (
              <span
                key={phase}
                title={`${phaseMeta(phase).label}: ${humanDuration(seconds)}`}
                style={{
                  width: `${(seconds / phaseSum) * 100}%`,
                  background: phaseMeta(phase).tone,
                }}
              />
            ))}
          </div>

          <ul className="mt-2.5 space-y-1">
            {phaseTotals.map(([phase, seconds]) => (
              <li key={phase} className="flex items-baseline gap-2 text-[11.5px]">
                <span
                  className="h-2 w-2 shrink-0 rounded-[2px]"
                  style={{ background: phaseMeta(phase).tone }}
                />
                <span className="text-[var(--color-ink-2)]">{phaseMeta(phase).label}</span>
                <span className="tabular ml-auto font-medium">{humanDuration(seconds)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {canSeeDetail && sessions.length > 0 && (
        <details className="border-t border-[var(--color-line)]">
          <summary className="cursor-pointer list-none px-4 py-2.5 text-[11.5px] text-[var(--color-ink-3)] transition-colors hover:text-[var(--color-ink-2)]">
            Session log
          </summary>
          <ul className="space-y-1.5 px-4 pb-3">
            {sessions.slice(0, 12).map((session) => (
              <li key={session.id} className="flex items-baseline justify-between gap-3 text-[11.5px]">
                <span className="text-[var(--color-ink-3)]">
                  {relativeTime(session.started_at)}
                  {session.end_reason === "idle" && (
                    <span
                      className="ml-1.5"
                      title="Ended automatically — the tab went quiet, so idle time was trimmed"
                      style={{ color: "var(--color-ink-3)" }}
                    >
                      · trimmed
                    </span>
                  )}
                </span>
                <span className="tabular shrink-0 font-medium">
                  {session.ended_at
                    ? humanDuration(session.duration_seconds)
                    : liveClock
                      ? stopwatch(secondsSince(session.started_at))
                      : "running"}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
