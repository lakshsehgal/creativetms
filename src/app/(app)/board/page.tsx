import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { fetchBoardTickets, fetchBrands } from "@/lib/queries";
import { BoardClient } from "@/components/board/board-client";
import type { Brand, Profile, TicketWithRefs } from "@/lib/types";

export const metadata: Metadata = { title: "Board" };
export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const profile = await currentProfile();
  if (!profile) redirect("/login");

  const supabase = await supabaseServer();

  // Rendered on the server so the board arrives painted, not as a spinner.
  const [tickets, brands, designers] = await Promise.all([
    fetchBoardTickets(supabase),
    fetchBrands(supabase),
    supabase
      .from("profiles")
      .select("*")
      .eq("role", "designer")
      .eq("is_active", true)
      .order("full_name")
      .then((result) => (result.data ?? []) as Profile[]),
  ]);

  return (
    <BoardClient
      profile={profile}
      initialTickets={tickets as TicketWithRefs[]}
      brands={brands as Brand[]}
      designers={designers}
    />
  );
}
