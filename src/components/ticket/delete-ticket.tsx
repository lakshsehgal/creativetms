"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import type { Profile, TicketWithRefs } from "@/lib/types";
import { supabaseBrowser } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/queries";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/form";

/**
 * Removing a ticket.
 *
 * The row is stamped rather than destroyed. A real DELETE would take the work
 * sessions, the comments and the activity trail with it, and there is no
 * getting an afternoon of someone's tracked time back once it's gone — so the
 * ticket leaves every list and stops counting, and can be put back.
 *
 * Who may: an admin, always. Anyone else, only for a brief they raised that
 * nobody has picked up yet. The database enforces both; this only decides
 * whether to draw the button.
 */
export function canRemove(ticket: TicketWithRefs, viewer: Profile): boolean {
  if (viewer.role === "admin") return true;
  return (
    ticket.created_by === viewer.id &&
    ticket.status === "new_request" &&
    !ticket.assigned_to
  );
}

export function DeleteTicket({
  ticket,
  profile,
  onDeleted,
}: {
  ticket: TicketWithRefs;
  profile: Profile;
  onDeleted?: () => void;
}) {
  const supabase = supabaseBrowser();
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!canRemove(ticket, profile)) return null;

  const tracked = (ticket.total_seconds ?? 0) > 0;

  async function restore() {
    const { error } = await supabase.rpc("restore_ticket", { p_ticket_id: ticket.id });
    if (error) {
      toast.error(error.message.replace(/^.*?:\s*/, ""));
      return;
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.tickets });
    queryClient.invalidateQueries({ queryKey: queryKeys.ticket(ticket.id) });
    toast.success(`#${ticket.number} is back`);
  }

  async function remove() {
    setBusy(true);
    const { error } = await supabase.rpc("delete_ticket", { p_ticket_id: ticket.id });
    setBusy(false);

    if (error) {
      toast.error(error.message.replace(/^.*?:\s*/, ""));
      return;
    }

    setAsking(false);
    queryClient.invalidateQueries({ queryKey: queryKeys.tickets });

    toast.success(`#${ticket.number} removed`, {
      description: "It's kept for 30 days and an admin can restore it.",
      duration: 12_000,
      action: { label: "Undo", onClick: () => void restore() },
    });

    onDeleted?.();
  }

  return (
    <>
      <button
        onClick={() => setAsking(true)}
        title="Remove this ticket"
        aria-label={`Remove ticket #${ticket.number}`}
        className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-critical)]"
      >
        <Trash2 size={14} />
      </button>

      <Dialog
        open={asking}
        onClose={() => setAsking(false)}
        title={`Remove “${ticket.title}”?`}
        description="It disappears from the board, the list and everyone's notifications."
        width={440}
      >
        <ul className="space-y-1.5 text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">
          {tracked && (
            <li className="flex gap-2">
              <span aria-hidden style={{ color: "var(--color-warning)" }}>
                •
              </span>
              <span>
                <span className="font-medium text-[var(--color-ink)]">
                  Time logged against it stops counting
                </span>{" "}
                — it comes out of the scorecards and the analytics.
              </span>
            </li>
          )}
          <li className="flex gap-2">
            <span aria-hidden className="text-[var(--color-ink-3)]">
              •
            </span>
            <span>
              Nothing is destroyed. The comments, the activity and any tracked
              time stay on the row, so restoring puts it all back.
            </span>
          </li>
        </ul>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setAsking(false)}>
            Keep it
          </Button>
          <Button type="button" variant="danger" loading={busy} onClick={() => void remove()}>
            <Trash2 size={13} /> Remove
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
