"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Flame, X } from "lucide-react";
import type { Profile, TicketWithRefs } from "@/lib/types";
import { RUSH_STATES, canDecideRush } from "@/lib/types";
import { relativeTime } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/queries";
import { reportWriteFailure, withRetry } from "@/lib/write";
import { Button, TextInput } from "@/components/ui/form";

/**
 * The exception, on the brief it was made for.
 *
 * The bar at the top of the app is for acting fast. This is the record: what
 * was claimed, who agreed to it, and when. A studio that can break its own
 * rule needs to be able to look back at how often it did and on whose say-so —
 * otherwise the exception quietly becomes the process.
 */
export function RushPanel({
  ticket,
  profile,
}: {
  ticket: TicketWithRefs;
  profile: Profile;
}) {
  const supabase = supabaseBrowser();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");

  if (!ticket.rush_state) return null;

  const meta = RUSH_STATES[ticket.rush_state];
  const decides = canDecideRush(profile.role) && ticket.rush_state === "pending";

  async function decide(approve: boolean) {
    setBusy(true);
    const { error } = await withRetry(() =>
      supabase.rpc("decide_rush", {
        p_ticket: ticket.id,
        p_approve: approve,
        p_note: note,
      }),
    );
    setBusy(false);
    if (error) {
      reportWriteFailure(error.message, "that decision", () => void decide(approve));
      return;
    }
    setDeclining(false);
    queryClient.invalidateQueries({ queryKey: queryKeys.ticket(ticket.id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.tickets });
    queryClient.invalidateQueries({ queryKey: ["rush-pending"] });
    toast.success(approve ? "Approved for today" : "Declined — moved to tomorrow");
  }

  return (
    <section
      className="rounded-[var(--radius-lg)] border p-4"
      style={{
        borderColor: `color-mix(in srgb, ${meta.tone} 40%, transparent)`,
        background: `color-mix(in srgb, ${meta.tone} 7%, transparent)`,
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Flame size={14} style={{ color: meta.tone }} />
        <h2 className="text-[12.5px] font-semibold tracking-tight" style={{ color: meta.tone }}>
          {meta.label}
        </h2>
        {ticket.rush_state === "pending" && (
          <span className="text-[11.5px] text-[var(--color-ink-3)]">
            nobody is working on this until it&apos;s answered
          </span>
        )}
      </div>

      <p className="mt-2 text-[13px] leading-relaxed">{ticket.rush_reason}</p>

      <p className="mt-1.5 text-[11.5px] text-[var(--color-ink-3)]">
        Asked for by {ticket.author?.full_name?.split(" ")[0] ?? "someone"}
        {ticket.rush_requested_at && <> · {relativeTime(ticket.rush_requested_at)}</>}
        {ticket.rush_decided_at && ticket.rush_state !== "pending" && (
          <>
            {" · "}
            {ticket.rush_state === "approved" ? "approved" : "declined"}{" "}
            {relativeTime(ticket.rush_decided_at)}
            {ticket.rush_note && ` — ${ticket.rush_note}`}
          </>
        )}
      </p>

      {decides && (
        <div className="mt-3">
          {declining ? (
            <div className="flex flex-wrap items-center gap-2">
              <TextInput
                autoFocus
                aria-label="Why not"
                placeholder="Why not? They'll see this."
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="!w-[260px]"
              />
              <Button size="sm" variant="secondary" loading={busy} onClick={() => void decide(false)}>
                Confirm
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDeclining(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="primary" loading={busy} onClick={() => void decide(true)}>
                <Check size={13} /> Approve for today
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDeclining(true)}>
                <X size={13} /> Not today
              </Button>
              <span className="text-[11.5px] text-[var(--color-ink-3)]">
                Declining moves it to tomorrow rather than throwing it away.
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
