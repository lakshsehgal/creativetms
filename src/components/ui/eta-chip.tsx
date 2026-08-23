"use client";

import { useEffect, useState } from "react";
import { CalendarClock, HelpCircle } from "lucide-react";
import { ETA_STATES, etaLabel, etaState, type EtaTicket } from "@/lib/eta";

/**
 * The estimate, at a glance, on a board card or a table row.
 *
 * It appears only on briefs where somebody has actually asked or answered,
 * which is a small minority — that's what makes it worth looking at. A chip on
 * every ticket would be a column of "—" and nobody would read the ones that
 * matter.
 *
 * Nothing at all for work already handed over: the estimate is history the
 * moment it's submitted, and a stale date on a delivered card is just noise.
 */
export function EtaChip({
  ticket,
  size = "sm",
}: {
  ticket: EtaTicket;
  size?: "sm" | "md";
}) {
  // Zero clock until mounted, so the server and the first client paint agree
  // on whether an estimate has passed. See etaState.
  const [live, setLive] = useState(false);
  useEffect(() => setLive(true), []);

  const state = etaState(ticket, live ? Date.now() : 0);
  if (state === "none" || state === "settled") return null;

  const meta = ETA_STATES[state];
  const text = state === "waiting" ? "ETA?" : etaLabel(ticket.eta_at);
  const Icon = state === "waiting" ? HelpCircle : CalendarClock;

  return (
    <span
      suppressHydrationWarning
      title={
        state === "waiting"
          ? "Somebody has asked when this will land"
          : `${meta.label} — the designer's estimate, not the due date`
      }
      className={`inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-xs)] font-medium ${
        size === "md" ? "px-1.5 py-0.5 text-[11px]" : "px-1 py-0.5 text-[10.5px]"
      }`}
      style={{
        background: `color-mix(in srgb, ${meta.tone} 13%, transparent)`,
        color: meta.tone,
      }}
    >
      <Icon size={size === "md" ? 11 : 10} />
      {text}
    </span>
  );
}
