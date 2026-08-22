"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentProfile, supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

/** Every action re-checks the caller server-side. The UI hiding a button is not a permission. */
async function requireAdmin() {
  const profile = await currentProfile();
  if (!profile || profile.role !== "admin" || !profile.is_active) {
    throw new Error("Admins only");
  }
  return profile;
}

const inviteSchema = z.object({
  email: z.string().email("That isn't a valid email address"),
  full_name: z.string().max(120).default(""),
  role: z.enum(["admin", "strategist", "designer"]),
});

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

export async function inviteTeammate(formData: FormData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    const parsed = inviteSchema.safeParse({
      email: String(formData.get("email") ?? "").trim().toLowerCase(),
      full_name: String(formData.get("full_name") ?? "").trim(),
      role: String(formData.get("role") ?? "designer"),
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    const service = supabaseAdmin();

    // The invite row is what actually grants the role — the trigger on sign-up
    // reads it. Sending the email is a convenience on top.
    const { error } = await service.from("invites").upsert(
      {
        email: parsed.data.email,
        role: parsed.data.role,
        full_name: parsed.data.full_name,
        invited_by: admin.id,
        accepted_at: null,
      },
      { onConflict: "email" },
    );

    if (error) return { ok: false, error: error.message };

    // If someone already has an account, just move them onto the new role.
    const { data: existing } = await service
      .from("profiles")
      .select("id")
      .eq("email", parsed.data.email)
      .maybeSingle();

    if (existing) {
      await service
        .from("profiles")
        .update({ role: parsed.data.role, is_active: true })
        .eq("id", existing.id);
      revalidatePath("/team");
      return { ok: true, message: `${parsed.data.email} is now a ${parsed.data.role}` };
    }

    const { error: mailError } = await service.auth.admin.inviteUserByEmail(parsed.data.email, {
      data: { full_name: parsed.data.full_name },
    });

    revalidatePath("/team");

    // A missing SMTP setup shouldn't look like a failed invite — the row is
    // saved either way, and they can sign in with a code whenever they like.
    return {
      ok: true,
      message: mailError
        ? `Invite saved. Couldn't send the email (${mailError.message}) — they can still sign in with a code.`
        : `Invite emailed to ${parsed.data.email}`,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Something went wrong" };
  }
}

export async function setRole(userId: string, role: UserRole): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    if (admin.id === userId) {
      return { ok: false, error: "You can't change your own role" };
    }

    const { error } = await supabaseAdmin().from("profiles").update({ role }).eq("id", userId);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/team");
    return { ok: true, message: "Role updated" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Something went wrong" };
  }
}

export async function setActive(userId: string, isActive: boolean): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    if (admin.id === userId) {
      return { ok: false, error: "You can't switch off your own access" };
    }

    // Deactivating never deletes: the history stays, the door closes.
    const { error } = await supabaseAdmin()
      .from("profiles")
      .update({ is_active: isActive })
      .eq("id", userId);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/team");
    return { ok: true, message: isActive ? "Access restored" : "Access revoked" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Something went wrong" };
  }
}

export async function setCapacity(userId: string, minutes: number): Promise<ActionResult> {
  try {
    await requireAdmin();
    const clamped = Math.max(60, Math.min(1440, Math.round(minutes)));

    const { error } = await supabaseAdmin()
      .from("profiles")
      .update({ daily_capacity_minutes: clamped })
      .eq("id", userId);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/team");
    return { ok: true, message: "Working hours updated" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Something went wrong" };
  }
}

export async function setBenchmark(
  format: string,
  minutes: number | null,
): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    // null clears it. A format nobody has measured yet is better left blank
    // than pinned to a guess — the scorecard just sits the pace figure out.
    if (minutes !== null && (!Number.isFinite(minutes) || minutes < 1)) {
      return { ok: false, error: "Benchmark has to be at least a minute" };
    }

    const supabase = await supabaseServer();
    const { error } = await supabase
      .from("format_benchmarks")
      .update({
        target_minutes_per_unit: minutes === null ? null : Math.round(minutes),
        updated_by: admin.id,
        updated_at: new Date().toISOString(),
      })
      .eq("format", format);

    if (error) return { ok: false, error: error.message };

    revalidatePath("/team");
    revalidatePath("/analytics");
    return { ok: true, message: minutes === null ? "Benchmark cleared" : "Benchmark updated" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Something went wrong" };
  }
}
