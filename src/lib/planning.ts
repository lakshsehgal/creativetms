import type {
  CreativeFormat,
  FormatBenchmark,
  Profile,
  TicketStatus,
  TicketWithRefs,
} from "@/lib/types";
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

/**
 * The same, minus whatever is blocked out — a shoot, leave, a public holiday.
 *
 * Some designers are videographers, and a day on set is a day gone. Before
 * this the grid showed them with a full eight hours while they were standing
 * in a warehouse, which is exactly the kind of confident wrong number that
 * gets a brief promised for Thursday.
 */
export function availableCapacity(
  fullDayMinutes: number,
  day: string,
  blocked?: { minutes: number; whole_day: boolean } | null,
): number {
  const base = dayCapacity(fullDayMinutes, day);
  if (!blocked) return base;
  // A whole-day block takes the whole day, whatever it was worth — including
  // a half-day Saturday.
  if (blocked.whole_day) return 0;
  return Math.max(0, base - blocked.minutes);
}

/** Index the rolled-up blocks by "designer|day" for O(1) lookup in a grid. */
export function blockIndex(
  rows: { designer_id: string; day: string; minutes: number; whole_day: boolean }[],
): Map<string, { minutes: number; whole_day: boolean }> {
  const map = new Map<string, { minutes: number; whole_day: boolean }>();
  rows.forEach((row) => {
    // Postgres hands dates back as yyyy-mm-dd, sometimes with a time on the end.
    map.set(`${row.designer_id}|${row.day.slice(0, 10)}`, {
      minutes: Number(row.minutes) || 0,
      whole_day: Boolean(row.whole_day),
    });
  });
  return map;
}

/** The local day a timestamp falls on. */
export function dayOf(iso: string): string {
  return isoDay(new Date(iso));
}

/* ------------------------------------------------------------------ *
 * Effort
 * ------------------------------------------------------------------ */

export type BenchmarkMap = Partial<Record<CreativeFormat, number | null>>;

export function benchmarkMap(rows: FormatBenchmark[]): BenchmarkMap {
  const map: BenchmarkMap = {};
  rows.forEach((row) => {
    map[row.format] = row.target_minutes_per_unit;
  });
  return map;
}

/**
 * What this ticket is expected to cost, in hands-on minutes.
 *
 * A per-ticket estimate wins if someone set one; otherwise it's the format
 * benchmark times the quantity. `null` means we genuinely don't know — UGC
 * ships with no benchmark until it's been measured, and a view that quietly
 * counted those as zero would show a fully-booked designer as free. Callers
 * must carry the unknowns through rather than defaulting them.
 */
export function estimateMinutes(
  ticket: Pick<TicketWithRefs, "estimated_minutes" | "format" | "quantity">,
  benchmarks: BenchmarkMap,
): number | null {
  if (ticket.estimated_minutes != null && ticket.estimated_minutes > 0) {
    return ticket.estimated_minutes;
  }
  const perUnit = benchmarks[ticket.format];
  if (perUnit == null || perUnit <= 0) return null;
  return perUnit * Math.max(1, ticket.quantity);
}

/**
 * Whether a ticket still owes a designer's hands.
 *
 * Sitting with the strategist or the client costs the studio calendar time
 * but no design time, so it must not show up as load. Parked work doesn't
 * either — that's the point of parking it.
 */
export function consumesCapacity(status: TicketStatus): boolean {
  return (
    status === "new_request" ||
    status === "in_progress" ||
    status === "size_changes" ||
    status === "needs_edit" ||
    status === "awaiting_assets"
  );
}

/* ------------------------------------------------------------------ *
 * Workload grid
 * ------------------------------------------------------------------ */

export type LoadState = "free" | "ok" | "tight" | "over";

export function loadState(minutes: number, capacity: number): LoadState {
  if (minutes <= 0) return "free";
  if (capacity <= 0) return "over";
  const ratio = minutes / capacity;
  if (ratio > 1) return "over";
  if (ratio >= 0.85) return "tight";
  return "ok";
}

export const LOAD_STATES: Record<
  LoadState,
  { label: string; tone: string; icon: string }
> = {
  free: { label: "Open", tone: "var(--color-ink-3)", icon: "" },
  ok: { label: "Comfortable", tone: "var(--color-series-1)", icon: "" },
  tight: { label: "At capacity", tone: "var(--color-warning)", icon: "●" },
  over: { label: "Over capacity", tone: "var(--color-critical)", icon: "▲" },
};

