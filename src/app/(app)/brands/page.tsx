import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { fetchBrands } from "@/lib/queries";
import { BrandsClient } from "@/components/brands/brands-client";
import type { Brand } from "@/lib/types";

export const metadata: Metadata = { title: "Brands" };
export const dynamic = "force-dynamic";

export default async function BrandsPage() {
  const profile = await currentProfile();
  if (!profile) redirect("/login");
  if (profile.role === "designer") redirect("/my-day");

  const supabase = await supabaseServer();
  const brands = await fetchBrands(supabase);

  return <BrandsClient profile={profile} initialBrands={brands as Brand[]} />;
}
