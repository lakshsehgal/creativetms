"use client";

import { useEffect, useState } from "react";
import { isoDay } from "@/lib/format";

/**
 * Today's date, resolved after mount.
 *
 * "Today" is a local-time question, and the server renders in UTC, so any
 * component that lays itself out around a calendar has to wait for the
 * client to answer or the two renders disagree and React throws the whole
 * subtree away. Returning null for the first paint lets callers show a
 * skeleton for one frame instead — cheaper than a hydration mismatch, and
 * honest about the fact that the server genuinely doesn't know.
 */
export function useToday(): string | null {
  const [today, setToday] = useState<string | null>(null);

  useEffect(() => {
    setToday(isoDay());

    // Someone leaves the tool open overnight; the grid should roll over.
    const id = setInterval(() => setToday(isoDay()), 60_000);
    return () => clearInterval(id);
  }, []);

  return today;
}
