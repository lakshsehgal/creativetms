"use client";

import { useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

const BEAT_MS = 45_000;

/**
 * Keeps the running session alive while this tab is actually open and visible.
 *
 * This is the honesty mechanism: if the laptop is shut or the tab is buried,
 * the beats stop and the nightly sweep rewinds the session to the last one, so
 * a ticket left open over lunch doesn't bill lunch. Nobody has to press pause.
 */
export function useHeartbeat(ticketId: string | null, active: boolean) {
  useEffect(() => {
    if (!ticketId || !active) return;
    const supabase = supabaseBrowser();

    const beat = () => {
      if (document.visibilityState !== "visible") return;
      void supabase.rpc("heartbeat", { p_ticket_id: ticketId });
    };

    beat();
    const id = setInterval(beat, BEAT_MS);
    document.addEventListener("visibilitychange", beat);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [ticketId, active]);
}
