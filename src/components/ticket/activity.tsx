"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Send } from "lucide-react";
import type { Profile, TicketComment, TicketEvent, TicketStatus } from "@/lib/types";
import { STATUSES } from "@/lib/types";
import { relativeTime } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/queries";
import { Avatar } from "@/components/ui/primitives";
import { Button, TextArea } from "@/components/ui/form";

type Entry =
  | { kind: "comment"; at: string; data: TicketComment }
  | { kind: "event"; at: string; data: TicketEvent };

export function Activity({
  ticketId,
  profile,
  comments,
  events,
  team,
}: {
  ticketId: string;
  profile: Profile;
  comments: TicketComment[];
  events: TicketEvent[];
  team: Profile[];
}) {
  const supabase = supabaseBrowser();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const nameById = useMemo(
    () => new Map(team.map((person) => [person.id, person.full_name || person.email])),
    [team],
  );

  const timeline = useMemo(() => {
    const entries: Entry[] = [
      ...comments.map((comment) => ({ kind: "comment" as const, at: comment.created_at, data: comment })),
      ...events
        // Assignment churn is noise unless it actually landed on somebody.
        .filter((event) => event.kind !== "assigned" || event.to_value)
        .map((event) => ({ kind: "event" as const, at: event.created_at, data: event })),
    ];
    return entries.sort((a, b) => a.at.localeCompare(b.at));
  }, [comments, events]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text) return;

    setSending(true);
    const { error } = await supabase
      .from("comments")
      .insert({ ticket_id: ticketId, author_id: profile.id, body: text });
    setSending(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    setBody("");
    queryClient.invalidateQueries({ queryKey: queryKeys.comments(ticketId) });
  }

  return (
    <section>
      <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.07em] text-[var(--color-ink-3)]">
        Activity
      </h3>

      <ol className="space-y-3">
        {timeline.map((entry) =>
          entry.kind === "comment" ? (
            <li key={entry.data.id} className="flex gap-2.5">
              <Avatar
                id={entry.data.author_id}
                name={entry.data.author?.full_name ?? ""}
                email={entry.data.author?.email}
                size={26}
              />
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-2">
                  <span className="text-[12.5px] font-medium">
                    {entry.data.author?.full_name || entry.data.author?.email || "Someone"}
                  </span>
                  <span className="text-[11px] text-[var(--color-ink-3)]">
                    {relativeTime(entry.at)}
                  </span>
                </p>
                <p className="mt-1 whitespace-pre-wrap rounded-[var(--radius-md)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] leading-relaxed">
                  {entry.data.body}
                </p>
              </div>
            </li>
          ) : (
            <li
              key={entry.data.id}
              className="flex items-center gap-2.5 pl-[34px] text-[11.5px] text-[var(--color-ink-3)]"
            >
              <span className="h-1 w-1 shrink-0 rounded-full bg-[var(--color-line-strong)]" />
              <span>
                <span className="text-[var(--color-ink-2)]">
                  {entry.data.actor?.full_name || entry.data.actor?.email || "Someone"}
                </span>{" "}
                {describe(entry.data, nameById)}
              </span>
              <span className="ml-auto shrink-0">{relativeTime(entry.at)}</span>
            </li>
          ),
        )}
      </ol>

      <form onSubmit={send} className="mt-4 flex items-end gap-2">
        <TextArea
          rows={2}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends; Shift+Enter is a newline. Faster for the common case.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send(event);
            }
          }}
          placeholder="Add a note…"
          className="!py-2 !text-[13px]"
        />
        <Button type="submit" variant="primary" size="sm" loading={sending} disabled={!body.trim()}>
          <Send size={13} />
        </Button>
      </form>
    </section>
  );
}

function describe(event: TicketEvent, names: Map<string, string>): string {
  if (event.kind === "created") return "raised this ticket";
  if (event.kind === "status") {
    const to = STATUSES[event.to_value as TicketStatus]?.label ?? event.to_value;
    return `moved it to ${to}`;
  }
  if (event.kind === "assigned") {
    const who = event.to_value ? (names.get(event.to_value) ?? "a designer") : null;
    return who ? `assigned it to ${who}` : "unassigned it";
  }
  return event.kind;
}
