"use client";

import { useEffect, useState } from "react";
import { Compass } from "lucide-react";
import type { Profile } from "@/lib/types";
import { trackFor, tourSeen } from "@/lib/tour";
import { TourRunner } from "./tour-runner";

/**
 * The way in, and the only thing the sidebar has to know about walkthroughs.
 *
 * It offers itself once. Somebody signing in for the first time gets the
 * walkthrough opened for them, because the people who most need it are exactly
 * the people who won't go looking for a button called Guide. After that it
 * sits in the sidebar and waits to be asked — a tour that reappears is a tour
 * everyone learns to dismiss without reading.
 *
 * There is no auto-start on a machine that has already seen it, and no way for
 * it to interrupt work in progress: it opens on the first paint after sign-in
 * or not at all.
 */
export function TourLauncher({ profile, collapsed }: { profile: Profile; collapsed: boolean }) {
  const track = trackFor(profile);
  const [running, setRunning] = useState(false);

  // Mount only. Reading localStorage during render would disagree with the
  // server's paint, and offering the walkthrough is not worth a hydration
  // mismatch on every page in the app.
  useEffect(() => {
    if (track && !tourSeen(track)) setRunning(true);
  }, [track]);

  if (!track) return null;

  return (
    <>
      <button
        data-tour="nav-guide"
        onClick={() => setRunning(true)}
        title={collapsed ? "Guide" : undefined}
        className="flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-[13px] text-[var(--color-ink-2)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
      >
        <span className="shrink-0">
          <Compass size={16} />
        </span>
        {!collapsed && <span className="truncate">Guide</span>}
      </button>

      {running && <TourRunner track={track} onClose={() => setRunning(false)} />}
    </>
  );
}
