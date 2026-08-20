"use client";

import { useEffect, useState } from "react";

/**
 * One shared interval for every live clock on screen. A timer per card would
 * mean thirty timers on a busy board.
 */
export function useTicking(enabled: boolean, everyMs = 1000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setTick((n) => n + 1), everyMs);
    return () => clearInterval(id);
  }, [enabled, everyMs]);
}

/** Seconds elapsed since an ISO timestamp, recomputed on each shared tick. */
export function secondsSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
}
