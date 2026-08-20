import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { TICKET_SELECT } from "@/lib/queries";
import { TicketDetail } from "@/components/ticket/ticket-detail";
import type { Brand, FormatBenchmark, Profile, TicketWithRefs } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data } = await supabase.from("tickets").select("number, title").eq("id", id).maybeSingle();
  return { title: data ? `#${data.number} ${data.title}` : "Ticket" };
}

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await currentProfile();
  if (!profile) redirect("/login");

  const supabase = await supabaseServer();

  const [ticketResult, benchmarks, designers, brands] = await Promise.all([
    supabase.from("tickets").select(TICKET_SELECT).eq("id", id).maybeSingle(),
    supabase.from("format_benchmarks").select("*"),
    supabase
      .from("profiles")
      .select("*")
      .eq("role", "designer")
      .eq("is_active", true)
      .order("full_name"),
    supabase.from("brands").select("*").order("name"),
  ]);

  // RLS returns nothing rather than a 403, so "not visible" and "not there"
  // land in the same place — which is the right answer for both.
  if (!ticketResult.data) notFound();

  return (
    <TicketDetail
      profile={profile}
      initialTicket={ticketResult.data as unknown as TicketWithRefs}
      benchmarks={(benchmarks.data ?? []) as FormatBenchmark[]}
      designers={(designers.data ?? []) as Profile[]}
      brands={(brands.data ?? []) as Brand[]}
    />
  );
}
