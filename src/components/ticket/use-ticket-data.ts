"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabase/client";
import { queryKeys, TICKET_SELECT } from "@/lib/queries";
import type {
  Attachment,
  Deliverable,
  TicketComment,
  TicketEvent,
  TicketRevision,
  TicketWithRefs,
  WorkSession,
} from "@/lib/types";

/**
 * Everything hanging off one ticket, kept live.
 *
 * Comments and the ticket row come over realtime; the rest is small enough
 * that refetching on change is cheaper than more subscriptions.
 */
export function useTicketData(id: string, initial: TicketWithRefs) {
  const supabase = supabaseBrowser();
  const queryClient = useQueryClient();

  const ticket = useQuery({
    queryKey: queryKeys.ticket(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select(TICKET_SELECT)
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as unknown as TicketWithRefs;
    },
    initialData: initial,
  });

  const comments = useQuery({
    queryKey: queryKeys.comments(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comments")
        .select("*, author:profiles!comments_author_id_fkey ( id, full_name, email, avatar_url )")
        .eq("ticket_id", id)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as TicketComment[];
    },
  });

  const events = useQuery({
    queryKey: queryKeys.events(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_events")
        .select("*, actor:profiles!ticket_events_actor_id_fkey ( id, full_name, email, avatar_url )")
        .eq("ticket_id", id)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as unknown as TicketEvent[];
    },
  });

  const revisions = useQuery({
    queryKey: queryKeys.revisions(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_revisions")
        .select(
          "*, requester:profiles!ticket_revisions_requested_by_fkey ( id, full_name, email, avatar_url )",
        )
        .eq("ticket_id", id)
        .order("round", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as TicketRevision[];
    },
  });

  const attachments = useQuery({
    queryKey: queryKeys.attachments(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attachments")
        .select("*")
        .eq("ticket_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Attachment[];
    },
  });

  const deliverables = useQuery({
    queryKey: ["deliverables", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deliverables")
        .select("*")
        .eq("ticket_id", id)
        .order("version", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Deliverable[];
    },
  });

  /** Sessions this viewer is allowed to see: their own, or all if admin. */
  const sessions = useQuery({
    queryKey: ["sessions", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_sessions")
        .select("*")
        .eq("ticket_id", id)
        .order("started_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WorkSession[];
    },
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel(`ticket:${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comments", filter: `ticket_id=eq.${id}` },
        () => queryClient.invalidateQueries({ queryKey: queryKeys.comments(id) }),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tickets", filter: `id=eq.${id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.ticket(id) });
          queryClient.invalidateQueries({ queryKey: queryKeys.events(id) });
          queryClient.invalidateQueries({ queryKey: ["sessions", id] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, queryClient, supabase]);

  return { ticket, comments, events, revisions, attachments, sessions, deliverables };
}
