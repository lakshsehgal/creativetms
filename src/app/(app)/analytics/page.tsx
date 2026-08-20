import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { AnalyticsClient } from "@/components/analytics/analytics-client";
import type { FormatBenchmark, Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const profile = await currentProfile();
  if (!profile) redirect("/login");
  if (profile.role === "designer") redirect("/my-day");

  const supabase = await supabaseServer();
  const [benchmarks, designers] = await Promise.all([
    supabase.from("format_benchmarks").select("*"),
    supabase.from("profiles").select("*").eq("role", "designer").order("full_name"),
  ]);

  return (
    <AnalyticsClient
      profile={profile}
      benchmarks={(benchmarks.data ?? []) as FormatBenchmark[]}
      designers={(designers.data ?? []) as Profile[]}
    />
  );
}
