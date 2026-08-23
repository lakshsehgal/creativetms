import type { Brand, Profile, TicketWithRefs } from "./types";
import {
  FORMATS,
  FORMAT_ORDER,
  PRIORITIES,
  STATUSES,
  STATUS_ORDER,
  type TicketPriority,
} from "./types";
import { avatarTint } from "./format";
import { studioDay } from "./rush";

/**
 * How the tickets are stacked.
 *
 * Status is the default and always will be — it's the shape of the work, and
 * it's the only grouping you can drag a card between, because moving a card
 * from one status to another IS the workflow. The others answer questions the
 * status lanes can't: what does this client have on, what has this designer
 * got, what's late.
 *
 * Everything here is pure, so the arrangement can be checked without a browser
 * and both views can share one answer instead of each having their own.
 */

export type GroupKey = "status" | "brand" | "designer" | "priority" | "format" | "due";

export const GROUPINGS: { key: GroupKey; label: string; hint: string }[] = [
  { key: "status", label: "Status", hint: "The workflow. The only one you can drag between." },
  { key: "brand", label: "Brand", hint: "What each client has on right now" },
  { key: "designer", label: "Designer", hint: "Who is carrying what" },
  { key: "priority", label: "Priority", hint: "What was marked urgent, and by how much" },
  { key: "format", label: "Format", hint: "Statics against films against carousels" },
  { key: "due", label: "Due", hint: "What's late, what's today, what can wait" },
];

export interface Group {
  /** Stable within a grouping — used as the React key and the drop target id. */
  id: string;
  label: string;
  /** The rail colour. Every grouping has one so the eye can navigate by it. */
  tone: string;
  hint?: string;
  tickets: TicketWithRefs[];
}

export interface GroupContext {
  designers: Profile[];
  brands: Brand[];
  /**
   * The moment to read due dates against. Passed in rather than read from the
   * clock so the arrangement is a pure function of its inputs — and so a test
   * can stand at any hour of any day.
   */
  now: Date;
}

/**
 * Only status keeps its empty lanes.
 *
 * An empty In Review column is information — it says nothing is waiting on the
 * strategist — and on the board it's a drop target you need. An empty column
 * for a brand nobody has work for is just a column, and twenty of them turn a
 * board into a spreadsheet of nothing.
 */
export function groupTickets(
  tickets: TicketWithRefs[],
  key: GroupKey,
  context: GroupContext,
): Group[] {
  if (key === "status") {
    return STATUS_ORDER.map((status) => ({
      id: status,
      label: STATUSES[status].label,
      tone: STATUSES[status].fill,
      hint: STATUSES[status].hint,
      tickets: tickets.filter((ticket) => ticket.status === status),
    }));
  }

  if (key === "brand") {
    return withoutEmpties([
      ...context.brands.map((brand) => ({
        id: brand.id,
        label: brand.name,
        tone: brand.color,
        tickets: tickets.filter((ticket) => ticket.brand_id === brand.id),
      })),
      {
        id: "none",
        label: "No brand",
        tone: "var(--color-ink-3)",
        tickets: tickets.filter((ticket) => !ticket.brand_id),
      },
    ]);
  }

  if (key === "designer") {
    return withoutEmpties([
      // Unassigned first: it's the backlog, and it's the column people are
      // actually looking for when they group this way.
      {
        id: "none",
        label: "Unassigned",
        tone: "var(--color-ink-3)",
        hint: "Nobody has picked these up",
        tickets: tickets.filter((ticket) => !ticket.assigned_to),
      },
      ...context.designers.map((person) => ({
        id: person.id,
        label: person.full_name || person.email,
        tone: avatarTint(person.id),
        tickets: tickets.filter((ticket) => ticket.assigned_to === person.id),
      })),
    ]);
  }

  if (key === "priority") {
    // Loudest first — the opposite of the enum's own order.
    const order = (Object.keys(PRIORITIES) as TicketPriority[]).sort(
      (a, b) => PRIORITIES[b].rank - PRIORITIES[a].rank,
    );
    return withoutEmpties(
      order.map((priority) => ({
        id: priority,
        label: PRIORITIES[priority].label,
        tone: PRIORITIES[priority].tone,
        tickets: tickets.filter((ticket) => ticket.priority === priority),
      })),
    );
  }

  if (key === "format") {
    return withoutEmpties(
      FORMAT_ORDER.map((format) => ({
        id: format,
        label: FORMATS[format].label,
        tone: FORMATS[format].series,
        tickets: tickets.filter((ticket) => ticket.format === format),
      })),
    );
  }

  return groupByDue(tickets, context.now);
}

/**
 * Late, today, this week, later, undated — in the order somebody worried about
 * delivery reads them.
 *
 * A deadline in this tool carries a time of day, not just a date, so "late" is
 * read against the clock and not the calendar: a ticket promised for 10am is
 * late at half past ten, and the card already says so. If this bucketed by
 * whole days it would file that card under Today, and a lane that disagrees
 * with the card inside it is worse than no lane at all.
 *
 * Work already handed over doesn't sit in any of the time lanes. It isn't
 * late, it isn't waiting, and an Overdue lane full of approved creative is a
 * lane people learn to stop reading — so it gets its own, at the end.
 */
function groupByDue(tickets: TicketWithRefs[], now: Date): Group[] {
  const today = studioDay(now);
  const week = addDays(today, 7);
  const nowMs = now.getTime();
  const done = new Set(["approved", "sent_to_client"]);

  const bucket = (ticket: TicketWithRefs): string => {
    if (done.has(ticket.status)) return "done";
    if (!ticket.due_at) return "none";
    const at = new Date(ticket.due_at);
    if (at.getTime() < nowMs) return "overdue";
    const day = studioDay(at);
    if (day === today) return "today";
    return day <= week ? "week" : "later";
  };

  const lanes: { id: string; label: string; tone: string; hint?: string }[] = [
    { id: "overdue", label: "Overdue", tone: "var(--color-critical)", hint: "Past its promised time and not delivered" },
    { id: "today", label: "Today", tone: "var(--color-serious)", hint: "Still to land before the day is out" },
    { id: "week", label: "This week", tone: "var(--color-warning)" },
    { id: "later", label: "Later", tone: "var(--color-ink-2)" },
    { id: "none", label: "No date", tone: "var(--color-ink-3)", hint: "Nobody has promised these" },
    { id: "done", label: "Delivered", tone: "var(--color-good)", hint: "Approved or sent — no longer waiting on anyone" },
  ];

  return withoutEmpties(
    lanes.map((lane) => ({
      ...lane,
      tickets: tickets.filter((ticket) => bucket(ticket) === lane.id),
    })),
  );
}

function withoutEmpties(groups: Group[]): Group[] {
  return groups.filter((group) => group.tickets.length > 0);
}

/** "2026-08-23" plus n days, without dragging in a date library. */
function addDays(day: string, n: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

/**
 * Dragging a card only means something when the lanes are the workflow.
 *
 * Between two statuses it's "this has moved on". Between two designers it
 * would be a reassignment, between two brands a re-filing — real actions, but
 * ones somebody should choose on the ticket rather than nudge with a mouse.
 */
export function isDraggable(key: GroupKey): key is "status" {
  return key === "status";
}
