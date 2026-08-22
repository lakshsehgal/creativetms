import type { SupabaseClient } from "@supabase/supabase-js";
import type { TicketWithRefs } from "@/lib/types";

/**
 * Both `assigned_to` and `created_by` point at `profiles`, so PostgREST needs
 * the constraint name to know which join is which.
 */
export const TICKET_SELECT = `
  *,
  brand:brands ( id, name, color ),
  assignee:profiles!tickets_assigned_to_fkey ( id, full_name, email, avatar_url ),
  author:profiles!tickets_created_by_fkey ( id, full_name, email, avatar_url )
`;

export const queryKeys = {
  tickets: ["tickets"] as const,
  ticket: (id: string) => ["ticket", id] as const,
  ticketTime: ["ticket-time"] as const,
  comments: (id: string) => ["comments", id] as const,
  events: (id: string) => ["events", id] as const,
  revisions: (id: string) => ["revisions", id] as const,
  attachments: (id: string) => ["attachments", id] as const,
  team: ["team"] as const,
  brands: ["brands"] as const,
  benchmarks: ["benchmarks"] as const,
  scorecards: (scope: string) => ["scorecards", scope] as const,
  analytics: (range: string) => ["analytics", range] as const,
};

/**
 * Board payload. Delivered tickets are excluded — they live in Analytics, and
 * keeping them out is what stops the board getting heavier every week.
 */
export async function fetchBoardTickets(
  supabase: SupabaseClient,
): Promise<TicketWithRefs[]> {
  const { data, error } = await supabase
    .from("tickets")
    .select(TICKET_SELECT)
    .neq("status", "approved")
    .order("position", { ascending: true })
    .limit(500);

  if (error) throw error;
  return (data ?? []) as unknown as TicketWithRefs[];
}

/**
 * Elapsed time per ticket. Separate query so the board renders before it
 * lands, and scoped to the tickets on screen — unscoped it returned a row for
 * every ticket ever created, which only gets slower every week.
 */
export async function fetchTicketTime(supabase: SupabaseClient, ticketIds: string[]) {
  if (ticketIds.length === 0) return [];
  const { data, error } = await supabase
    .from("ticket_time")
    .select("ticket_id, total_seconds, is_running")
    .in("ticket_id", ticketIds);
  if (error) throw error;
  return (data ?? []) as { ticket_id: string; total_seconds: number; is_running: boolean }[];
}

export async function fetchTeam(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("role")
    .order("full_name");
  if (error) throw error;
  return data ?? [];
}

export async function fetchBrands(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("brands").select("*").order("name");
  if (error) throw error;
  return data ?? [];
}

export async function fetchBenchmarks(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("format_benchmarks").select("*");
  if (error) throw error;
  return data ?? [];
}

/**
 * Board ordering. Cards carry a float position, so dropping between two
 * neighbours is one UPDATE with their midpoint instead of renumbering a column.
 */
export function positionBetween(before?: number, after?: number): number {
  if (before == null && after == null) return Date.now();
  if (before == null) return after! - 1000;
  if (after == null) return before + 1000;
  return (before + after) / 2;
}
