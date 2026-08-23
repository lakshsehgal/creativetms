"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ExternalLink, Link2, Pencil } from "lucide-react";
import type { Deliverable, Profile, TicketWithRefs } from "@/lib/types";
import { phaseMeta } from "@/lib/types";
import { relativeTime } from "@/lib/format";
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
  versions = [],
}: {
  ticket: TicketWithRefs;
  profile: Profile;
  versions?: Deliverable[];
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
  // Only the designer doing the work posts the link — a strategist supplying
  // it would break the one signal that says the work is actually ready.
  // Admins keep the ability to fix a bad paste.
  const canEdit = isOwner || profile.role === "admin";

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
          <p className="flex items-center gap-1.5 text-[12px] font-medium">
            Review link
            {/* The link can be swapped in place, and whoever was already sent
                it has no way of knowing. Saying so is the whole job — the
                activity feed below carries the link it replaced. */}
            {ticket.review_url_edited_at && (
              <span
                suppressHydrationWarning
                title={`This link was changed ${relativeTime(
                  ticket.review_url_edited_at,
                )} — the one it replaced is in the activity feed`}
                className="rounded-[3px] px-1 py-px text-[10px] font-normal"
                style={{
                  background: "var(--color-surface-3)",
                  color: "var(--color-ink-3)",
                }}
              >
                edited
              </span>
            )}
          </p>
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

        {/* Earlier cuts stay reachable — seeing V1 next to V3 is how you tell
            whether the notes actually landed. */}
        {versions.length > 1 && (
          <ul className="flex w-full flex-wrap items-center gap-1.5 border-t border-[var(--color-line)] pt-2.5">
            <span className="text-[11px] text-[var(--color-ink-3)]">Earlier</span>
            {versions.slice(1).map((version) => (
              <li key={version.id}>
                <a
                  href={version.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`${phaseMeta(version.phase).label} · ${new Date(
                    version.created_at,
                  ).toLocaleDateString()}`}
                  className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-line)] px-1.5 py-0.5 text-[11px] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                >
                  V{version.version}
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: phaseMeta(version.phase).tone }}
                  />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  if (!canEdit) {
    return (
      <section className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-line-strong)] px-4 py-3">
        <p className="text-[12.5px] text-[var(--color-ink-3)]">
          No Frame.io link yet — it arrives when the designer marks this Ready
          for Approval.
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
