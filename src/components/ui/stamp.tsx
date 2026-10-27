"use client";

import { exactTime, fullTime, relativeTime } from "@/lib/format";

/**
 * When something happened, said twice: "23m ago · 2:05 pm".
 *
 * The relative half is what you want at a glance; the clock time is what you
 * want the moment you are lining two things up — did the brief land before or
 * after the call, which of these two edits came first, what time did she
 * actually pick it up. Putting the second half behind a hover means it may as
 * well not be there, so both are on the page.
 *
 * suppressHydrationWarning throughout: both halves are computed from the
 * reader's own clock, so the server's render never matches and that mismatch
 * is the point rather than a bug.
 */
export function Stamp({
  at,
  className = "",
  /** Drop the relative half — for places that already say "edited" or "due". */
  exactOnly = false,
}: {
  at: string | null | undefined;
  className?: string;
  exactOnly?: boolean;
}) {
  if (!at) return <span className={className}>—</span>;

  const exact = exactTime(at);
  const relative = relativeTime(at);

  return (
    <span suppressHydrationWarning className={className} title={fullTime(at)}>
      {exactOnly ? exact : exact ? `${relative} · ${exact}` : relative}
    </span>
  );
}
