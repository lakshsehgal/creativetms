"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Flame, X } from "lucide-react";
import type { Profile, TicketWithRefs } from "@/lib/types";
import { canDecideRush } from "@/lib/types";
import { supabaseBrowser } from "@/lib/supabase/client";
import { TICKET_SELECT, queryKeys } from "@/lib/queries";
import { reportWriteFailure, withRetry } from "@/lib/write";
import { Button, TextInput } from "@/components/ui/form";

/**
 * Same-day briefs waiting on a yes or a no.
 *
 * This sits above the page rather than inside one because it is the only thing
 * in the tool where somebody else is stopped until you act. A strategist has
 * said something is on fire and a designer has not been told anything at all —
 * every minute this waits is a minute of the afternoon nobody can plan.
 *
 * So it doesn't live on a screen you have to remember to open, and there is
 * nothing to dismiss. It clears when the question is answered.
 */
export function RushApprovals({ profile }: { profile: Profile }) {
  const supabase = supabaseBrowser();
  const queryClient = useQueryClient();
  const [deciding, setDeciding] = useState<string | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const decides = canDecideRush(profile.role);

  const pending = useQuery({
    queryKey: ["rush-pending"],
    enabled: decides,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select(TICKET_SELECT)
        .eq("rush_state", "pending")
        .is("deleted_at", null)
        .order("rush_requested_at");
      if (error) throw error;
      return (data ?? []) as unknown as TicketWithRefs[];
    },
  });

  async function decide(ticket: TicketWithRefs, approve: boolean, why: string) {
    setDeciding(ticket.id);
    const { error } = await withRetry(() =>
      supabase.rpc("decide_rush", {
        p_ticket: ticket.id,
        p_approve: approve,
        p_note: why,
      }),
    );
    setDeciding(null);

    if (error) {
      reportWriteFailure(error.message, "that decision", () =>
        void decide(ticket, approve, why),
      );
      return;
    }

    setDeclining(null);
    setNote("");
    queryClient.invalidateQueries({ queryKey: ["rush-pending"] });
    queryClient.invalidateQueries({ queryKey: queryKeys.tickets });
    toast.success(
      approve
        ? `Approved — ${ticket.assignee?.full_name?.split(" ")[0] ?? "the designer"} has been told`
        : "Declined — moved to tomorrow, and they've been told why",
    );
  }

  const rows = pending.data ?? [];
  if (!decides || rows.length === 0) return null;

  return (
    <div className="shrink-0 print:hidden">
      {rows.map((ticket) => (
        <div
          key={ticket.id}
          role="alert"
          className="flex flex-wrap items-center gap-x-2.5 gap-y-2 border-b px-4 py-2 text-[12px]"
          style={{
            background: "color-mix(in srgb, var(--color-serious) 11%, transparent)",
            borderColor: "var(--color-line)",
          }}
        >
          <Flame size={13} className="shrink-0" style={{ color: "var(--color-serious)" }} />

          <span className="min-w-0 flex-1">
            <Link href={`/tickets/${ticket.id}`} className="font-semibold hover:underline">
              #{ticket.number} {ticket.title}
            </Link>
            <span className="text-[var(--color-ink-2)]">
              {" — "}
              {ticket.author?.full_name?.split(" ")[0] ?? "Someone"} wants this today
              {ticket.rush_designer_id && ticket.assignee?.full_name
                ? `, on ${ticket.assignee.full_name.split(" ")[0]}`
                : ""}
              : {ticket.rush_reason}
            </span>
          </span>

          {declining === ticket.id ? (
            <span className="flex flex-wrap items-center gap-1.5">
              <TextInput
                autoFocus
                aria-label="Why not"
                placeholder="Why not? They'll see this."
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="!h-7 !w-[240px] !py-1 !text-[11.5px]"
              />
              <Button
                size="sm"
                variant="secondary"
                loading={deciding === ticket.id}
                onClick={() => void decide(ticket, false, note)}
              >
                Confirm
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDeclining(null)}>
                Cancel
              </Button>
            </span>
          ) : (
            <span className="flex shrink-0 items-center gap-1.5">
              <Button
                size="sm"
                variant="primary"
                loading={deciding === ticket.id}
                onClick={() => void decide(ticket, true, "")}
              >
                <Check size={13} /> Approve
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setNote("");
                  setDeclining(ticket.id);
                }}
              >
                <X size={13} /> Not today
              </Button>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
