import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { TeamClient } from "@/components/team/team-client";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Team" };
export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const profile = await currentProfile();
  if (!profile) redirect("/login");
  // Operators run the floor: they set capacity and keep brands tidy. What they
  // cannot do — touch an admin's role or access, or hand out shoot ops — is
  // enforced by the profiles guard in the database, not by hiding a button.
  if (profile.role !== "admin" && profile.role !== "operator") redirect("/tickets");

  const supabase = await supabaseServer();
  const team = await supabase.from("profiles").select("*").order("full_name");

  return (
    <TeamClient
      profile={profile}
      team={(team.data ?? []) as Profile[]}
    />
  );
}
