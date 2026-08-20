import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Idle sweep, every 15 minutes.
 *
 * A session whose tab stopped sending heartbeats gets ended and rewound to the
 * last beat, so a laptop shut at 6pm doesn't bill the night. This is the piece
 * that lets the whole system stay hands-off and still produce honest numbers.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin().rpc("close_stale_sessions", {
    p_grace_minutes: 12,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sessions_closed: data });
}