export interface WorkloadCell {
  day: string;
  /**
   * What this person can actually give on this day — 0 on a Sunday, half on a
   * Saturday, and less again for a shoot or a day off.
   */
  capacity: number;
  /** Estimated minutes we could actually put a number on. */
  minutes: number;
  /** Tickets whose format has no benchmark yet — counted, never silently zeroed. */
  unestimated: number;
  tickets: TicketWithRefs[];
}

export interface WorkloadRow {
  person: Profile;
  capacityMinutes: number;
  cells: WorkloadCell[];
  /** Committed work with no due date — real load with nowhere to sit. */
  undated: WorkloadCell;
  totalMinutes: number;
  totalUnestimated: number;
}

function emptyCell(day: string, capacity = 0): WorkloadCell {
  return { day, capacity, minutes: 0, unestimated: 0, tickets: [] };
}

/**
 * Which day a ticket's remaining effort is charged to.
 *
 * The honest simple model: work lands on the day it is due, because that is
 * the only date anyone has actually committed to. Anything already overdue
 * piles onto today, where it really is competing for hours. Spreading effort
 * across the days in between would invent a schedule nobody agreed to.
 */
export function chargeDay(
  ticket: Pick<TicketWithRefs, "due_at">,
  today: string,
): string | null {
  if (!ticket.due_at) return null;
  const day = dayOf(ticket.due_at);
  return day < today ? today : day;
}

export function buildWorkload({
  tickets,
  people,
  days,
  today,
  benchmarks,
  blocks,
}: {
  tickets: TicketWithRefs[];
  people: Profile[];
  days: string[];
  today: string;
  benchmarks: BenchmarkMap;
  /** Shoots and time off, keyed "designer|day". See blockIndex(). */
  blocks?: Map<string, { minutes: number; whole_day: boolean }>;
}): { rows: WorkloadRow[]; unassigned: WorkloadRow | null } {
  const index = new Map(days.map((day, position) => [day, position]));

  const make = (person: Profile): WorkloadRow => ({
    person,
    capacityMinutes: person.daily_capacity_minutes,
    cells: days.map((day) =>
      emptyCell(
        day,
        availableCapacity(
          person.daily_capacity_minutes,
          day,
          blocks?.get(`${person.id}|${day}`),
        ),
      ),
    ),
    undated: emptyCell("undated"),
    totalMinutes: 0,
    totalUnestimated: 0,
  });

  const rows = new Map(people.map((person) => [person.id, make(person)]));

  // A synthetic row so unassigned work is visible instead of vanishing. It
  // borrows a shape rather than a real profile, and has no capacity of its own.
  const unassignedPerson = {
    id: "unassigned",
    full_name: "Unassigned",
    email: "",
    role: "designer",
    avatar_url: null,
    is_active: true,
    daily_capacity_minutes: 0,
    timezone: "",
    created_at: "",
    break_started_at: null,
    break_ticket_id: null,
  } as Profile;
  const unassigned = make(unassignedPerson);

  tickets.forEach((ticket) => {
    if (!consumesCapacity(ticket.status)) return;

    const row = ticket.assigned_to ? rows.get(ticket.assigned_to) : unassigned;
    if (!row) return; // assigned to someone outside the roster (deactivated)

    const day = chargeDay(ticket, today);
    let cell: WorkloadCell | undefined;

    if (day == null) {
      cell = row.undated;
    } else {
      const position = index.get(day);
      // Due beyond the window: still real work, just not in this fortnight.
      if (position == null) return;
      cell = row.cells[position];
    }

    cell.tickets.push(ticket);
    const minutes = estimateMinutes(ticket, benchmarks);
    if (minutes == null) {
      cell.unestimated += 1;
      row.totalUnestimated += 1;
    } else {
      cell.minutes += minutes;
      row.totalMinutes += minutes;
    }
  });

  const hasWork = (row: WorkloadRow) =>
    row.totalMinutes > 0 || row.totalUnestimated > 0 || row.undated.tickets.length > 0;

  return {
    rows: [...rows.values()],
    unassigned: hasWork(unassigned) ? unassigned : null,
  };
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
