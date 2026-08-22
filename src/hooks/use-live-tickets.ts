"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import { fetchBoardTickets, fetchTicketTime, queryKeys, TICKET_SELECT } from "@/lib/queries";
import type { TicketWithRefs } from "@/lib/types";

/**
 * Board data with live updates.
 *
 * Realtime gives us the changed row but not its joined brand/assignee, so a
 * push patches the cache in place and re-reads just that one row's relations.
 * The alternative — refetching the whole board on every keystroke somebody
 * else makes — is exactly the lag this tool is meant to avoid.
 */
export function useLiveTickets(initial: TicketWithRefs[]) {
  const queryClient = useQueryClient();
  const supabase = supabaseBrowser();

  const tickets = useQuery({
    queryKey: queryKeys.tickets,
    queryFn: () => fetchBoardTickets(supabase),
    initialData: initial,
  });

  const ticketIds = (tickets.data ?? []).map((ticket) => ticket.id);

  const times = useQuery({
    // Keyed on the id set so it refetches when the board's contents change,
    // not on every render.
    queryKey: [...queryKeys.ticketTime, ticketIds.length],
    queryFn: () => fetchTicketTime(supabase, ticketIds),
    enabled: ticketIds.length > 0,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("board")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tickets" },
        async (payload: RealtimePostgresChangesPayload<{ id: string }>) => {
          const id =
            (payload.new as { id?: string })?.id ?? (payload.old as { id?: string })?.id;
          if (!id) return;

          if (payload.eventType === "DELETE") {
            queryClient.setQueryData<TicketWithRefs[]>(queryKeys.tickets, (rows) =>
              (rows ?? []).filter((row) => row.id !== id),
            );
            return;
          }

          const { data } = await supabase
            .from("tickets")
            .select(TICKET_SELECT)
            .eq("id", id)
            .maybeSingle();
          if (!data) return;

          const fresh = data as unknown as TicketWithRefs;
          queryClient.setQueryData<TicketWithRefs[]>(queryKeys.tickets, (rows) => {
            const list = rows ?? [];
            const at = list.findIndex((row) => row.id === fresh.id);
            if (fresh.status === "approved") return list.filter((row) => row.id !== fresh.id);
            if (at === -1) return [...list, fresh];
            const copy = list.slice();
            copy[at] = fresh;
            return copy;
          });
          queryClient.invalidateQueries({ queryKey: queryKeys.ticket(fresh.id) });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, supabase]);

  const timeById = new Map(times.data?.map((row) => [row.ticket_id, row]) ?? []);

  return {
    tickets: (tickets.data ?? []).map((ticket) => ({
      ...ticket,
      total_seconds: timeById.get(ticket.id)?.total_seconds ?? 0,
      is_running: timeById.get(ticket.id)?.is_running ?? false,
    })),
    isLoading: tickets.isLoading,
  };
}
