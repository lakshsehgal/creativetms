"use server";

import { revalidatePath } from "next/cache";
import { currentProfile, supabaseAdmin } from "@/lib/supabase/server";
import { callSheetRecipients, normaliseShoot } from "@/lib/shoot";
import { buildCallSheetEmail } from "@/lib/call-sheet-email";
import { canRunShoots, type Profile } from "@/lib/types";

export type SendResult =
  | { ok: true; count: number; to: string[] }
  | { ok: false; error: string };

/**
 * Send the call sheet.
 *
 * The one thing in this tool that leaves the building, so it re-checks the
 * caller here rather than trusting that the button was hidden, and it fails
 * loudly. Everything else that emails — the nightly scorecard — degrades
 * quietly when the mail key is missing, because the roll-up is the point and
 * the digest is a bonus. This is the opposite: somebody pressed Send and is
 * about to walk away believing a crew has been told.
 */
export async function sendCallSheet(shootId: string): Promise<SendResult> {
  try {
    const profile = await currentProfile();
    if (!profile || !profile.is_active || !canRunShoots(profile)) {
      return { ok: false, error: "Only the Shoot section can send a call sheet" };
    }

    const service = supabaseAdmin();

    const { data: row, error: readError } = await service
      .from("shoots")
      .select("*")
      .eq("id", shootId)
      .is("archived_at", null)
      .maybeSingle();

    if (readError) return { ok: false, error: readError.message };
    if (!row) return { ok: false, error: "That call sheet no longer exists" };

    const shoot = normaliseShoot(row as Record<string, unknown>);

    const { data: team } = await service
      .from("profiles")
      .select("email, full_name, is_active");

    const recipients = callSheetRecipients(
      shoot.doc.crew,
      (team ?? []) as Pick<Profile, "email" | "full_name" | "is_active">[],
    );

    if (recipients.length === 0) {
      return {
        ok: false,
        error: "Nobody to send it to — no active team addresses and no crew emails on the sheet",
      };
    }

    const key = process.env.RESEND_API_KEY;
    if (!key) {
      return {
        ok: false,
        error:
          "Email isn't set up yet — RESEND_API_KEY is missing, so nothing was sent. Nobody has been told.",
      };
    }

    const from = process.env.SCORECARD_FROM_EMAIL ?? "no-reply@neuroidmedia.com";
    const sender = profile.full_name || profile.email;
    const subject = shoot.shoot_date
      ? `Call sheet — ${shoot.title || "shoot"} · ${new Date(
          `${shoot.shoot_date}T00:00:00`,
        ).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
      : `Call sheet — ${shoot.title || "shoot"}`;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `Neuroid Creative Studio <${from}>`,
        // Everyone is on the same sheet and they're a crew — they should be
        // able to see who else has it, and hit reply-all when the gate is
        // locked. bcc here would be hiding the team from itself.
        to: recipients.map((person) => person.email),
        reply_to: profile.email,
        subject,
        html: buildCallSheetEmail(shoot, sender),
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return {
        ok: false,
        error: `The mail service refused it (${response.status}). Nothing was sent. ${detail.slice(0, 180)}`,
      };
    }

    // Recorded only after it actually went, so the sheet never claims a send
    // that failed.
    await service
      .from("shoots")
      .update({
        sent_at: new Date().toISOString(),
        sent_by: profile.id,
        sent_to: recipients.map((person) => person.email),
      })
      .eq("id", shootId);

    revalidatePath("/shoot");
    return { ok: true, count: recipients.length, to: recipients.map((p) => p.email) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Something went wrong — nothing was sent",
    };
  }
}
