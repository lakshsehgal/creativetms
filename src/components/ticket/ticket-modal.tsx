"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Brand, FormatBenchmark, Profile, TicketWithRefs } from "@/lib/types";
import { supabaseBrowser } from "@/lib/supabase/client";
import { TICKET_SELECT, queryKeys } from "@/lib/queries";
import { TicketDetail } from "./ticket-detail";

/**
 * A ticket opened over whatever you were looking at.
 *
 * Most of the day is spent scanning the list and dipping into one ticket, so
 * a full navigation there and back loses your scroll position and your place.
 * Expand promotes it to the real page when someone wants to settle in.
 */
export function TicketModal({
  ticketId,
  profile,
  brands,
  designers,
  onClose,
}: {
  ticketId: string;
  profile: Profile;
  brands: Brand[];
  designers: Profile[];
  onClose: () => void;
}) {
  const supabase = supabaseBrowser();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Stop the page behind from scrolling while this is open.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const ticket = useQuery({
    queryKey: queryKeys.ticket(ticketId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select(TICKET_SELECT)
        .eq("id", ticketId)
        .single();
      if (error) throw error;
      return data as unknown as TicketWithRefs;
    },
  });

  const benchmarks = useQuery({
    queryKey: queryKeys.benchmarks,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("format_benchmarks").select("*");
      if (error) throw error;
      return (data ?? []) as FormatBenchmark[];
    },
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 p-4 backdrop-blur-[2px] sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Ticket"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="rise flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-line-strong)] bg-[var(--color-canvas)] shadow-[var(--shadow-pop)]"
      >
        {ticket.isLoading || !ticket.data ? (
          <div className="space-y-3 p-6">
            <div className="skeleton h-6 w-40" />
            <div className="skeleton h-9 w-2/3" />
            <div className="skeleton h-32" />
          </div>
        ) : (
          <TicketDetail
            variant="modal"
            onClose={onClose}
            profile={profile}
            initialTicket={ticket.data}
            benchmarks={benchmarks.data ?? []}
            designers={designers}
            brands={brands}
          />
        )}
      </div>
    </div>
  );
}
