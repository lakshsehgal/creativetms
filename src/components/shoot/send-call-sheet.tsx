"use client";

import { useMemo, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Send, Users } from "lucide-react";
import type { Profile, Shoot } from "@/lib/types";
import { callSheetRecipients, crewCount } from "@/lib/shoot";
import { relativeTime } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { sendCallSheet } from "@/app/(app)/shoot/actions";
import { Button } from "@/components/ui/form";
import { Dialog, DialogFooter } from "@/components/ui/dialog";

/**
 * Sending the sheet out.
 *
 * The only action in this tool that reaches people outside it, and it can't be
 * taken back — so it says exactly who is about to get it, by name, before
 * anything goes. A count is not enough: "14 people" is the sort of thing you
 * agree to without reading, and the one time it matters is the time a client
 * address is sitting in the crew list.
 */
export function SendCallSheet({ shoot }: { shoot: Shoot }) {
  const supabase = supabaseBrowser();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const team = useQuery({
    queryKey: ["team", "emails"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("email, full_name, is_active");
      return (data ?? []) as Pick<Profile, "email" | "full_name" | "is_active">[];
    },
  });

  const recipients = useMemo(
    () => callSheetRecipients(shoot.doc.crew, team.data ?? []),
    [shoot.doc.crew, team.data],
  );

  const studio = recipients.filter((person) => person.from === "team");
  const crew = recipients.filter((person) => person.from === "crew");
  const unreachable = shoot.doc.crew
    .flatMap((group) => group.members)
    .filter((member) => member.name.trim() && !member.email.trim()).length;

  function send() {
    startTransition(async () => {
      const result = await sendCallSheet(shoot.id);
      if (!result.ok) {
        toast.error("Not sent", { description: result.error, duration: 14_000 });
        return;
      }
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["shoots"] });
      toast.success(`Sent to ${result.count} ${result.count === 1 ? "person" : "people"}`);
    });
  }

  return (
    <>
      <Button size="sm" variant={shoot.sent_at ? "ghost" : "primary"} onClick={() => setOpen(true)}>
        {shoot.sent_at ? (
          <>
            <Check size={13} /> Sent
          </>
        ) : (
          <>
            <Send size={13} /> Send
          </>
        )}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={shoot.sent_at ? "Send it again" : "Send the call sheet"}
        description="Everyone below gets the whole sheet in their inbox. Replies come back to you."
        width={480}
      >
        {shoot.sent_at && (
          <p className="mb-3 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] px-2.5 py-2 text-[11.5px] leading-relaxed text-[var(--color-ink-2)]">
            Already sent {relativeTime(shoot.sent_at)} to {shoot.sent_to.length}{" "}
            {shoot.sent_to.length === 1 ? "address" : "addresses"}. Sending again
            delivers the current version — useful when something moved, noise
            when it hasn&apos;t.
          </p>
        )}

        {team.isLoading ? (
          <div className="skeleton h-24" />
        ) : recipients.length === 0 ? (
          <p className="rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] px-3 py-3 text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">
            Nobody to send it to. Nobody on the team has an active account, and
            no crew member on this sheet has an email against them.
          </p>
        ) : (
          <>
            <Group label="The studio" people={studio} />
            <Group label="Crew and guests" people={crew} />
          </>
        )}

        {unreachable > 0 && (
          <p className="mt-3 flex items-start gap-2 text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">
            <Users size={12} className="mt-0.5 shrink-0" />
            <span>
              {unreachable} {unreachable === 1 ? "person on the crew has" : "people on the crew have"}{" "}
              no email on the sheet, so {unreachable === 1 ? "they won't" : "they won't"} get it. Add
              one against {unreachable === 1 ? "their name" : "their names"} if{" "}
              {unreachable === 1 ? "they need" : "they need"} it.
            </span>
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={pending}
            disabled={recipients.length === 0}
            onClick={send}
          >
            <Send size={13} />
            {shoot.sent_at ? "Send again" : "Send"} to {recipients.length}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}

function Group({
  label,
  people,
}: {
  label: string;
  people: { email: string; name: string }[];
}) {
  if (people.length === 0) return null;
  return (
    <div className="mt-3 first:mt-0">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-3)]">
        {label} · {people.length}
      </p>
      <ul className="mt-1.5 space-y-0.5">
        {people.map((person) => (
          <li key={person.email} className="flex items-baseline gap-2 text-[12px]">
            <span className="font-medium">{person.name}</span>
            <span className="truncate text-[11px] text-[var(--color-ink-3)]">{person.email}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Re-exported so the editor header can show the crew size beside the button. */
export { crewCount };
