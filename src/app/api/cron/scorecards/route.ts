import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { buildScorecardEmail, sendScorecardEmail } from "@/lib/scorecard-email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Nightly roll-up, then the digest.
 *
 * Writes one immutable scorecard per designer per day, then emails the whole
 * floor's numbers to every admin and operator. Runs late enough that the day
 * is over in the team's timezone, and closes any session still hanging open
 * first so nothing is counted twice tomorrow. Re-running a day overwrites
 * rather than duplicating, so a retry is always safe.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = supabaseAdmin();

  // Anything still open at this hour is somebody's forgotten tab.
  const { data: closed, error: sweepError } = await supabase.rpc("close_stale_sessions", {
    p_grace_minutes: 10,
  });
  if (sweepError) {
    return NextResponse.json({ error: sweepError.message }, { status: 500 });
  }

  const day = request.nextUrl.searchParams.get("day");
  const { data: written, error } = await supabase.rpc("generate_daily_scorecards", {
    p_day: day,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const digest = await sendDigest(supabase, day);

  return NextResponse.json({
    ok: true,
    sessions_closed: closed,
    scorecards_written: written,
    ...digest,
  });
}

async function sendDigest(
  supabase: ReturnType<typeof supabaseAdmin>,
  day: string | null,
): Promise<Record<string, unknown>> {
  // Everyone whose job is the numbers.
  const { data: recipients } = await supabase
    .from("profiles")
    .select("email, full_name")
    .in("role", ["admin", "operator"])
    .eq("is_active", true);

  if (!recipients || recipients.length === 0) {
    return { digest: "no recipients" };
  }

  const target =
    day ?? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  const { data: cards } = await supabase
    .from("daily_scorecards")
    .select("*, designer:profiles!daily_scorecards_designer_id_fkey ( full_name, email )")
    .eq("day", target);

  const { data: benchmarks } = await supabase.from("format_benchmarks").select("*");

  const html = buildScorecardEmail({
    day: target,
    cards: cards ?? [],
    benchmarks: benchmarks ?? [],
  });

  const result = await sendScorecardEmail({
    to: recipients.map((person) => person.email),
    subject: `Daily scorecard — ${target}`,
    html,
  });

  return { digest: result, recipients: recipients.length, cards: cards?.length ?? 0 };
}
