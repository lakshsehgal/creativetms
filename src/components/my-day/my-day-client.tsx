"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Inbox, Play } from "lucide-react";
import type { Profile, TicketWithRefs } from "@/lib/types";
import { dueLabel, dueState, isoDay } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/queries";
import { useHeartbeat } from "@/hooks/use-heartbeat";
import { useLiveTickets } from "@/hooks/use-live-tickets";
import { Card, FormatBadge, PageHeader, StatTile } from "@/components/ui/primitives";
import { Button } from "@/components/ui/form";
import { DayPlan } from "./day-plan";

export function MyDayClient({
  profile,
  initialTickets,
}: {
  profile: Profile;
  initialTickets: TicketWithRefs[];
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
    toast.success("Started");
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
                {/*
                  No ticking clock. A designer watching their own seconds count
                  up is the surveillance feeling this tool exists to avoid —
                  the timing is a by-product of the board, not a stopwatch
                  anyone is being held to. Admins and operators see the live
                  figure in Analytics.
                */}
                <p
                  className="flex items-center gap-1.5 text-[12.5px] font-medium"
                  style={{ color: "var(--color-accent)" }}
                >
                  <span
                    className="breathe h-1.5 w-1.5 rounded-full"
                    style={{ background: "var(--color-accent)" }}
                  />
                  In progress
                </p>
              </div>
            </Card>
          ) : (
            <Card>
              <p className="text-[13px] text-[var(--color-ink-2)]">
                Nothing in progress. Start a ticket below — you
                don&apos;t have to log anything by hand.
              </p>
            </Card>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
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
