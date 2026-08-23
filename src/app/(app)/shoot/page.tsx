import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { canRunShoots, type Profile } from "@/lib/types";
import { ShootClient } from "@/components/shoot/shoot-client";

export const metadata: Metadata = { title: "Shoot" };
export const dynamic = "force-dynamic";

export default async function ShootPage() {
  const profile = await currentProfile();
  if (!profile) redirect("/login");

  // Admins and operators, plus any strategist an admin has given shoot ops to.
  // The database says the same thing in can_run_shoots() — this redirect is
  // only so the door isn't there to walk into.
  if (!canRunShoots(profile)) redirect("/tickets");

  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("is_active", true)
    .order("full_name");

  const team = (data ?? []) as Profile[];

  return (
    <ShootClient
      profile={profile}
      designers={team.filter((person) => person.role === "designer")}
    />
  );
}
