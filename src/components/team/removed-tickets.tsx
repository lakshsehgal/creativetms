"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RotateCcw, Trash2 } from "lucide-react";
import type { TicketWithRefs } from "@/lib/types";
import { relativeTime } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { queryKeys, TICKET_SELECT } from "@/lib/queries";
import { Card, FormatBadge, StatusPill } from "@/components/ui/primitives";
import { Button } from "@/components/ui/form";

/**
 * The bin.
 *
 * Removing a ticket stamps the row rather than destroying it, which is only
 * half a promise unless there is somewhere to go and get it back. Admins see
 * removed tickets here with the status they were in when they went.
 */
export function RemovedTickets() {
  const supabase = supabaseBrowser();
  const queryClient = useQueryClient();

  const removed = useQuery({
    queryKey: ["removed-tickets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select(TICKET_SELECT)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as TicketWithRefs[];
    },
  });

  async function restore(ticket: TicketWithRefs) {
    const { error } = await supabase.rpc("restore_ticket", { p_ticket_id: ticket.id });
    if (error) {
      toast.error(error.message.replace(/^.*?:\s*/, ""));
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["removed-tickets"] });
    queryClient.invalidateQueries({ queryKey: queryKeys.tickets });
    toast.success(`#${ticket.number} is back on the board`);
  }

  const rows = removed.data ?? [];

  return (
    <Card padded={false}>
      <div className="flex items-center gap-2 border-b border-[var(--color-line)] px-4 py-2.5">
        <Trash2 size={13} className="text-[var(--color-ink-3)]" />
        <h2 className="text-[12.5px] font-semibold tracking-tight">Removed tickets</h2>
        <span className="text-[11.5px] text-[var(--color-ink-3)]">
          {rows.length === 0 ? "nothing removed" : `${rows.length} kept`}
        </span>
      </div>

      {removed.isLoading ? (
        <div className="skeleton m-4 h-16" />
      ) : rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-[12.5px] text-[var(--color-ink-3)]">
          Nothing has been removed. When something is, it lands here rather
          than disappearing — the comments, activity and any tracked time come
          back with it.
        </p>
      ) : (
        <ul>
          {rows.map((ticket) => (
            <li
              key={ticket.id}
              className="flex items-center gap-3 border-b border-[var(--color-line)] px-4 py-2 last:border-0"
            >
              <span className="tabular shrink-0 text-[10.5px] text-[var(--color-ink-3)]">
                #{ticket.number}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px]">{ticket.title}</span>
              <FormatBadge format={ticket.format} quantity={ticket.quantity} />
              <StatusPill status={ticket.status} />
              <span
                suppressHydrationWarning
                className="shrink-0 text-[11px] text-[var(--color-ink-3)]"
              >
                removed {relativeTime(ticket.deleted_at)}
              </span>
              <Button size="sm" variant="ghost" onClick={() => void restore(ticket)}>
                <RotateCcw size={12} /> Restore
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
