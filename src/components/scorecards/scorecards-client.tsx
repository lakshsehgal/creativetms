"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Trophy } from "lucide-react";
import type { DailyScorecard, FormatBenchmark, Profile, Ticket, WorkSession } from "@/lib/types";
import { dayLabel, isoDay } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { Button } from "@/components/ui/form";
import { ScorecardCard } from "./scorecard-card";
import { computeLiveScorecards } from "./compute";

export function ScorecardsClient({
  profile,
  designers,
  benchmarks,
}: {
  profile: Profile;
  designers: Profile[];
  benchmarks: FormatBenchmark[];
}) {
  const supabase = supabaseBrowser();
  const [day, setDay] = useState(() => isoDay());
  const isToday = day === isoDay();
  const isAdmin = profile.role === "admin";

  // A designer only ever sees their own card, enforced by RLS as well as here.
  const scope = useMemo(
    () => (isAdmin ? designers : designers.filter((person) => person.id === profile.id)),
    [isAdmin, designers, profile.id],
  );

  const stored = useQuery({
    queryKey: ["scorecards", day],
    enabled: !isToday,
    queryFn: async () => {
      const { data, error } = await supabase.from("daily_scorecards").select("*").eq("day", day);
      if (error) throw error;
      return (data ?? []) as DailyScorecard[];
    },
  });

  const live = useQuery({
    queryKey: ["scorecards-live", day],
    enabled: isToday,
    refetchInterval: 60_000,
    queryFn: async () => {
      const start = new Date(`${day}T00:00:00`);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);

      const [sessions, tickets] = await Promise.all([
        supabase
          .from("work_sessions")
          .select("*, ticket:tickets ( format, quantity )")
          .gte("started_at", start.toISOString())
          .lt("started_at", end.toISOString()),
        supabase
          .from("tickets")
          .select("id, assigned_to, format, quantity, revision_count, due_at, approved_at")
          .not("approved_at", "is", null)
          .gte("approved_at", start.toISOString())
          .lt("approved_at", end.toISOString()),
      ]);

      if (sessions.error) throw sessions.error;
      if (tickets.error) throw tickets.error;

      return computeLiveScorecards({
        day,
        designers: scope,
        sessions: (sessions.data ?? []) as unknown as (WorkSession & {
          ticket?: Pick<Ticket, "format" | "quantity"> | null;
        })[],
        tickets: (tickets.data ?? []) as Pick<
          Ticket,
          "id" | "assigned_to" | "format" | "quantity" | "revision_count" | "due_at" | "approved_at"
        >[],
        benchmarks,
      });
    },
  });

  const cards = (isToday ? live.data : stored.data) ?? [];
  const loading = isToday ? live.isLoading : stored.isLoading;

  function shiftDay(days: number) {
    const [y, m, d] = day.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + days);
    if (date > new Date()) return;
    setDay(isoDay(date));
  }

  return (
    <>
      <PageHeader
        title={isAdmin ? "Scorecards" : "My scorecard"}
        subtitle={
          isToday
            ? "Today so far — the final card is written tonight"
            : `Final card for ${dayLabel(day)}`
        }
      >
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => shiftDay(-1)} aria-label="Previous day">
            <ChevronLeft size={15} />
          </Button>
          <span className="min-w-[104px] text-center text-[12.5px] font-medium">{dayLabel(day)}</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => shiftDay(1)}
            disabled={isToday}
            aria-label="Next day"
          >
            <ChevronRight size={15} />
          </Button>
        </div>
      </PageHeader>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="mx-auto max-w-6xl">
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((n) => (
                <div key={n} className="skeleton h-56" />
              ))}
            </div>
          ) : cards.length === 0 ? (
            <EmptyState
              icon={<Trophy size={22} />}
              title={isToday ? "Nothing tracked yet today" : "No card for this day"}
              hint={
                isToday
                  ? "The clock starts the moment a ticket moves into In Progress. Cards fill in as the day goes."
                  : "Cards are written every night for designers who worked that day."
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cards
                .slice()
                .sort((a, b) => b.active_seconds - a.active_seconds)
                .map((card) => {
                  const designer = scope.find((person) => person.id === card.designer_id);
                  if (!designer) return null;
                  return (
                    <ScorecardCard
                      key={card.id}
                      card={card}
                      designer={designer}
                      benchmarks={benchmarks}
                      live={isToday}
                    />
                  );
                })}
            </div>
          )}

          <p className="mt-6 max-w-2xl text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">
            Time comes from the board — a ticket moving into In Progress starts
            the clock, moving it out stops it, and a session whose tab goes quiet
            is rewound to its last heartbeat. Nobody fills in a timesheet, and
            idle time never counts as work.
          </p>
        </div>
      </div>
    </>
  );
}
