"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ExternalLink, Link2, Pencil } from "lucide-react";
import type { Profile, TicketWithRefs } from "@/lib/types";
import { supabaseBrowser } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/queries";
import { Button, TextInput } from "@/components/ui/form";

/**
 * The review link is the handoff point of the whole workflow: deliverables
 * live in Frame.io, so what the ticket carries is the pointer to them. It sits
 * above everything else on the page because it's the thing both sides open.
 */
export function ReviewLink({
  ticket,
  profile,
}: {
  ticket: TicketWithRefs;
  profile: Profile;
}) {
  const supabase = supabaseBrowser();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(ticket.review_url ?? "");
  const [saving, setSaving] = useState(false);

  // Somebody else may have set it while this page was open.
  useEffect(() => {
    if (!editing) setValue(ticket.review_url ?? "");
  }, [ticket.review_url, editing]);

  const isOwner = ticket.assigned_to === profile.id;
  const canEdit = isOwner || profile.role === "admin" || profile.role === "strategist";

  async function save() {
    const trimmed = value.trim();
    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
      toast.error("That needs to be a full link, starting with https://");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("tickets")
      .update({ review_url: trimmed || null })
      .eq("id", ticket.id);
    setSaving(false);

    if (error) {
      toast.error(error.message.replace(/^.*?:\s*/, ""));
      return;
    }

    setEditing(false);
    queryClient.invalidateQueries({ queryKey: queryKeys.ticket(ticket.id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.tickets });
    toast.success(trimmed ? "Review link saved" : "Review link cleared");
  }

  if (ticket.review_url && !editing) {
    return (
      <section className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-md)]"
          style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
        >
          <Link2 size={15} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium">Review link</p>
          <p className="truncate text-[11.5px] text-[var(--color-ink-3)]">{ticket.review_url}</p>
        </div>

        <a
          href={ticket.review_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)]"
        >
          Open in Frame.io <ExternalLink size={13} />
        </a>

        {canEdit && (
          <button
            onClick={() => setEditing(true)}
            aria-label="Change review link"
            className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-ink)]"
          >
            <Pencil size={13} />
          </button>
        )}
      </section>
    );
  }

  if (!canEdit) {
    return (
      <section className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-line-strong)] px-4 py-3">
        <p className="text-[12.5px] text-[var(--color-ink-3)]">
          No Frame.io review link on this ticket yet.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
      <label htmlFor="review-url" className="text-[12px] font-medium">
        Frame.io review link
      </label>
      <p className="mt-0.5 text-[11.5px] text-[var(--color-ink-3)]">
        Paste the share link once the cut is up. This is what the strategist opens to review.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <TextInput
          id="review-url"
          autoFocus={editing}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void save();
            if (event.key === "Escape") {
              setValue(ticket.review_url ?? "");
              setEditing(false);
            }
          }}
          placeholder="https://f.io/…"
          className="!py-1.5 !text-[12.5px]"
        />
        <Button variant="primary" size="sm" loading={saving} onClick={() => void save()}>
          <Check size={13} /> Save
        </Button>
        {editing && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setValue(ticket.review_url ?? "");
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        )}
      </div>
    </section>
  );
}
