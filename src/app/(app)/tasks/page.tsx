import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { fetchTasks } from "@/lib/queries";
import { TasksClient } from "@/components/tasks/tasks-client";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Tasks" };
export const dynamic = "force-dynamic";

/**
 * The strategists' own list. Admins can see it so nothing a strategist leaves
 * behind is invisible to whoever covers; nobody else gets here at all — the
 * policy refuses the rows, and the redirect means they never see an empty page
 * asking them to wonder why.
 */
export default async function TasksPage() {
  const profile = await currentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "strategist" && profile.role !== "admin") {
    redirect(profile.role === "designer" ? "/my-day" : "/tickets");
  }

  const supabase = await supabaseServer();
  const [tasks, staff] = await Promise.all([
    fetchTasks(supabase),
    supabase
      .from("profiles")
      .select("*")
      .eq("is_active", true)
      .in("role", ["strategist", "admin"])
      .order("full_name")
      .then((result) => (result.data ?? []) as Profile[]),
  ]);

  return <TasksClient profile={profile} initialTasks={tasks} staff={staff} />;
}
