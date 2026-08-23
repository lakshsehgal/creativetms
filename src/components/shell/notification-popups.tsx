"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, BellRing, X } from "lucide-react";
import type { RealtimePostgresInsertPayload } from "@supabase/supabase-js";
import type { AppNotification, Profile } from "@/lib/types";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  alertState,
  disableAlerts,
  enableAlerts,
  ensureWorker,
  showDesktopAlert,
} from "@/lib/desktop-alerts";

/**
 * Notifications you cannot miss.
 *
 * A badge on a bell in the sidebar is fine for things you'd like to know and
 * useless for things somebody is waiting on. A designer with the board open
 * in a background tab had no way of learning that a brief came back with
 * notes until they happened to look.
 *
 * Three layers, in increasing order of insistence:
 *
 *   1. a toast, for everything, so it registers while you're looking
 *   2. a desktop notification, which reaches a tab that isn't in front
 *   3. a bar pinned under the header that stays until the work is opened,
 *      for the handoffs that are actually blocking somebody
 *
 * The rows themselves are written by database triggers, so none of this is
 * load-bearing for delivery — it's all about making what's already durable
 * impossible to walk past.
 */

/** Handoffs where somebody is waiting on the person being told. */
const BLOCKING = new Set([
  "needs_edit",
  "size_changes",
  "assigned",
  "ready_for_approval",
  // Somebody is waiting on an answer only this person can give.
  "eta_requested",
]);

const PERMISSION_ASKED = "neuroid.desktop-alerts-asked";

/** Where opening one lands you. Not everything is about a ticket. */
function destination(row: AppNotification): string {
  if (row.ticket_id) return `/tickets/${row.ticket_id}`;
  if (row.kind === "shoot_block") return "/shoot";
  return "/board";
}

export function NotificationPopups({ profile }: { profile: Profile }) {
  const supabase = supabaseBrowser();
  const queryClient = useQueryClient();
  const router = useRouter();

  const [pinned, setPinned] = useState<AppNotification[]>([]);
  const [offerAlerts, setOfferAlerts] = useState(false);
  const seen = useRef<Set<string>>(new Set());

  /* -------------------------------------------------- desktop permission */

  useEffect(() => {
    // Register early so the worker is in control by the time the first
    // notification lands, not one beat behind it.
    if (alertState() === "on") void ensureWorker();

    let asked = "";
    try {
      asked = window.localStorage.getItem(PERMISSION_ASKED) ?? "";
    } catch {
      /* storage blocked — just don't offer */
      return;
    }
    if (alertState() === "off" && !asked) setOfferAlerts(true);
  }, []);

  const turnOnAlerts = useCallback(async () => {
    setOfferAlerts(false);
    try {
      window.localStorage.setItem(PERMISSION_ASKED, "1");
    } catch {
      /* fine */
    }
    // Must run from the click itself — browsers ignore a permission request
    // that didn't come from a gesture, and they ignore it silently.
    const state = await enableAlerts();
    if (state === "on") {
      toast.success("Desktop alerts on", {
        description: "You'll get a popup even when this tab is in the background.",
      });
      void showDesktopAlert({
        title: "Desktop alerts are on",
        body: "This is what a handoff will look like.",
        tag: "neuroid-test",
      });
    } else if (state === "denied") {
      toast.error("Your browser is blocking notifications", {
        description: "Allow them for this site in the address-bar padlock menu.",
        duration: 10_000,
      });
    }
  }, []);

  const dismissOffer = useCallback(() => {
    setOfferAlerts(false);
    disableAlerts();
    try {
      window.localStorage.setItem(PERMISSION_ASKED, "1");
    } catch {
      /* fine */
    }
  }, []);

  /* ------------------------------------------------------------ delivery */

  const open = useCallback(
    (row: AppNotification) => {
      setPinned((rows) => rows.filter((candidate) => candidate.id !== row.id));
      void supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", row.id);
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      router.push(destination(row));
    },
    [router, supabase, queryClient],
  );

  const announce = useCallback(
    (row: AppNotification) => {
      if (seen.current.has(row.id)) return;
      seen.current.add(row.id);

      const blocking = BLOCKING.has(row.kind);

      toast(row.title, {
        description: row.body,
        // Something waiting on you shouldn't time out after four seconds.
        duration: blocking ? 15_000 : 6000,
        closeButton: true,
        action: { label: "Open", onClick: () => open(row) },
      });

      if (blocking) setPinned((rows) => [row, ...rows.filter((r) => r.id !== row.id)].slice(0, 3));

      // A tab in front already showed a toast, so a desktop popup on top of
      // it is noise — unless somebody is actually waiting, in which case being
      // in a different app is exactly when it needs to reach them.
      const hidden = document.visibilityState === "hidden";
      if (hidden || blocking) {
        void showDesktopAlert({
          title: row.title,
          body: row.body,
          tag: row.ticket_id ?? row.id,
          url: destination(row),
          // Stays on screen until acknowledged. A handoff that vanishes after
          // four seconds while someone is in Premiere never happened.
          requireInteraction: blocking,
        });
      }
    },
    [open],
  );

  useEffect(() => {
    const channel = supabase
      .channel("notification-popups")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${profile.id}`,
        },
        (payload: RealtimePostgresInsertPayload<AppNotification>) =>
          announce(payload.new),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, profile.id, announce]);

  /* --------------------------------------------------------- title badge */

  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = pinned.length > 0 ? `(${pinned.length}) ${base}` : base;
  }, [pinned.length]);

  /* ----------------------------------------------------------------- UI */

  if (offerAlerts) {
    return (
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-line)] bg-[var(--color-surface-2)] px-4 py-1.5 text-[12px]">
        <Bell size={13} className="shrink-0 text-[var(--color-ink-3)]" />
        <span className="min-w-0">
          Get a desktop alert when a brief lands on you or comes back with
          notes.
        </span>
        <button
          onClick={() => void turnOnAlerts()}
          className="ml-auto shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-2 py-1 text-[11.5px] font-medium text-[var(--color-accent-ink)]"
        >
          Turn on
        </button>
        <button
          onClick={dismissOffer}
          aria-label="No thanks"
          className="shrink-0 text-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
        >
          <X size={13} />
        </button>
      </div>
    );
  }

  if (pinned.length === 0) return null;

  return (
    <div className="shrink-0">
      {pinned.map((row) => (
        <div
          key={row.id}
          role="alert"
          className="flex items-center gap-2 border-b px-4 py-1.5 text-[12px]"
          style={{
            background: "var(--color-accent-soft)",
            borderColor: "var(--color-line)",
          }}
        >
          <BellRing size={13} className="shrink-0 text-[var(--color-ink-2)]" />
          <span className="min-w-0 truncate">
            <span className="font-semibold">{row.title}</span>
            <span className="text-[var(--color-ink-2)]"> — {row.body}</span>
          </span>
          <button
            onClick={() => open(row)}
            className="ml-auto shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-2 py-1 text-[11.5px] font-medium text-[var(--color-accent-ink)]"
          >
            Open
          </button>
          <button
            onClick={() => setPinned((rows) => rows.filter((r) => r.id !== row.id))}
            aria-label={`Dismiss: ${row.title}`}
            className="shrink-0 text-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
