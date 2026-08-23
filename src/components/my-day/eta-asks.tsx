"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HelpCircle } from "lucide-react";
import type { TicketWithRefs } from "@/lib/types";
import { ETA_PRESETS, etaLabel } from "@/lib/eta";
import { supabaseBrowser } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/queries";
import { reportWriteFailure, withRetry } from "@/lib/write";
import { Card } from "@/components/ui/primitives";

/**
 * "When will this land?" — the open questions, answerable from here.
 *
 * A notification is a moment and it scrolls away. Somebody waiting on a date
 * is a state, so it sits at the top of My Day until it's answered and then
 * disappears on its own.
 *
 * The quick picks are the whole design. A designer who has to open the ticket,
 * find the panel and operate a date picker to say "end of tomorrow" will mostly
 * not bother, and an estimate nobody gives is worse than no system at all.
 */
export function EtaAsks({ tickets }: { tickets: TicketWithRefs[] }) {
  const supabase = supabaseBrowser();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);

  const asked = tickets.filter(
    (ticket) => ticket.eta_requested_at && !ticket.eta_at && ticket.status !== "approved",
  );

  if (asked.length === 0) return null;

  async function answer(ticket: TicketWithRefs, at: Date) {
    setSaving(ticket.id);
    const { error } = await withRetry(() =>
      supabase.from("tickets").update({ eta_at: at.toISOString() }).eq("id", ticket.id),
    );
    setSaving(null);
    if (error) {
      reportWriteFailure(error.message, "that estimate", () => void answer(ticket, at));
      return;
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.tickets });
    queryClient.invalidateQueries({ queryKey: queryKeys.ticket(ticket.id) });
    toast.success(`Told them: ${etaLabel(at.toISOString())}`);
  }

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-line)] px-4 py-3">
        <HelpCircle size={14} style={{ color: "var(--color-serious)" }} />
        <h2 className="text-[13px] font-semibold tracking-tight">
          {asked.length === 1 ? "Somebody's waiting on a date" : `${asked.length} people are waiting on a date`}
        </h2>
        <span className="text-[11.5px] text-[var(--color-ink-3)]">
          a rough one is fine — you can move it later
        </span>
      </div>

      <ul>
        {asked.map((ticket) => (
          <li
            key={ticket.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--color-line)] px-4 py-2.5 last:border-0"
          >
            <Link
              href={`/tickets/${ticket.id}`}
              className="min-w-0 flex-1 truncate text-[12.5px] font-medium hover:underline"
            >
              <span className="tabular text-[var(--color-ink-3)]">#{ticket.number}</span>{" "}
              {ticket.title}
            </Link>

            <span className="flex flex-wrap items-center gap-1.5">
              {ETA_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  disabled={saving === ticket.id}
                  onClick={() => void answer(ticket, preset.at(new Date()))}
                  className="rounded-[var(--radius-sm)] border border-[var(--color-line)] px-2 py-1 text-[11px] text-[var(--color-ink-2)] transition-colors hover:border-[var(--color-line-strong)] hover:text-[var(--color-ink)] disabled:opacity-50"
                >
                  {preset.label}
                </button>
              ))}
              <Link
                href={`/tickets/${ticket.id}`}
                className="px-1 text-[11px] text-[var(--color-ink-3)] underline underline-offset-2 hover:text-[var(--color-ink)]"
              >
                another date
              </Link>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
