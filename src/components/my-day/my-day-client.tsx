"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Inbox, Play } from "lucide-react";
import type { DailyScorecard, FormatBenchmark, Profile, TicketWithRefs, WorkSession } from "@/lib/types";
import { FORMAT_ORDER, FORMATS } from "@/lib/types";
import { dueLabel, dueState, humanDuration, isoDay, stopwatch } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/queries";
import { useHeartbeat } from "@/hooks/use-heartbeat";
import { secondsSince, useTicking } from "@/hooks/use-ticking";
import { useLiveTickets } from "@/hooks/use-live-tickets";
import { Card, FormatBadge, PageHeader, StatTile } from "@/components/ui/primitives";
import { Button } from "@/components/ui/form";
import { TrendChart } from "@/components/charts/trend-chart";
import { DayPlan } from "./day-plan";

export function MyDayClient({
  profile,
  initialTickets,
  benchmarks,
}: {
  profile: Profile;
  initialTickets: TicketWithRefs[];
  benchmarks: FormatBenchmark[];
}) {
  const supabase = supabaseBrowser();
  const queryClient = useQueryClient();
  const { tickets } = useLiveTickets(initialTickets);

  const mine = tickets.filter((ticket) => ticket.assigned_to === profile.id);
  const running = mine.find((ticket) => ticket.status === "in_progress");
  // What the designer has actually pledged to today, in their own order.
  const plannedToday = mine.filter(
    (ticket) => ticket.planned_for === isoDay() && ticket.status !== "approved",
  );
  const waiting = mine.filter((ticket) =>
    ["ready_for_approval", "sent_to_client"].includes(ticket.status),
  );
  const free = tickets.filter(
    (ticket) => ticket.status === "new_request" && !ticket.assigned_to,
  );

  useHeartbeat(running?.id ?? null, Boolean(running));
  useTicking(Boolean(running));

  /** Today's own sessions — the number the designer sees before anyone else does. */
  const today = useQuery({
    queryKey: ["my-day", isoDay()],
    refetchInterval: 60_000,
    queryFn: async () => {
      const start = new Date(`${isoDay()}T00:00:00`);
      const { data, error } = await supabase
        .from("work_sessions")
        .select("*")
        .eq("designer_id", profile.id)
        .gte("started_at", start.toISOString());
      if (error) throw error;
      return (data ?? []) as WorkSession[];
    },
  });

  const history = useQuery({
    queryKey: ["my-history"],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 13);
      const { data, error } = await supabase
        .from("daily_scorecards")
        .select("*")
        .eq("designer_id", profile.id)
        .gte("day", isoDay(since))
        .order("day");
      if (error) throw error;
      return (data ?? []) as DailyScorecard[];
    },
  });

  const trackedToday = useMemo(() => {
    return (today.data ?? []).reduce((sum, session) => {
      if (session.duration_seconds != null) return sum + session.duration_seconds;
      return sum + secondsSince(session.started_at);
    }, 0);
  }, [today.data]);

  const capacityPct = Math.round((trackedToday / (profile.daily_capacity_minutes * 60)) * 100);

  const trend = useMemo(
    () => [
      {
        key: "hours",
        label: "Hours tracked",
        color: "var(--color-series-1)",
        points: (history.data ?? []).map((card) => ({
          x: new Date(card.day).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
          y: Math.round((card.active_seconds / 3600) * 10) / 10,
        })),
      },
    ],
    [history.data],
  );

  async function start(ticket: TicketWithRefs) {
    const patch: Record<string, unknown> = { status: "in_progress" };
    if (!ticket.assigned_to) patch.assigned_to = profile.id;
    const { error } = await supabase.from("tickets").update(patch).eq("id", ticket.id);
    if (error) {
      toast.error(error.message.replace(/^.*?:\s*/, ""));
      return;
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.tickets });
    queryClient.invalidateQueries({ queryKey: queryKeys.ticketTime });
    queryClient.invalidateQueries({ queryKey: ["my-day", isoDay()] });
    toast.success("Clock started");
  }

  const firstName = (profile.full_name || profile.email).split(/[\s@]/)[0];

  return (
    <>
      <PageHeader
        title={`${greeting(profile.timezone)}, ${firstName}`}
        subtitle={`${plannedToday.length} picked for today · ${waiting.length} in review`}
      />

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="mx-auto max-w-5xl space-y-5">
          {/* ------------------------------------------------ what's running */}
          {running ? (
            <Card className="!border-[var(--color-accent)] !bg-[var(--color-accent-soft)]">
              <div className="flex flex-wrap items-center gap-4">
                <div className="min-w-0 flex-1">
                  <p
                    className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.07em]"
                    style={{ color: "var(--color-accent)" }}
                  >
                    <span
                      className="breathe h-1.5 w-1.5 rounded-full"
                      style={{ background: "var(--color-accent)" }}
                    />
                    Working on
                  </p>
                  <Link
                    href={`/tickets/${running.id}`}
                    className="mt-1.5 block truncate text-[17px] font-semibold tracking-tight hover:underline"
                  >
                    {running.title}
                  </Link>
                  <p className="mt-1 flex items-center gap-2 text-[12px] text-[var(--color-ink-2)]">
                    <FormatBadge format={running.format} quantity={running.quantity} />
                    {running.brand?.name}
                  </p>
                </div>
                <p className="tabular text-[34px] font-semibold leading-none tracking-tight">
                  {stopwatch(sessionElapsed(today.data, running.id))}
                </p>
              </div>
            </Card>
          ) : (
            <Card>
              <p className="text-[13px] text-[var(--color-ink-2)]">
                Nothing running. Starting a ticket below starts the clock — you
                don&apos;t have to log anything by hand.
              </p>
            </Card>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile
              label="Tracked today"
              value={humanDuration(trackedToday)}
              hint={`${capacityPct}% of your ${Math.round(profile.daily_capacity_minutes / 60)}h day`}
            />
            <StatTile
              label="Picked for today"
              value={plannedToday.length}
              hint="Chosen by you, not assigned to you"
            />
            <StatTile label="Awaiting review" value={waiting.length} hint="Submitted, not yet signed off" />
          </div>

          {/* ------------------------------------ pick the day, then order it */}
          <DayPlan
            profile={profile}
            tickets={tickets}
            benchmarks={benchmarks}
            onStart={(ticket) => void start(ticket)}
          />

          {/* ------------------------------------------------ open backlog */}
          {free.length > 0 && (
            <Card padded={false}>
              <h2 className="flex items-center gap-2 border-b border-[var(--color-line)] px-4 py-3 text-[13px] font-semibold tracking-tight">
                <Inbox size={14} className="text-[var(--color-ink-3)]" />
                Up for grabs
                <span className="tabular rounded-full bg-[var(--color-surface-3)] px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--color-ink-2)]">
                  {free.length}
                </span>
              </h2>
              <ul>
                {free.slice(0, 8).map((ticket) => (
                  <QueueRow key={ticket.id} ticket={ticket} onStart={() => void start(ticket)} claim />
                ))}
              </ul>
            </Card>
          )}

          {/* -------------------------------------------------- your fortnight */}
          {(history.data?.length ?? 0) > 1 && (
            <Card>
              <h2 className="text-[13px] font-semibold tracking-tight">Your last two weeks</h2>
              <p className="mb-3 mt-0.5 text-[11.5px] text-[var(--color-ink-3)]">
                Hours tracked per day. Only you and the admin see this.
              </p>
              <TrendChart series={trend} formatValue={(value) => `${value}h`} />

              <ul className="mt-4 flex flex-wrap gap-2 border-t border-[var(--color-line)] pt-3">
                {FORMAT_ORDER.map((format) => {
                  const totals = (history.data ?? []).reduce(
                    (acc, card) => ({
                      units: acc.units + (card.units_by_format?.[format] ?? 0),
                      seconds: acc.seconds + (card.seconds_by_format?.[format] ?? 0),
                    }),
                    { units: 0, seconds: 0 },
                  );
                  if (!totals.units) return null;
                  const perUnit = Math.round(totals.seconds / totals.units);
                  const target =
                    (benchmarks.find((row) => row.format === format)?.target_minutes_per_unit ?? 0) *
                    60;
                  return (
                    <li
                      key={format}
                      className="rounded-[var(--radius-md)] border border-[var(--color-line)] px-2.5 py-1.5 text-[11.5px]"
                    >
                      <span style={{ color: FORMATS[format].series }}>{FORMATS[format].label}</span>{" "}
                      <span className="tabular font-medium">{humanDuration(perUnit)}</span>
                      <span className="text-[var(--color-ink-3)]"> / unit</span>
                      {target > 0 && (
                        <span
                          className="tabular ml-1.5"
                          style={{
                            color: perUnit <= target ? "var(--color-good)" : "var(--color-serious)",
                          }}
                        >
                          {perUnit <= target ? "under" : "over"} {humanDuration(target)}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function QueueRow({
  ticket,
  onStart,
  claim,
}: {
  ticket: TicketWithRefs;
  onStart: () => void;
  claim?: boolean;
}) {
  const due = dueState(ticket);
  return (
    <li className="flex items-center gap-3 border-b border-[var(--color-line)] px-4 py-2.5 last:border-0 hover:bg-[var(--color-surface-2)]">
      <FormatBadge format={ticket.format} quantity={ticket.quantity} />
      <Link href={`/tickets/${ticket.id}`} className="min-w-0 flex-1 truncate text-[13px] hover:underline">
        {ticket.title}
      </Link>
      {ticket.brand && (
        <span className="hidden shrink-0 text-[11.5px] text-[var(--color-ink-3)] sm:block">
          {ticket.brand.name}
        </span>
      )}
      {ticket.status === "needs_edit" && (
        <span className="shrink-0 text-[11px]" style={{ color: "var(--color-serious)" }}>
          round {ticket.revision_count}
        </span>
      )}
      {ticket.due_at && (
        <span
          suppressHydrationWarning
          className="shrink-0 text-[11px] font-medium"
          style={{
            color:
              due === "overdue"
                ? "var(--color-critical)"
                : due === "today"
                  ? "var(--color-warning)"
                  : "var(--color-ink-3)",
          }}
        >
          {dueLabel(ticket.due_at)}
        </span>
      )}
      <Button size="sm" variant={claim ? "secondary" : "primary"} onClick={onStart}>
        <Play size={12} fill="currentColor" />
        {claim ? "Claim & start" : "Start"}
      </Button>
    </li>
  );
}

function sessionElapsed(sessions: WorkSession[] | undefined, ticketId: string): number {
  return (sessions ?? [])
    .filter((session) => session.ticket_id === ticketId)
    .reduce(
      (sum, session) =>
        sum + (session.duration_seconds ?? secondsSince(session.started_at)),
      0,
    );
}

function greeting(timezone: string): string {
  // Both the server and the browser resolve this against the same timezone,
  // so the rendered word matches on hydration.
  let hour: number;
  try {
    hour = Number(
      new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: timezone })
        .format(new Date()),
    );
  } catch {
    hour = new Date().getHours();
  }
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}
