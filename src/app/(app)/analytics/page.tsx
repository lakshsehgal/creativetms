import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { AnalyticsClient } from "@/components/analytics/analytics-client";
import type { Profile } from "@/lib/types";
import { canSeeAllTime } from "@/lib/types";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const profile = await currentProfile();
  if (!profile) redirect("/login");
  // Everything on this page is tracked time, and tracked time is for the
  // admin and the operator only. Designers go to their day; a strategist to
  // the tickets.
  if (profile.role === "designer") redirect("/my-day");
  if (!canSeeAllTime(profile.role)) redirect("/tickets");

  const supabase = await supabaseServer();
  const designers = await supabase
    .from("profiles")
    .select("*")
    .eq("role", "designer")
    .order("full_name");

  return (
    <AnalyticsClient
      profile={profile}
      designers={(designers.data ?? []) as Profile[]}
    />
  );
}
