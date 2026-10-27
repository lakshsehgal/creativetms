"use client";

import { Timer } from "lucide-react";
import type {
  TicketWithRefs,
  UserRole,
  WorkPhase,
  WorkSession,
} from "@/lib/types";
import { formatMeta, PHASE_ORDER, canSeeLiveTimer, phaseMeta } from "@/lib/types";
import { humanDuration, stopwatch } from "@/lib/format";
import { secondsSince, useTicking } from "@/hooks/use-ticking";
import { Stamp } from "@/components/ui/stamp";

/**
 * The time story for one ticket.
 *
 * What the work took, and where the time went. There is no bar it is held
 * against: the figure is a record for the admin and the operator, not a
 * verdict.
 */
export function TimePanel({
  ticket,
  sessions,
  canSeeDetail,
  viewerRole,
}: {
  ticket: TicketWithRefs;
  sessions: WorkSession[];
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
                  <Stamp at={session.started_at} />
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
