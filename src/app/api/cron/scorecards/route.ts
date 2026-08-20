import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Nightly roll-up. Writes one immutable scorecard per designer per day.
 *
 * Runs late enough that the day is over in the team's timezone, and closes any
 * session still hanging open first so nothing gets counted twice tomorrow.
 * Re-running for the same day overwrites rather than duplicates, so a retry is
 * always safe.
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

  // `null` means "each designer's own yesterday", which is what we want when
  // the team spans timezones.
  const { data: written, error } = await supabase.rpc("generate_daily_scorecards", {
    p_day: request.nextUrl.searchParams.get("day"),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sessions_closed: closed, scorecards_written: written });
}
