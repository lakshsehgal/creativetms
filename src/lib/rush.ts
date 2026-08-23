/**
 * The noon rule, judged the same way the database judges it.
 *
 * `enforce_due_date_rule()` works in Asia/Kolkata — the studio's clock, not the
 * server's and not the viewer's. The form used to ask the browser instead
 * (`new Date().getHours() >= 12`), which agrees only as long as everyone is
 * sitting in India. A strategist on a call from London would have been offered
 * today's date at 9am their time and had the insert refused with a message
 * about midday, or worse, been refused a date that was perfectly legal.
 *
 * Everything here answers in the studio's clock so the form and the database
 * always reach the same verdict.
 */

export const STUDIO_TIME_ZONE = "Asia/Kolkata";

/** The date and hour it is in the studio right now, whoever is looking. */
export function studioNow(now: Date = new Date()): { day: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STUDIO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
  };
}

/** Which studio day a moment falls on — "2026-08-23". */
export function studioDay(when: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: STUDIO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(when);
}

/**
 * Is the studio past midday? Past this, a same-day brief needs somebody to
 * agree to it.
 */
export function pastNoonInStudio(now: Date = new Date()): boolean {
  return studioNow(now).hour >= 12;
}

/** Is this due date the studio's today? */
export function isStudioToday(due: Date, now: Date = new Date()): boolean {
  return studioDay(due) === studioNow(now).day;
}

/**
 * Whether a brief needs an approval before it can exist.
 *
 * The three conditions the database checks, in the same order and the same
 * clock: there is a date, it is today, and it is already the afternoon.
 */
export function needsRushApproval(dueAt: string, now: Date = new Date()): boolean {
  if (!dueAt) return false;
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return false;
  return pastNoonInStudio(now) && isStudioToday(due, now);
}

/**
 * How long a reason has to be. Matches the database, which refuses anything
 * shorter — a rush with "asap" against it tells an approver nothing.
 */
export const MIN_RUSH_REASON = 10;

export function rushReasonOk(reason: string): boolean {
  return reason.trim().length >= MIN_RUSH_REASON;
}
