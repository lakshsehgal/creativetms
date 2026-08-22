"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, BellOff, BellRing } from "lucide-react";
import {
  alertState,
  disableAlerts,
  enableAlerts,
  showDesktopAlert,
  type AlertState,
} from "@/lib/desktop-alerts";
import { Card } from "@/components/ui/primitives";
import { Button } from "@/components/ui/form";

/**
 * Turning desktop popups on, off, and proving they work.
 *
 * The test button matters more than it looks. Notification permission fails
 * in ways nobody can see — the browser blocked it at the site level, the OS
 * has Do Not Disturb on, focus assist is swallowing everything — and without
 * a way to fire one on demand, the first time anyone finds out is the day
 * they miss a handoff.
 */
export function AlertSettings() {
  const [state, setState] = useState<AlertState>("unsupported");
  const [busy, setBusy] = useState(false);

  // Read after mount: the answer depends on browser APIs and localStorage,
  // neither of which the server can know.
  useEffect(() => setState(alertState()), []);

  async function turnOn() {
    setBusy(true);
    const next = await enableAlerts();
    setState(next);
    setBusy(false);

    if (next === "on") {
      toast.success("Desktop alerts on");
      void showDesktopAlert({
        title: "Desktop alerts are on",
        body: "This is what a handoff will look like.",
        tag: "neuroid-test",
      });
    } else if (next === "denied") {
      toast.error("Your browser is blocking notifications for this site", {
        description: "Open the padlock menu next to the address bar and allow them.",
        duration: 12_000,
      });
    }
  }

  function turnOff() {
    disableAlerts();
    setState("off");
    toast.success("Desktop alerts off");
  }

  async function test() {
    const shown = await showDesktopAlert({
      title: "Diwali statics came back with notes",
      body: "Priya asked for a round of changes.",
      tag: "neuroid-test",
      requireInteraction: true,
    });
    if (!shown) {
      toast.error("Nothing appeared", {
        description:
          "Your browser or your operating system is holding it back — check Do Not Disturb, and that this site is allowed to notify you.",
        duration: 12_000,
      });
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        {state === "on" ? (
          <BellRing size={14} className="text-[var(--color-ink-3)]" />
        ) : (
          <Bell size={14} className="text-[var(--color-ink-3)]" />
        )}
        <h2 className="text-[13px] font-semibold tracking-tight">Desktop alerts</h2>
      </div>

      <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">
        A popup on your desktop when a brief lands on you or comes back with
        notes — even when this tab is behind everything else. Anything someone
        is waiting on stays on screen until you acknowledge it.
      </p>

      {state === "unsupported" && (
        <p className="mt-3 text-[12px] text-[var(--color-ink-3)]">
          This browser can&apos;t do desktop notifications. The bell in the
          sidebar still works.
        </p>
      )}

      {state === "denied" && (
        <p className="mt-3 flex items-start gap-2 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] px-2.5 py-2 text-[12px] leading-relaxed">
          <BellOff size={13} className="mt-0.5 shrink-0 text-[var(--color-critical)]" />
          <span>
            Your browser is blocking notifications for this site, so the app
            can&apos;t ask again. Open the padlock menu next to the address bar,
            set Notifications to Allow, then reload.
          </span>
        </p>
      )}

      {(state === "off" || state === "on") && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {state === "on" ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => void test()}>
                Send a test
              </Button>
              <Button size="sm" variant="ghost" onClick={turnOff}>
                Turn off
              </Button>
              <span className="text-[11.5px] text-[var(--color-good)]">On for this browser</span>
            </>
          ) : (
            <>
              <Button size="sm" variant="primary" loading={busy} onClick={() => void turnOn()}>
                Turn on
              </Button>
              <span className="text-[11.5px] text-[var(--color-ink-3)]">
                Off — you&apos;ll only see the bell and in-app toasts
              </span>
            </>
          )}
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-[var(--color-ink-3)]">
        This is per browser, so turning it on here doesn&apos;t turn it on at
        home. They arrive while the app is open in a tab — closing the browser
        closes the channel.
      </p>
    </Card>
  );
}
