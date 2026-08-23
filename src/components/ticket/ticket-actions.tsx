"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Link2, Pause, Play, RotateCcw, Send, Truck } from "lucide-react";
import type { Profile, TicketStatus, TicketWithRefs } from "@/lib/types";
import { supabaseBrowser } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/queries";
import { Button, TextArea, TextInput } from "@/components/ui/form";
import { Dialog, DialogFooter } from "@/components/ui/dialog";

export function TicketActions({
  ticket,
  profile,
}: {
  ticket: TicketWithRefs;
  profile: Profile;
}) {
  const supabase = supabaseBrowser();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [revising, setRevising] = useState(false);
  const [notes, setNotes] = useState("");
  const [askingForLink, setAskingForLink] = useState(false);
  const [reviewUrl, setReviewUrl] = useState("");

  // Version number this submission will take.
  const deliverables = useQuery({
    queryKey: ["deliverables", ticket.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deliverables")
        .select("version")
        .eq("ticket_id", ticket.id);
      if (error) throw error;
      return data ?? [];
    },
  });
  const nextVersion = (deliverables.data?.length ?? 0) + 1;

  const isOwner = ticket.assigned_to === profile.id;
  const isStaff = profile.role === "admin" || profile.role === "strategist";
  const unclaimed = !ticket.assigned_to;

  async function move(status: TicketStatus, label: string, key: string) {
    setBusy(key);
    const patch: Record<string, unknown> = { status };
    if (unclaimed && profile.role === "designer") patch.assigned_to = profile.id;

    const { error } = await supabase.from("tickets").update(patch).eq("id", ticket.id);
    setBusy(null);

    if (error) {
      toast.error(error.message.replace(/^.*?:\s*/, ""));
      return;
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.ticket(ticket.id) });
    queryClient.invalidateQueries({ queryKey: ["sessions", ticket.id] });
    queryClient.invalidateQueries({ queryKey: queryKeys.tickets });
    toast.success(label);
  }

  /**
   * Submitting is the handoff, and the handoff is the Frame.io link. Rather
   * than block on it, ask for it here — the strategist gets a ticket they can
   * act on instead of one they have to chase.
   */
  async function submitForReview(withUrl?: string) {
    setBusy("submit");

    const url = withUrl?.trim() ?? "";

    // Each submission is its own version. V1 stays readable after V2 lands,
    // so a strategist can see what changed between rounds rather than
    // discovering the link has silently been replaced.
    if (url) {
      const { data: last } = await supabase
        .from("deliverables")
        .select("version")
        .eq("ticket_id", ticket.id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();

      await supabase.from("deliverables").insert({
        ticket_id: ticket.id,
        version: (last?.version ?? 0) + 1,
        url,
        phase: ticket.work_phase,
        submitted_by: profile.id,
      });
    }

    const patch: Record<string, unknown> = { status: "ready_for_approval" };
    // review_url stays as the newest link so the board and list can link out.
    if (url) patch.review_url = url;
    if (unclaimed && profile.role === "designer") patch.assigned_to = profile.id;

    const { error } = await supabase.from("tickets").update(patch).eq("id", ticket.id);
    setBusy(null);

    if (error) {
      toast.error(error.message.replace(/^.*?:\s*/, ""));
      return;
    }

    setAskingForLink(false);
    setReviewUrl("");
    queryClient.invalidateQueries({ queryKey: ["deliverables", ticket.id] });
    queryClient.invalidateQueries({ queryKey: queryKeys.ticket(ticket.id) });
    queryClient.invalidateQueries({ queryKey: ["sessions", ticket.id] });
    queryClient.invalidateQueries({ queryKey: queryKeys.tickets });
    toast.success(
      ticket.work_phase === "size_change"
        ? "Resizes sent for review"
        : "Sent for review",
    );
  }

  async function requestRevisions(event: React.FormEvent) {
    event.preventDefault();
    setBusy("revisions");

    const { error } = await supabase
      .from("tickets")
      .update({ status: "needs_edit" })
      .eq("id", ticket.id);

    if (error) {
      setBusy(null);
      toast.error(error.message);
      return;
    }

    // revision_count was just bumped by the trigger; that value is the round.
    const { data: fresh } = await supabase
      .from("tickets")
      .select("revision_count")
      .eq("id", ticket.id)
      .single();

    await supabase.from("ticket_revisions").insert({
      ticket_id: ticket.id,
      round: fresh?.revision_count ?? 1,
      requested_by: profile.id,
      notes: notes.trim(),
    });

    setBusy(null);
    setRevising(false);
    setNotes("");
    queryClient.invalidateQueries({ queryKey: queryKeys.ticket(ticket.id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.revisions(ticket.id) });
    toast.success("Sent back with notes");
  }

  const actions: React.ReactNode[] = [];

  /* ---------------------------------------------------------------- designer
   * Their side of the handoff. Starting work is the only thing that starts
   * the clock, and submitting is the only thing that hands it back.
   * -------------------------------------------------------------------- */
  if (profile.role === "designer" && (isOwner || unclaimed)) {
    const pickUpFrom: TicketStatus[] = [
      "new_request",
      "size_changes",
      "needs_edit",
      "on_hold",
      "awaiting_assets",
    ];

    if (pickUpFrom.includes(ticket.status)) {
      actions.push(
        <Button
          key="start"
          variant="primary"
          size="sm"
          loading={busy === "start"}
          onClick={() => move("in_progress", "Clock started", "start")}
        >
          <Play size={13} fill="currentColor" />
          {ticket.status === "new_request" ? "Start working" : "Pick back up"}
        </Button>,
      );
    }

    if (ticket.status === "in_progress") {
      actions.push(
        <Button
          key="hold"
          size="sm"
          loading={busy === "hold"}
          onClick={() => move("on_hold", "Paused — clock stopped", "hold")}
          title="Stops the clock and keeps the ticket yours"
        >
          <Pause size={13} /> Pause
        </Button>,
        <Button
          key="blocked"
          size="sm"
          loading={busy === "blocked"}
          onClick={() => move("awaiting_assets", "Flagged as waiting on assets", "blocked")}
          title="Stops the clock — you're blocked on someone else"
        >
          Awaiting assets
        </Button>,
        <Button
          key="submit"
          variant="primary"
          size="sm"
          loading={busy === "submit"}
          // Resized sets land in the same Frame.io folder as the main output,
          // beside it — there's no second link to paste, so don't ask for one.
          onClick={() =>
            ticket.work_phase === "size_change"
              ? void submitForReview("")
              : setAskingForLink(true)
          }
        >
          <Send size={13} /> Ready for approval
        </Button>,
      );
    }
  }

  /* -------------------------------------------------------------- strategist
   * Everything client-facing, plus the two ways work comes back.
   * -------------------------------------------------------------------- */
  if (isStaff) {
    // Approved is on this list on purpose. A resize ask almost always arrives
    // AFTER sign-off — the ad works, so now it's wanted in nine more
    // placements — and closing every door at approval meant raising a
    // duplicate brief, which loses the history and counts the work twice.
    const canSendBack =
      ticket.status === "ready_for_approval" ||
      ticket.status === "sent_to_client" ||
      ticket.status === "approved";

    if (canSendBack) {
      const signedOff = ticket.status === "approved";
      actions.push(
        <Button key="revise" size="sm" onClick={() => setRevising(true)}>
          <RotateCcw size={13} /> {signedOff ? "Reopen with notes" : "Needs edit"}
        </Button>,
        <Button
          key="sizes"
          size="sm"
          variant={signedOff ? "primary" : "secondary"}
          loading={busy === "sizes"}
          onClick={() => move("size_changes", "Sent back for size changes", "sizes")}
          title="A resize ask — deliberately not counted as a revision round"
        >
          Size changes
        </Button>,
      );
    }

    if (ticket.status === "ready_for_approval") {
      actions.push(
        <Button
          key="send"
          variant="primary"
          size="sm"
          loading={busy === "send"}
          onClick={() => move("sent_to_client", "Sent to client", "send")}
        >
          <Truck size={13} /> Send to client
        </Button>,
      );
    }

    if (ticket.status === "sent_to_client" || ticket.status === "ready_for_approval") {
      actions.push(
        <Button
          key="approve"
          variant="primary"
          size="sm"
          loading={busy === "approve"}
          onClick={() => move("approved", "Approved", "approve")}
        >
          <Check size={13} /> Approve
        </Button>,
      );
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {actions.length > 0 ? (
          actions
        ) : (
          <p className="text-[12px] text-[var(--color-ink-3)]">
            {ticket.status === "ready_for_approval"
              ? "With the strategist for review."
              : ticket.status === "sent_to_client"
                ? "With the client."
                : ticket.status === "approved"
                  ? "Approved. A strategist can still send it back for resizes."
                  : "Nothing for you to do here right now."}
          </p>
        )}
      </div>

      <Dialog
        open={askingForLink}
        onClose={() => setAskingForLink(false)}
        title={`Frame.io link for V${nextVersion}`}
        description={
          ticket.work_phase === "revision"
            ? "This round's cut. The strategist gets a notification the moment you submit."
            : "Paste the share link so the strategist can watch it straight away."
        }
        width={460}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submitForReview(reviewUrl);
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-md)]"
              style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
            >
              <Link2 size={15} />
            </span>
            <TextInput
              autoFocus
              value={reviewUrl}
              onChange={(event) => setReviewUrl(event.target.value)}
              placeholder="https://f.io/…"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => void submitForReview("")}
              loading={busy === "submit" && !reviewUrl}
            >
              Submit without one
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={busy === "submit" && Boolean(reviewUrl)}
              disabled={!reviewUrl.trim()}
            >
              Save &amp; submit
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

      <Dialog
        open={revising}
        onClose={() => setRevising(false)}
        title={`Revision round ${ticket.revision_count + 1}`}
        description={
          ticket.status === "approved"
            ? "This was signed off, so reopening it counts as a fresh revision round. Say what changed."
            : "Say what needs to change. The designer sees this at the top of the ticket."
        }
      >
        <form onSubmit={requestRevisions}>
          <TextArea
            autoFocus
            rows={5}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Logo lockup is too tight, and the CTA needs the sale price on it."
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setRevising(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={busy === "revisions"}>
              Send back
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </>
  );
}
