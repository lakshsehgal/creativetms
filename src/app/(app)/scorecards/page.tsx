import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { ScorecardsClient } from "@/components/scorecards/scorecards-client";
import type { FormatBenchmark, Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Scorecards" };
export const dynamic = "force-dynamic";

export default async function ScorecardsPage() {
  const profile = await currentProfile();
  if (!profile) redirect("/login");
  // Strategists get delivery status, never timing data.
  if (profile.role === "strategist") redirect("/analytics");

  const supabase = await supabaseServer();
  const [designers, benchmarks] = await Promise.all([
    supabase.from("profiles").select("*").eq("role", "designer").order("full_name"),
    supabase.from("format_benchmarks").select("*"),
  ]);

  return (
    <ScorecardsClient
      profile={profile}
      designers={(designers.data ?? []) as Profile[]}
      benchmarks={(benchmarks.data ?? []) as FormatBenchmark[]}
    />
  );
}
