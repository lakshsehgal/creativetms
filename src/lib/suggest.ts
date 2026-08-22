import type { TicketWithRefs } from "@/lib/types";
import { PRIORITIES } from "@/lib/types";
import { estimateMinutes, type BenchmarkMap } from "@/lib/planning";

/**
 * What to pick up next.
 *
 * A designer opening the tool at 10am has twelve things assigned and has to
 * work out which four are today's. That judgement is real work, it happens
 * every morning, and getting it wrong is how a brief goes late while
 * something due Friday gets finished on Tuesday.
 *
 * This ranks the list. It does not choose — nothing here writes anything, and
 * the designer can ignore the order entirely. It is a suggestion with its
 * reasoning shown, which is the difference between a tool that helps and one
 * that tells people what to do.
 *
 * The score is deliberately simple arithmetic rather than anything clever:
 * a designer who disagrees with a suggestion should be able to see exactly
 * why it was made.
 */

export interface Suggestion {
  ticket: TicketWithRefs;
  score: number;
  /** The single strongest reason, in words. Never a bare number. */
  reason: string;
  /** Estimated cost, when the format has a benchmark. */
  minutes: number | null;
  /** True once the running total has passed what's left of the day. */
  beyondCapacity: boolean;
}

/** Whole days from today until the due date. Negative means overdue. */
export function daysUntilDue(due: string | null, now: number): number | null {
  if (!due) return null;
  const dueDate = new Date(due);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const dueStart = new Date(dueDate);
  dueStart.setHours(0, 0, 0, 0);
  return Math.round((dueStart.getTime() - start.getTime()) / 86_400_000);
}

/**
 * How loudly the calendar is asking for this one.
 *
 * Overdue outranks everything, and the longer it has been late the louder,
 * but it flattens after a fortnight — something three weeks late and
 * something four weeks late are the same kind of problem, and letting the
 * number keep climbing would bury genuinely urgent new work underneath one
 * forgotten ticket.
 */
function dueScore(days: number | null): number {
  if (days == null) return 0;
  if (days < 0) return 100 + Math.min(-days, 14) * 4;
  if (days === 0) return 90;
  if (days === 1) return 60;
  if (days === 2) return 40;
  if (days <= 4) return 25;
  return 10;
}

const PRIORITY_SCORE: Record<string, number> = {
  urgent: 40,
  high: 25,
  normal: 5,
  low: 0,
};

/**
 * Whose turn it is.
 *
 * Work that came back with notes has somebody waiting on the other end of it,
 * so it outranks work nobody has started.
 *
 * Blocked and parked work is out of the running entirely, not merely
 * penalised. A soft penalty put a ticket that's blocked on assets and due
 * today above a workable ticket due next week, which is a suggestion nobody
 * can act on — the honest answer is that this list is "what to work on", and
 * neither of those is workable. They stay visible in the assigned list, where
 * their status says what's actually needed.
 */
const STATUS_SCORE: Record<string, number> = {
  needs_edit: 30,
  size_changes: 20,
  in_progress: 25,
  new_request: 10,
  awaiting_assets: Number.NEGATIVE_INFINITY,
  on_hold: Number.NEGATIVE_INFINITY,
};

function reasonFor(ticket: TicketWithRefs, days: number | null): string {
  if (days != null && days < 0) {
    const late = -days;
    return late === 1 ? "A day late" : `${late} days late`;
  }
  if (ticket.status === "needs_edit") return "Came back with notes";
  if (days === 0) return "Due today";
  if (ticket.priority === "urgent") return "Marked urgent";
  if (days === 1) return "Due tomorrow";
  if (ticket.status === "size_changes") return "Resizes waiting";
  if (ticket.priority === "high") return "High priority";
  if (days != null && days <= 4) return `Due in ${days} days`;
  return "Ready to pick up";
}

export function scoreTicket(ticket: TicketWithRefs, now: number): number {
  const status = STATUS_SCORE[ticket.status];
  if (status === Number.NEGATIVE_INFINITY) return Number.NEGATIVE_INFINITY;

  return (
    dueScore(daysUntilDue(ticket.due_at, now)) +
    (PRIORITY_SCORE[ticket.priority] ?? PRIORITIES[ticket.priority]?.rank ?? 0) +
    (status ?? 0)
  );
}

/**
 * Rank what this designer could pick up today.
 *
 * `capacityMinutes` is what's left of their day. Suggestions past that point
 * are still listed — a designer may well know something is quicker than the
 * benchmark says — but they're marked, so "your day is full" is visible
 * rather than something you discover at six o'clock.
 */
export function suggestForToday({
  tickets,
  today,
  now = Date.now(),
  benchmarks = {},
  capacityMinutes = null,
  limit = 5,
}: {
  tickets: TicketWithRefs[];
  today: string;
  now?: number;
  benchmarks?: BenchmarkMap;
  capacityMinutes?: number | null;
  limit?: number;
}): Suggestion[] {
  const candidates = tickets
    .filter((ticket) => {
      // Already on today's list — it doesn't need suggesting.
      if (ticket.planned_for === today) return false;
      // Nothing to do: signed off, with the strategist, or out with the client.
      if (
        ticket.status === "approved" ||
        ticket.status === "ready_for_approval" ||
        ticket.status === "sent_to_client"
      ) {
        return false;
      }
      return Number.isFinite(scoreTicket(ticket, now));
    })
    .map((ticket) => ({
      ticket,
      score: scoreTicket(ticket, now),
      minutes: estimateMinutes(ticket, benchmarks),
      reason: reasonFor(ticket, daysUntilDue(ticket.due_at, now)),
      beyondCapacity: false,
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        // A tie on score is broken by the nearer deadline, then by the older
        // brief — the one that has been waiting longest.
        (a.ticket.due_at ?? "9999").localeCompare(b.ticket.due_at ?? "9999") ||
        a.ticket.created_at.localeCompare(b.ticket.created_at),
    )
    .slice(0, limit);

  if (capacityMinutes != null) {
    let running = 0;
    candidates.forEach((suggestion) => {
      // An unestimated ticket can't push the total, but it can't prove the
      // day is free either — once we're over, everything after stays over.
      running += suggestion.minutes ?? 0;
      // A day with nothing left in it makes every suggestion an overflow,
      // including one we can't size. Bailing out at zero was worse: the
      // fullest days were the ones that showed no warning at all.
      suggestion.beyondCapacity = capacityMinutes <= 0 || running > capacityMinutes;
    });
  }

  return candidates;
}
