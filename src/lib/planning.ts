import type { TicketWithRefs } from "@/lib/types";
import { STATUSES } from "@/lib/types";
import { isoDay } from "@/lib/format";

/* ------------------------------------------------------------------ *
 * Day arithmetic
 *
 * Everything here works in local time and in `yyyy-mm-dd` strings, which
 * sort correctly as text and compare with `<`. Dates are only constructed
 * to do the month/year rollover.
 * ------------------------------------------------------------------ */

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return isoDay(new Date(y, m - 1, d + n));
}

export function dayRange(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => addDays(start, index));
}

/** Monday of the week `day` falls in — the timeline starts on a week boundary. */
export function startOfWeek(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  // getDay(): 0 = Sunday. Shift so Monday is the first column.
  const offset = (date.getDay() + 6) % 7;
  return addDays(day, -offset);
}

export function isWeekend(day: string): boolean {
  const shape = dayShape(day);
  return shape !== "full";
}

/**
 * The studio week.
 *
 * Monday to Friday are full days, Saturday is a half day, and Sunday is off.
 * Treating all seven as full — which the first version of this grid did —
 * quietly understated how loaded a Friday–Saturday run really was, and showed
 * Sunday as if it had eight free hours in it.
 */
export type DayShape = "full" | "half" | "off";

export const SATURDAY_FRACTION = 0.5;

export function dayShape(day: string): DayShape {
  const [y, m, d] = day.split("-").map(Number);
  const weekday = new Date(y, m - 1, d).getDay();
  if (weekday === 0) return "off";
  if (weekday === 6) return "half";
  return "full";
}

/** What one person can actually give on one day, before anything is booked out. */
export function dayCapacity(fullDayMinutes: number, day: string): number {
  const shape = dayShape(day);
  if (shape === "off") return 0;
  if (shape === "half") return Math.round(fullDayMinutes * SATURDAY_FRACTION);
  return fullDayMinutes;
}

/** The local day a timestamp falls on. */
export function dayOf(iso: string): string {
  return isoDay(new Date(iso));
}

/* ------------------------------------------------------------------ *
 * Timeline
 * ------------------------------------------------------------------ */

/**
 * Schedule risk, which is what a timeline is actually read for.
 *
 * Deliberately four states rather than nine: colouring bars by workflow
 * status would put nine hues on one chart, and several of them collapse into
 * each other for a red-green colourblind reader (Approved against Sent to
 * Client are hard to separate even with full colour vision). Status is still
 * on every row — as a labelled pill — where it reads as text, not as a hue.
 */
export type Risk = "done" | "overdue" | "soon" | "ontrack" | "parked";

export const RISKS: Record<
  Risk,
  { label: string; tone: string; icon: string; muted: boolean }
> = {
  ontrack: { label: "On track", tone: "var(--color-series-1)", icon: "", muted: false },
  soon: { label: "Due within 48h", tone: "var(--color-warning)", icon: "\u25cf", muted: false },
  overdue: { label: "Overdue", tone: "var(--color-critical)", icon: "\u25b2", muted: false },
  done: {
    label: "Signed off / with client",
    tone: "var(--color-good)",
    icon: "\u2713",
    muted: true,
  },
  // Parked on purpose. It still occupies the calendar, but it isn't competing
  // for anyone's Thursday, so it must not read as loudly as live work.
  parked: { label: "On hold", tone: "var(--color-ink-3)", icon: "\u2016", muted: true },
};

export const RISK_ORDER: Risk[] = ["overdue", "soon", "ontrack", "parked", "done"];

export function riskOf(ticket: TicketWithRefs, now: number = Date.now()): Risk {
  if (ticket.status === "approved" || ticket.status === "sent_to_client") return "done";
  if (ticket.status === "on_hold") return "parked";
  if (!ticket.due_at) return "ontrack";
  const due = new Date(ticket.due_at).getTime();
  if (due < now) return "overdue";
  if (due - now < 48 * 3600_000) return "soon";
  return "ontrack";
}

export interface TimelineBar {
  ticket: TicketWithRefs;
  risk: Risk;
  /** Column index of the first day drawn, within the window. */
  offset: number;
  /** How many day-columns the bar covers. Always at least 1. */
  span: number;
  /** True when the real start/end lies outside the window and was cut. */
  clippedStart: boolean;
  clippedEnd: boolean;
  /** No due date — drawn as a marker rather than a span. */
  open: boolean;
}

/**
 * Where a ticket's bar begins: when work actually started if it has, else
 * when the brief was raised. A brief nobody has touched still occupies the
 * calendar — that's exactly the thing worth seeing.
 */
export function barBounds(
  ticket: TicketWithRefs,
  today: string,
): { start: string; end: string; open: boolean } {
  const start = dayOf(ticket.started_at ?? ticket.created_at);
  if (!ticket.due_at) return { start, end: start, open: true };

  let end = dayOf(ticket.due_at);
  // Overdue and still live: the bar runs to today, because that's how long
  // it has actually been occupying someone's plate.
  const live =
    ticket.status !== "approved" &&
    ticket.status !== "sent_to_client" &&
    ticket.status !== "on_hold";
  if (live && end < today) end = today;
  if (end < start) end = start;
  return { start, end, open: false };
}

export function buildTimeline({
  tickets,
  days,
  today,
  now = Date.now(),
}: {
  tickets: TicketWithRefs[];
  days: string[];
  today: string;
  now?: number;
}): TimelineBar[] {
  if (days.length === 0) return [];
  const first = days[0];
  const last = days[days.length - 1];

  const bars: TimelineBar[] = [];

  tickets.forEach((ticket) => {
    const { start, end, open } = barBounds(ticket, today);
    // Entirely outside the window.
    if (end < first || start > last) return;

    const drawnStart = start < first ? first : start;
    const drawnEnd = end > last ? last : end;

    const offset = days.indexOf(drawnStart);
    const span = days.indexOf(drawnEnd) - offset + 1;
    if (offset < 0 || span < 1) return;

    bars.push({
      ticket,
      risk: riskOf(ticket, now),
      offset,
      span,
      clippedStart: start < first,
      clippedEnd: end > last,
      open,
    });
  });

  // Earliest first, then longest — so the eye reads down the calendar.
  return bars.sort((a, b) => a.offset - b.offset || b.span - a.span);
}

/** Groups timeline rows under a heading. Designer is the default question. */
export function groupBars(
  bars: TimelineBar[],
  by: "designer" | "brand" | "status",
): { key: string; label: string; bars: TimelineBar[] }[] {
  const groups = new Map<string, { key: string; label: string; bars: TimelineBar[] }>();

  bars.forEach((bar) => {
    let key: string;
    let label: string;

    if (by === "designer") {
      key = bar.ticket.assigned_to ?? "unassigned";
      label = bar.ticket.assignee?.full_name || bar.ticket.assignee?.email || "Unassigned";
    } else if (by === "brand") {
      key = bar.ticket.brand_id ?? "none";
      label = bar.ticket.brand?.name ?? "No brand";
    } else {
      key = bar.ticket.status;
      label = STATUSES[bar.ticket.status]?.label ?? bar.ticket.status;
    }

    if (!groups.has(key)) groups.set(key, { key, label, bars: [] });
    groups.get(key)!.bars.push(bar);
  });

  // Named groups first, alphabetically; the catch-all sinks to the bottom.
  return [...groups.values()].sort((a, b) => {
    const aCatch = a.key === "unassigned" || a.key === "none";
    const bCatch = b.key === "unassigned" || b.key === "none";
    if (aCatch !== bCatch) return aCatch ? 1 : -1;
    return a.label.localeCompare(b.label);
  });
}
