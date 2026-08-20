"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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

    const patch: Record<string, unknown> = { status: "in_review" };
    if (withUrl !== undefined) patch.review_url = withUrl.trim() || null;
    if (unclaimed && profile.role === "designer") patch.assigned_to = profile.id;

    const { error } = await supabase.from("tickets").update(patch).eq("id", ticket.id);
    setBusy(null);

    if (error) {
      toast.error(error.message.replace(/^.*?:\s*/, ""));
      return;
    }

    setAskingForLink(false);
    setReviewUrl("");
    queryClient.invalidateQueries({ queryKey: queryKeys.ticket(ticket.id) });
    queryClient.invalidateQueries({ queryKey: ["sessions", ticket.id] });
    queryClient.invalidateQueries({ queryKey: queryKeys.tickets });
    toast.success("Sent for review");
  }

  async function requestRevisions(event: React.FormEvent) {
    event.preventDefault();
    setBusy("revisions");

    const { error } = await supabase
      .from("tickets")
      .update({ status: "revisions" })
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

  if (profile.role === "designer" && (isOwner || unclaimed)) {
    if (["backlog", "assigned", "revisions"].includes(ticket.status)) {
      actions.push(
        <Button
          key="start"
          variant="primary"
          size="sm"
          loading={busy === "start"}
          onClick={() => move("in_progress", "Clock started", "start")}
        >
          <Play size={13} fill="currentColor" />
          {ticket.status === "revisions" ? "Resume" : "Start working"}
        </Button>,
      );
    }

    if (ticket.status === "in_progress") {
      actions.push(
        <Button
          key="pause"
          size="sm"
          loading={busy === "pause"}
          onClick={() => move("assigned", "Paused — clock stopped", "pause")}
          title="Stops the clock and keeps the ticket yours"
        >
          <Pause size={13} /> Pause
        </Button>,
        <Button
          key="submit"
          variant="primary"
          size="sm"
          loading={busy === "submit"}
          onClick={() =>
            ticket.review_url ? void submitForReview() : setAskingForLink(true)
          }
        >
          <Send size={13} /> Submit for review
        </Button>,
      );
    }
  }

  if (isStaff) {
    if (ticket.status === "in_review" || ticket.status === "revisions") {
      actions.push(
        <Button key="revise" size="sm" onClick={() => setRevising(true)}>
          <RotateCcw size={13} /> Request revisions
        </Button>,
      );
    }
    if (ticket.status === "in_review") {
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
    if (ticket.status === "approved") {
      actions.push(
        <Button
          key="deliver"
          variant="primary"
          size="sm"
          loading={busy === "deliver"}
          onClick={() => move("delivered", "Marked delivered", "deliver")}
        >
          <Truck size={13} /> Mark delivered
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
            {ticket.status === "in_review"
              ? "With the strategist for review."
              : ticket.status === "delivered"
                ? "Delivered."
                : "Nothing for you to do here right now."}
          </p>
        )}
      </div>

      <Dialog
        open={askingForLink}
        onClose={() => setAskingForLink(false)}
        title="Where's the review link?"
        description="Paste the Frame.io share link so the strategist can watch it straight away."
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
        description="Say what needs to change. The designer sees this at the top of the ticket."
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
