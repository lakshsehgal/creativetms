"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import type { AvailabilityBlock, Profile } from "@/lib/types";
import { canRunShoots } from "@/lib/types";
import { clockLabel, isBannerLive, shootWindow } from "@/lib/shoot";
import { addDays } from "@/lib/planning";
import { isoDay } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * "Abhay is on a shoot from 10am to 4pm — raise accordingly."
 *
 * A notification is a moment; this is a state. The notification fires when the
 * block is marked, which may be a fortnight before anybody cares, and by the
 * Tuesday it matters it's four hundred rows down a bell nobody opens. The bar
 * is the opposite: it shows up a day before the shoot starts, stays for as
 * long as the person is actually gone, and then disappears on its own.
 *
 * Twenty-four hours is the whole point of the window. Any less and there's no
 * time to move a brief; any more and it becomes wallpaper, which is the same
 * as nothing.
 *
 * There is deliberately no dismiss. The bar closes itself the moment the shoot
 * ends, and a dismissible warning about someone's whole Tuesday is one click
 * from being a warning nobody ever saw.
 */

const REFRESH_MS = 60_000;

export function ShootBanner({ profile }: { profile: Profile }) {
  const supabase = supabaseBrowser();
  const [now, setNow] = useState(() => new Date());

  // Everyone who briefs work needs this. A designer doesn't raise tickets, so
  // for them it would be somebody else's business on their screen all day.
  const briefs = profile.role !== "designer";

  const today = isoDay();
  const blocks = useQuery({
    queryKey: ["shoot-banner", today],
    enabled: briefs,
    // Marked-then-cancelled shoots are common enough that a stale bar telling
    // people to route around a designer who is at their desk is its own bug.
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("availability_blocks")
        .select("*")
        .gte("day", today)
        .lte("day", addDays(today, 1))
        .order("day");
      if (error) throw error;
      return (data ?? []) as AvailabilityBlock[];
    },
  });

  const people = useQuery({
    queryKey: ["shoot-banner-people"],
    enabled: briefs,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,full_name,email");
      return (data ?? []) as Pick<Profile, "id" | "full_name" | "email">[];
    },
  });

  // The window opens and closes on the clock, so the bar has to re-judge
  // itself without a reload — a tab left open overnight is the normal case.
  useEffect(() => {
    if (!briefs) return;
    const timer = setInterval(() => setNow(new Date()), REFRESH_MS);
    return () => clearInterval(timer);
  }, [briefs]);

  const live = useMemo(() => {
    const byId = new Map((people.data ?? []).map((person) => [person.id, person]));

    return (blocks.data ?? [])
      .filter((block) => isBannerLive(shootWindow(block), now))
      .map((block) => {
        const person = byId.get(block.designer_id);
        const name = (person?.full_name || person?.email || "Someone").split(" ")[0];
        const from = clockLabel(block.start_time);
        const to = clockLabel(block.end_time);
        const day = new Date(`${block.day}T00:00:00`);
        const isToday = block.day === today;
        const dayWord = isToday
          ? ""
          : ` ${day.toLocaleDateString(undefined, { weekday: "long" })}`;

        const doing =
          block.kind === "shoot"
            ? "is on a shoot"
            : block.kind === "leave"
              ? "is on leave"
              : block.kind === "holiday"
                ? "is off"
                : "is unavailable";

        const hours = from && to ? ` from ${from} to ${to}` : " all day";

        return {
          id: block.id,
          text: `${name} ${doing}${dayWord}${hours} — raise accordingly`,
        };
      });
  }, [blocks.data, people.data, now, today]);

  if (!briefs || live.length === 0) return null;

  return (
    <div className="shrink-0 print:hidden">
      {live.slice(0, 2).map((row) => (
        <div
          key={row.id}
          className="flex items-center gap-2 border-b px-4 py-1.5 text-[12px]"
          style={{
            background: "color-mix(in srgb, var(--color-series-5) 12%, transparent)",
            borderColor: "var(--color-line)",
          }}
        >
          <Camera size={13} className="shrink-0 text-[var(--color-ink-2)]" />
          <span className="min-w-0 truncate">{row.text}</span>
          {canRunShoots(profile) && (
            <Link
              href="/shoot"
              className="ml-auto shrink-0 text-[11.5px] font-medium text-[var(--color-ink-2)] underline underline-offset-2 hover:text-[var(--color-ink)]"
            >
              Shoot
            </Link>
          )}
        </div>
      ))}

      {live.length > 2 && (
        <div className="border-b border-[var(--color-line)] bg-[var(--color-surface-2)] px-4 py-1 text-[11.5px] text-[var(--color-ink-3)]">
          and {live.length - 2} more booked out — check Workload before you brief.
        </div>
      )}
    </div>
  );
}
