"use client";

import { ArrowRight, CalendarClock, Flame, Pause, Play } from "lucide-react";
import type { Illustration } from "@/lib/tour";
import { STATUSES } from "@/lib/types";

/**
 * The four things the live screen can't be pointed at.
 *
 * A walkthrough that only spotlights real elements has one gap: the ideas that
 * aren't a button. The clock nobody sees, a rush card that isn't on the board
 * today, a rule about what time it is. The obvious fix is a screenshot, and
 * the obvious fix is wrong — a screenshot of this tool is out of date within
 * the month, and it looks authoritative the whole time it's lying.
 *
 * So these are drawn from the same tokens and the same status colours as the
 * product. Restyle the app and they restyle with it. They can go out of date
 * in meaning, which a test can catch, but never in appearance.
 */
export function TourArt({ kind }: { kind: Illustration }) {
  if (kind === "clock") return <Clock />;
  if (kind === "rush") return <Rush />;
  if (kind === "noon") return <Noon />;
  return <Eta />;
}

const FRAME =
  "rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface-2)] p-2.5";

/** Move a card, and the time appears. Nobody pressed anything. */
function Clock() {
  return (
    <div className={`${FRAME} flex items-center gap-2`}>
      <Lane status="new_request" />
      <ArrowRight size={13} className="shrink-0 text-[var(--color-ink-3)]" />
      <Lane status="in_progress" />
      <span
        className="tabular ml-auto shrink-0 rounded-[var(--radius-xs)] px-1.5 py-1 text-[11px] font-semibold"
        style={{
          background: "color-mix(in srgb, var(--color-accent) 14%, transparent)",
          color: "var(--color-accent)",
        }}
      >
        01:42
      </span>
    </div>
  );
}

function Lane({ status }: { status: "new_request" | "in_progress" }) {
  const meta = STATUSES[status];
  return (
    <span className="flex min-w-0 shrink items-center gap-1.5">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: meta.fill }} />
      <span className="truncate text-[10.5px] font-medium" style={{ color: meta.fill }}>
        {meta.label}
      </span>
    </span>
  );
}

/** What an approved escalation looks like when it reaches the board. */
function Rush() {
  return (
    <div className={FRAME}>
      <div className="rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-xs)] px-1 py-0.5 text-[10.5px] font-semibold"
            style={{
              background: "color-mix(in srgb, var(--color-critical) 14%, transparent)",
              color: "var(--color-critical)",
            }}
          >
            <Flame size={10} />
            Today
          </span>
          <span className="truncate text-[11px] text-[var(--color-ink-3)]">approved by an operator</span>
        </div>
        <p className="mt-1.5 truncate text-[12px] font-medium">Diwali sale — 3 statics</p>
      </div>
    </div>
  );
}

/** Before midday you can ask for today. After it, you have to ask somebody. */
function Noon() {
  return (
    <div className={`${FRAME} space-y-1.5`}>
      <Rule
        when="Before 12pm"
        what="today is on the calendar"
        tone="var(--color-accent)"
        icon={<Play size={10} fill="currentColor" />}
      />
      <Rule
        when="After 12pm"
        what="tomorrow, unless somebody agrees"
        tone="var(--color-serious)"
        icon={<Pause size={10} fill="currentColor" />}
      />
    </div>
  );
}

function Rule({
  when,
  what,
  tone,
  icon,
}: {
  when: string;
  what: string;
  tone: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span
        className="grid h-4 w-4 shrink-0 place-items-center rounded-[var(--radius-xs)]"
        style={{ background: `color-mix(in srgb, ${tone} 15%, transparent)`, color: tone }}
      >
        {icon}
      </span>
      <span className="tabular shrink-0 font-semibold" style={{ color: tone }}>
        {when}
      </span>
      <span className="truncate text-[var(--color-ink-2)]">{what}</span>
    </div>
  );
}

/** The question, and the answer that stops it being asked again. */
function Eta() {
  return (
    <div className={`${FRAME} flex items-center gap-2`}>
      <span
        className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-xs)] px-1.5 py-0.5 text-[10.5px] font-medium"
        style={{
          background: "color-mix(in srgb, var(--color-serious) 13%, transparent)",
          color: "var(--color-serious)",
        }}
      >
        ETA?
      </span>
      <ArrowRight size={13} className="shrink-0 text-[var(--color-ink-3)]" />
      <span
        className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-xs)] px-1.5 py-0.5 text-[10.5px] font-medium"
        style={{
          background: "color-mix(in srgb, var(--color-accent) 13%, transparent)",
          color: "var(--color-accent)",
        }}
      >
        <CalendarClock size={10} />
        Tomorrow, 2pm
      </span>
    </div>
  );
}
