"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * One browser client for the whole tab. Reads and writes go straight from the
 * browser to Postgres — no Next.js server hop in the middle — which is most of
 * why the board feels instant. Row-level security is what keeps that safe.
 */
let cached: ReturnType<typeof createBrowserClient> | null = null;

export function supabaseBrowser() {
  if (!cached) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // Say plainly what's missing — the raw client error ("supabaseUrl is
    // required") sends people hunting in the wrong place.
    if (!url || !key) {
      throw new Error(
        "Supabase isn't configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
          "NEXT_PUBLIC_SUPABASE_ANON_KEY in your Vercel project, then redeploy " +
          "— environment variables are baked in at build time, so an existing " +
          "deployment won't pick them up on its own.",
      );
    }

    cached = createBrowserClient(url, key, {
      realtime: { params: { eventsPerSecond: 20 } },
    });
  }
  return cached;
}
