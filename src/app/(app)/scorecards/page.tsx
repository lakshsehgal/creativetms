import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { ScorecardsClient } from "@/components/scorecards/scorecards-client";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Scorecards" };
export const dynamic = "force-dynamic";

export default async function ScorecardsPage() {
  const profile = await currentProfile();
  if (!profile) redirect("/login");
  // Per-designer numbers stay with admins, operators and the designer.
  if (profile.role === "strategist") redirect("/analytics");

  const supabase = await supabaseServer();
  const designers = await supabase
    .from("profiles")
    .select("*")
    .eq("role", "designer")
    .order("full_name");

  return (
    <ScorecardsClient
      profile={profile}
      designers={(designers.data ?? []) as Profile[]}
    />
  );
}
