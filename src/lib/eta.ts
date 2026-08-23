import type { Ticket, TicketStatus } from "./types";

/**
 * "When will this actually land?"
 *
 * Every brief carries two dates and they answer different questions. `due_at`
 * is the promise the strategist made when they raised it, and it doesn't move.
 * `eta_at` is the designer's current honest read, and it moves as often as
 * reality does. Reading them as one number is how a studio ends up telling a
 * client Thursday on a Monday job.
 *
 * Everything here is pure so it can be checked without a browser or a
 * database — the states, the wording, and the presets behind the quick picks.
 */

/** Work that has left the designer's hands. An estimate on it means nothing. */
const SETTLED: TicketStatus[] = ["ready_for_approval", "approved", "sent_to_client"];

export type EtaState =
  /** Nobody has asked and nobody has said. The ordinary case. */
  | "none"
  /** Somebody asked; the designer hasn't answered yet. */
  | "waiting"
  /** An estimate that beats the promise. */
  | "ontime"
  /** An estimate that misses the promise — the thing worth knowing early. */
  | "late"
  /** The estimate itself has now passed and the work is still in hand. */
  | "missed"
  /** Out of the designer's hands; the estimate is history. */
  | "settled";

// Awaiting assets and on hold are deliberately NOT settled. Blocked work is
// exactly where a strategist most wants a date, and an estimate that quietly
// passes while a ticket sits on hold is the one worth flagging loudest.

export const ETA_STATES: Record<
  EtaState,
  { label: string; tone: string; quiet: boolean }
> = {
  none: { label: "No estimate", tone: "var(--color-ink-3)", quiet: true },
  waiting: { label: "Estimate asked for", tone: "var(--color-serious)", quiet: false },
  ontime: { label: "On track", tone: "var(--color-good)", quiet: true },
  late: { label: "Past the due date", tone: "var(--color-serious)", quiet: false },
  missed: { label: "Estimate has passed", tone: "var(--color-critical)", quiet: false },
  settled: { label: "Handed over", tone: "var(--color-ink-3)", quiet: true },
};

export type EtaTicket = Pick<
  Ticket,
  "status" | "due_at" | "eta_at" | "eta_requested_at"
>;

/**
 * Pass `now = 0` to get the answer that doesn't depend on the clock.
 *
 * The server renders before the browser does, and "the estimate has passed"
 * is true at one instant and false a moment earlier — which shows up as a
 * hydration mismatch, and worse, as a button that appears and vanishes. With
 * a zero clock nothing has passed yet, so the server and the browser's first
 * paint agree; the component then re-reads the real clock after mount.
 */
export function etaState(ticket: EtaTicket, now: number = Date.now()): EtaState {
  if (SETTLED.includes(ticket.status)) return "settled";
  if (!ticket.eta_at) return ticket.eta_requested_at ? "waiting" : "none";

  const eta = new Date(ticket.eta_at).getTime();
  // A date that has come and gone while the work is still in progress is the
  // loudest of these: it means the last answer is now known to be wrong.
  if (eta < now) return "missed";

  if (ticket.due_at && daysLate(ticket.due_at, ticket.eta_at) > 0) return "late";
  return "ontime";
}

/**
 * Whole days the estimate misses the promise by, judged on calendar days.
 *
 * An 11pm estimate on the due date is the same day, not a day over — counting
 * in hours would flag it and cost the warning its meaning.
 */
export function daysLate(dueAt: string | null, etaAt: string | null): number {
  if (!dueAt || !etaAt) return 0;
  const due = new Date(dueAt);
  const eta = new Date(etaAt);
  const dueDay = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
  const etaDay = Date.UTC(eta.getFullYear(), eta.getMonth(), eta.getDate());
  return Math.max(0, Math.round((etaDay - dueDay) / 86_400_000));
}

/** "Thu 4pm", "today 6pm", "tomorrow 11am" — how people actually say it. */
export function etaLabel(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "No estimate";
  const date = new Date(iso);

  const day = (value: Date) =>
    Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  const days = Math.round((day(date) - day(now)) / 86_400_000);

  const time = date
    .toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    .replace(":00", "")
    .replace(/\s/g, "")
    .toLowerCase();

  if (days === 0) return `today ${time}`;
  if (days === 1) return `tomorrow ${time}`;
  if (days === -1) return `yesterday ${time}`;
  if (days > 1 && days < 7) {
    return `${date.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
  }
  return `${date.toLocaleDateString(undefined, { day: "numeric", month: "short" })} ${time}`;
}

/**
 * The quick picks.
 *
 * Almost every honest answer is one of these, and a designer who has to
 * operate a date picker to say "end of tomorrow" will mostly not bother.
 * `endOfDay` is 6pm rather than midnight because that's when the studio's day
 * actually ends and "by end of Thursday" has to mean something checkable.
 */
export const END_OF_DAY_HOUR = 18;

export interface EtaPreset {
  key: string;
  label: string;
  at: (now: Date) => Date;
}

function atHour(base: Date, addDays: number, hour: number): Date {
  const date = new Date(base);
  date.setDate(date.getDate() + addDays);
  date.setHours(hour, 0, 0, 0);
  return date;
}

export const ETA_PRESETS: EtaPreset[] = [
  { key: "eod", label: "End of today", at: (now) => atHour(now, 0, END_OF_DAY_HOUR) },
  { key: "tomorrow", label: "End of tomorrow", at: (now) => atHour(now, 1, END_OF_DAY_HOUR) },
  { key: "two", label: "In two days", at: (now) => atHour(now, 2, END_OF_DAY_HOUR) },
  { key: "week", label: "End of the week", at: endOfWeek },
];

/**
 * Friday evening. On a Friday or a Saturday that means *next* Friday — "end of
 * the week" offered on Friday afternoon has to mean something further away
 * than four hours, or it isn't a choice.
 */
export function endOfWeek(now: Date): Date {
  const day = now.getDay(); // 0 Sun … 5 Fri, 6 Sat
  let ahead = 5 - day;
  if (ahead <= 0) ahead += 7;
  return atHour(now, ahead, END_OF_DAY_HOUR);
}

/** The value a `datetime-local` input wants: "2026-09-12T16:00". */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** And back. Returns null for a cleared or unparseable field. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * How the change reads once it's made — the line the strategist sees in the
 * history, and the one thing they'd want to know at a glance.
 */
export function moveLabel(previous: string | null, next: string | null): string {
  if (!next) return "Estimate withdrawn";
  if (!previous) return "First estimate";
  const before = new Date(previous).getTime();
  const after = new Date(next).getTime();
  if (after === before) return "Unchanged";

  const days = Math.round(Math.abs(after - before) / 86_400_000);
  const unit = days === 0 ? "same day" : `${days} day${days === 1 ? "" : "s"}`;
  return after > before ? `Pushed back ${unit}` : `Pulled in ${unit}`;
}
