import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { fetchBenchmarks, fetchBoardTickets, fetchBrands } from "@/lib/queries";
import { WorkClient } from "@/components/work/work-client";
import type { Brand, FormatBenchmark, Profile, TicketWithRefs } from "@/lib/types";

export const metadata: Metadata = { title: "Tickets" };
export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const profile = await currentProfile();
  if (!profile) redirect("/login");

  const supabase = await supabaseServer();

  // Rendered on the server so the board arrives painted, not as a spinner.
  const [tickets, brands, benchmarks, team] = await Promise.all([
    fetchBoardTickets(supabase),
    fetchBrands(supabase),
    fetchBenchmarks(supabase),
    supabase
      .from("profiles")
      .select("*")
      .eq("is_active", true)
      .order("full_name")
      .then((result) => (result.data ?? []) as Profile[]),
  ]);

  return (
    <Suspense fallback={<div className="skeleton m-5 h-64" />}>
      <WorkClient
        profile={profile}
        initialTickets={tickets as TicketWithRefs[]}
        brands={brands as Brand[]}
        benchmarks={benchmarks as FormatBenchmark[]}
        designers={team.filter((person) => person.role === "designer")}
        strategists={team.filter((person) => person.role !== "designer")}
      />
    </Suspense>
  );
}
