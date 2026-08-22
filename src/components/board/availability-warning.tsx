"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarOff } from "lucide-react";
import type { AvailabilityBlock, Profile } from "@/lib/types";
import { blockKindMeta } from "@/lib/types";
import { isoDay, minutesToHuman } from "@/lib/format";
import { dayCapacity } from "@/lib/planning";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * "They're on a shoot that day."
 *
 * Shown while a brief is being written, next to the designer and the date, so
 * the strategist finds out before they hit save rather than in a Slack reply
 * the next morning.
 *
 * Deliberately a warning and not a block. Shoots move, people come back
 * early, and something genuinely urgent should still be brief-able — a tool
 * that refuses outright just gets worked around, and then the schedule it was
 * protecting is fiction anyway.
 */
export function AvailabilityWarning({
  designerId,
  dueAt,
  designers,
}: {
  designerId: string;
  /** The datetime-local value from the form, or an ISO string. */
  dueAt: string;
  designers: Profile[];
}) {
  const supabase = supabaseBrowser();
  const day = dueAt ? isoDay(new Date(dueAt)) : "";

  const blocks = useQuery({
    queryKey: ["blocks-for-day", designerId, day],
    enabled: Boolean(designerId && day),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("availability_blocks")
        .select("*")
        .eq("designer_id", designerId)
        .eq("day", day);
      if (error) throw error;
      return (data ?? []) as AvailabilityBlock[];
    },
  });

  const rows = blocks.data ?? [];
  if (!designerId || !day || rows.length === 0) return null;

  const person = designers.find((row) => row.id === designerId);
  const firstName = (person?.full_name || person?.email || "They").split(/[\s@]/)[0];
  const wholeDay = rows.some((row) => row.minutes == null);
  const blockedMinutes = rows.reduce((sum, row) => sum + (row.minutes ?? 0), 0);
  const capacity = person ? dayCapacity(person.daily_capacity_minutes, day) : 0;
  const left = Math.max(0, capacity - blockedMinutes);

  const label = blockKindMeta(rows[0].kind).label.toLowerCase();
  const note = rows.find((row) => row.note)?.note;

  const when = new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <p
      role="status"
      className="mt-3 flex items-start gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-[11.5px] leading-relaxed"
      style={{
        background: "color-mix(in srgb, var(--color-warning) 12%, transparent)",
        color: "var(--color-ink)",
      }}
    >
      <CalendarOff size={13} className="mt-0.5 shrink-0" style={{ color: "var(--color-warning)" }} />
      <span>
        <span className="font-semibold">
          {firstName} is {label} on {when}
          {wholeDay ? ", all day" : ""}.
        </span>{" "}
        {wholeDay
          ? "They have no hours that day."
          : `About ${minutesToHuman(left)} left after it.`}
        {note ? ` (${note})` : ""} You can still raise this — just worth
        knowing before you promise the date.
      </span>
    </p>
  );
}
