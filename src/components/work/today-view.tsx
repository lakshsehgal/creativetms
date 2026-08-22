"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CalendarCheck, CalendarPlus, Timer, X } from "lucide-react";
import type { Profile, TicketWithRefs } from "@/lib/types";
import { STATUSES, canSeeOwnTime } from "@/lib/types";
import { dueLabel, humanDuration, isoDay } from "@/lib/format";
import { Avatar, FormatBadge, StatusPill } from "@/components/ui/primitives";
import { Button } from "@/components/ui/form";

/**
 * What the floor is doing today.
 *
 * This is the answer to "what are you working on?" that a strategist would
 * otherwise have to ask on Slack. Designers put tickets on today's list — or
 * simply start one, which pledges it automatically — and everyone can see the
 * day's shape without interrupting anybody.
 */
export function TodayView({
  tickets,
  viewer,
  designers,
  onPatch,
}: {
  tickets: TicketWithRefs[];
  viewer: Profile;
  designers: Profile[];
  onPatch: (ticket: TicketWithRefs, fields: Record<string, unknown>) => void;
}) {
  const today = isoDay();

  const planned = useMemo(
    () => tickets.filter((ticket) => ticket.planned_for === today),
    [tickets, today],
  );

  const byDesigner = useMemo(() => {
    const map = new Map<string, TicketWithRefs[]>();
    planned.forEach((ticket) => {
      const key = ticket.assigned_to ?? "unassigned";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ticket);
    });
    return map;
  }, [planned]);

  // A designer's own shortlist: assigned to them, still open, not yet pledged.
  const addable = useMemo(
    () =>
      viewer.role !== "designer"
        ? []
        : tickets.filter(
            (ticket) =>
              ticket.assigned_to === viewer.id &&
              ticket.planned_for !== today &&
              ticket.status !== "approved",
          ),
    [tickets, viewer, today],
  );

  const roster =
    viewer.role === "designer"
      ? designers.filter((person) => person.id === viewer.id)
      : designers;

  return (
    <div className="mx-auto max-w-5xl px-5 py-5">
      <div className="mb-4 flex items-center gap-2">
        <CalendarCheck size={15} className="text-[var(--color-accent)]" />
        <h2 className="text-[14px] font-semibold tracking-tight">
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </h2>
        <span className="text-[12px] text-[var(--color-ink-3)]">
          {planned.length} ticket{planned.length === 1 ? "" : "s"} picked up
        </span>
      </div>

      {viewer.role === "designer" && addable.length > 0 && (
        <section className="mb-5 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-line-strong)] p-3">
          <p className="mb-2 text-[12px] font-medium">Add to today</p>
          <ul className="flex flex-wrap gap-1.5">
            {addable.slice(0, 12).map((ticket) => (
              <li key={ticket.id}>
                <button
                  onClick={() => onPatch(ticket, { planned_for: today })}
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1 text-[12px] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                >
                  <CalendarPlus size={11} />
                  {ticket.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {planned.length === 0 ? (
        <p className="py-14 text-center text-[13px] text-[var(--color-ink-3)]">
          Nobody has picked anything up yet today. Starting a ticket adds it here
          automatically.
        </p>
      ) : (
        <div className="space-y-4">
          {roster.map((person) => {
            const rows = byDesigner.get(person.id) ?? [];
            if (rows.length === 0) return null;

            const tracked = rows.reduce((sum, row) => sum + (row.total_seconds ?? 0), 0);
            const live = rows.find((row) => row.status === "in_progress");

            return (
              <section
                key={person.id}
                className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)]"
              >
                <header className="flex items-center gap-2.5 border-b border-[var(--color-line)] px-4 py-2.5">
                  <Avatar
                    id={person.id}
                    name={person.full_name}
                    email={person.email}
                    size={26}
                  />
                  <span className="text-[13px] font-medium">
                    {person.full_name || person.email}
                  </span>
                  <span className="text-[11.5px] text-[var(--color-ink-3)]">
                    {rows.length} on the list
                  </span>
                  {live && (
                    <span
                      className="ml-auto flex items-center gap-1.5 text-[11.5px] font-medium"
                      style={{ color: "var(--color-accent)" }}
                    >
                      <span
                        className="breathe h-1.5 w-1.5 rounded-full"
                        style={{ background: "var(--color-accent)" }}
                      />
                      on “{live.title}”
                    </span>
                  )}
                  {tracked > 0 && canSeeOwnTime(viewer.role) && (
                    <span className="tabular ml-2 flex items-center gap-1 text-[11.5px] text-[var(--color-ink-3)]">
                      <Timer size={11} />
                      {humanDuration(tracked)}
                    </span>
                  )}
                </header>

                <ul>
                  {rows.map((ticket) => (
                    <li
                      key={ticket.id}
                      className="flex items-center gap-3 border-b border-[var(--color-line)] px-4 py-2 last:border-0 hover:bg-[var(--color-surface-2)]"
                    >
                      <FormatBadge format={ticket.format} quantity={ticket.quantity} />
                      <Link
                        href={`/tickets/${ticket.id}`}
                        className="min-w-0 flex-1 truncate text-[12.5px] hover:text-[var(--color-accent)]"
                      >
                        {ticket.title}
                      </Link>
                      {ticket.brand && (
                        <span className="hidden shrink-0 text-[11.5px] text-[var(--color-ink-3)] sm:block">
                          {ticket.brand.name}
                        </span>
                      )}
                      <StatusPill status={ticket.status} />
                      {ticket.due_at && (
                        <span
                          suppressHydrationWarning
                          className="shrink-0 text-[11px] text-[var(--color-ink-3)]"
                        >
                          {dueLabel(ticket.due_at)}
                        </span>
                      )}
                      {ticket.assigned_to === viewer.id && (
                        <button
                          onClick={() => onPatch(ticket, { planned_for: null })}
                          title="Take off today's list"
                          aria-label={`Remove ${ticket.title} from today`}
                          className="shrink-0 text-[var(--color-ink-3)] transition-colors hover:text-[var(--color-critical)]"
                        >
                          <X size={13} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          {(byDesigner.get("unassigned")?.length ?? 0) > 0 && (
            <p className="text-[12px] text-[var(--color-ink-3)]">
              {byDesigner.get("unassigned")!.length} pledged ticket(s) have no designer.
            </p>
          )}
        </div>
      )}

      <p className="mt-6 text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">
        A ticket lands here when a designer adds it or starts working on it.{" "}
        {STATUSES.in_progress.label} is the only status where the clock runs, so
        the timings above are hands-on minutes, not elapsed time.
      </p>
    </div>
  );
}
