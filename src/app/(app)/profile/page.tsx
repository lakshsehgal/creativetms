import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentProfile } from "@/lib/supabase/server";
import { ProfileClient } from "@/components/profile/profile-client";

export const metadata: Metadata = { title: "Your profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const profile = await currentProfile();
  if (!profile) redirect("/login");
  return <ProfileClient profile={profile} />;
}
