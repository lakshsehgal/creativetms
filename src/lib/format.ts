import type { CreativeFormat, Ticket } from "@/lib/types";

/** "1h 42m" — the shape people actually read on a card. */
export function humanDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds < 0) return "—";
  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;
  const mins = Math.floor(total / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** "01:42:07" — for a clock that's ticking in front of you. */
export function stopwatch(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export function minutesToHuman(minutes: number | null | undefined): string {
  return humanDuration(minutes == null ? null : minutes * 60);
}

export function initials(name: string, email?: string): string {
  const source = name?.trim() || email?.split("@")[0] || "?";
  const parts = source.replace(/[^\p{L}\s.]/gu, " ").split(/[\s.]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Deterministic avatar tint so a person keeps one colour everywhere. */
export function avatarTint(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const slots = [
    "var(--color-series-1)",
    "var(--color-series-2)",
    "var(--color-series-3)",
    "var(--color-series-5)",
    "var(--color-series-6)",
  ];
  return slots[hash % slots.length];
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (Math.abs(mins) < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export type DueState = "none" | "ok" | "soon" | "today" | "overdue";

export function dueState(ticket: Pick<Ticket, "due_at" | "status">): DueState {
  if (!ticket.due_at) return "none";
  if (ticket.status === "approved" || ticket.status === "sent_to_client") return "ok";
  const ms = new Date(ticket.due_at).getTime() - Date.now();
  if (ms < 0) return "overdue";
  if (ms < 12 * 3600_000) return "today";
  if (ms < 48 * 3600_000) return "soon";
  return "ok";
}

export function dueLabel(iso: string | null): string {
  if (!iso) return "No date";
  const date = new Date(iso);
  const days = Math.round((date.getTime() - Date.now()) / 86_400_000);
  if (days < -1) return `${Math.abs(days)}d late`;
  if (days === -1 || (days === 0 && date.getTime() < Date.now())) return "Overdue";
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days < 7) return `Due in ${days}d`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function isoDay(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export function dayLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - date.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/**
 * Minutes per unit — the headline productivity number. Divides by quantity so
 * a ticket for five statics is comparable with a ticket for one.
 */
export function secondsPerUnit(totalSeconds: number, quantity: number): number {
  return quantity > 0 ? Math.round(totalSeconds / quantity) : totalSeconds;
}

/**
 * How a designer tracked against the benchmark. Below 100 means faster than
 * the bar. Returned as a plain ratio so callers choose their own wording.
 */
export function paceRatio(
  actualSecondsPerUnit: number,
  benchmarkMinutes: number,
): number | null {
  if (!benchmarkMinutes || !actualSecondsPerUnit) return null;
  return Math.round((actualSecondsPerUnit / (benchmarkMinutes * 60)) * 100);
}

export function formatCount(units: Partial<Record<CreativeFormat, number>>): number {
  return Object.values(units).reduce<number>((sum, n) => sum + (n ?? 0), 0);
}

export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/**
 * What to call somebody in a space too small for their full name.
 *
 * Falls back to the part of the email before the @, because a profile with no
 * name filled in should still say who somebody is rather than nothing at all.
 */
export function shortName(person: { full_name?: string | null; email?: string | null } | null | undefined): string {
  const full = person?.full_name?.trim();
  if (full) return full.split(/\s+/)[0];
  const email = person?.email?.trim();
  if (email) return email.split("@")[0];
  return "Someone";
}
