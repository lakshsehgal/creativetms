import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { fetchBoardTickets } from "@/lib/queries";
import { MyDayClient } from "@/components/my-day/my-day-client";
import type { TicketWithRefs } from "@/lib/types";

export const metadata: Metadata = { title: "My Day" };
export const dynamic = "force-dynamic";

export default async function MyDayPage() {
  const profile = await currentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "designer") redirect("/tickets");

  const supabase = await supabaseServer();
  const tickets = await fetchBoardTickets(supabase);

  return (
    <MyDayClient
      profile={profile}
      initialTickets={tickets as TicketWithRefs[]}
    />
  );
}
