"use client";

import { Flame } from "lucide-react";
import type { RushState } from "@/lib/types";

/**
 * The escalation, on a card or a row.
 *
 * Two states are worth a mark and one isn't. An approved rush is the loudest
 * thing on a board — somebody agreed to break the studio's own rule for it. A
 * pending one matters to whoever has to decide. A declined one is just an
 * ordinary brief due tomorrow, and marking it would leave a scar on a ticket
 * where nothing is wrong.
 */
export function RushFlag({
  state,
  size = "sm",
}: {
  state: RushState | null;
  size?: "sm" | "md";
}) {
  if (state !== "approved" && state !== "pending") return null;

  const approved = state === "approved";
  const tone = approved ? "var(--color-critical)" : "var(--color-serious)";

  return (
    <span
      title={
        approved
          ? "Approved as urgent — needed today"
          : "Waiting on an operator or admin before anyone starts"
      }
      className={`inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-xs)] font-semibold ${
        size === "md" ? "px-1.5 py-0.5 text-[11px]" : "px-1 py-0.5 text-[10.5px]"
      }`}
      style={{
        background: `color-mix(in srgb, ${tone} 14%, transparent)`,
        color: tone,
      }}
    >
      <Flame size={size === "md" ? 11 : 10} />
      {approved ? "Today" : "Approval"}
    </span>
  );
}
