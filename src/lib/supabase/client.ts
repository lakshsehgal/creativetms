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
    cached = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { realtime: { params: { eventsPerSecond: 20 } } },
    );
  }
  return cached;
}
