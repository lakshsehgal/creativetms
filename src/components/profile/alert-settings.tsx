"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, BellOff, BellRing, Check, Download, RefreshCw, Wifi, X } from "lucide-react";
import {
  alertState,
  diagnose,
  disableAlerts,
  enableAlerts,
  showDesktopAlert,
  type AlertCheck,
  type AlertState,
} from "@/lib/desktop-alerts";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Card } from "@/components/ui/primitives";
import { Button } from "@/components/ui/form";

/**
 * Turning desktop popups on, off, and finding out why they aren't appearing.
 *
 * The diagnosis matters more than the toggle. Notifications fail at five
 * separate points and four of them are silent — a permission blocked at the
 * site level, a worker file sitting behind deployment protection, an insecure
 * origin, an OS with Do Not Disturb on, a realtime channel that never
 * connected. Every one of those looks identical from a designer's chair:
 * nothing happens. A row of ticks turns "it doesn't work" into a sentence
 * somebody can act on.
 */

type Live = "checking" | "connected" | "failed";

/** Chrome hands this over so a site can offer its own install button. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Installing, and why it's on the notifications card.
 *
 * A desktop notification from an ordinary website is captioned with the
 * origin, so every handoff turns up under "something.vercel.app". No API
 * changes that — the browser puts it there on purpose. Installing the app is
 * the one thing that does: the caption becomes the app's name, the icon
 * becomes the mark, and it gets its own window into the bargain.
 */
function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Already running as an installed app — nothing to offer.
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
      return;
    }

    const capture = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const done = () => {
      setInstalled(true);
      setPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", done);
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", done);
    };
  }, []);

  if (installed) {
    return (
      <p className="mt-3 flex items-start gap-2 text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">
        <Check size={12} className="mt-0.5 shrink-0" style={{ color: "var(--color-good)" }} />
        <span>Installed — alerts are captioned Creative TMS rather than the web address.</span>
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] px-2.5 py-2">
      <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-[var(--color-ink-2)]">
        <Download size={12} className="mt-0.5 shrink-0 text-[var(--color-ink-3)]" />
        <span>
          Alerts are captioned with the web address, because that&apos;s what the
          browser shows for a website. Install this as an app and they say
          <b> Creative TMS</b> instead, with the mark for an icon and a window of
          its own.
        </span>
      </p>
      {prompt ? (
        <div className="mt-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              void prompt.prompt();
              void prompt.userChoice.then(({ outcome }) => {
                if (outcome === "accepted") setInstalled(true);
              });
            }}
          >
            <Download size={13} /> Install
          </Button>
        </div>
      ) : (
        <p className="mt-1.5 pl-5 text-[11px] leading-relaxed text-[var(--color-ink-3)]">
          Chrome and Edge: the install icon at the right of the address bar, or
          the ⋮ menu → Cast, save and share → Install. Safari: Share → Add to
          Dock.
        </p>
      )}
    </div>
  );
}

export function AlertSettings() {
  const [state, setState] = useState<AlertState>("unsupported");
  const [checks, setChecks] = useState<AlertCheck[] | null>(null);
  const [live, setLive] = useState<Live>("checking");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const run = useCallback(async () => {
    setState(alertState());
    setChecks(await diagnose());
  }, []);

  // Read after mount: every answer depends on browser APIs and localStorage,
  // neither of which the server can know.
  useEffect(() => {
    void run();
  }, [run]);

  /**
   * Whether the channel that carries notifications is actually up.
   *
   * The popup can be perfectly configured and still never fire, because the
   * rows arrive over Supabase realtime and that's a separate thing to be
   * broken. Subscribing to the same table the popups use answers it directly.
   */
  useEffect(() => {
    const supabase = supabaseBrowser();
    const channel = supabase
      .channel("alert-settings-probe")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, () => {})
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") setLive("connected");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setLive("failed");
        }
      });

    // A channel that never calls back at all is also a failure.
    const giveUp = setTimeout(() => setLive((current) => (current === "checking" ? "failed" : current)), 8000);

    return () => {
      clearTimeout(giveUp);
      void supabase.removeChannel(channel);
    };
  }, []);

  async function turnOn() {
    setBusy(true);
    const next = await enableAlerts();
    setBusy(false);
    await run();

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
      setOpen(true);
    }
  }

  function turnOff() {
    disableAlerts();
    void run();
    toast.success("Desktop alerts off");
  }

  async function test() {
    const shown = await showDesktopAlert({
      title: "Diwali statics came back with notes",
      body: "Priya asked for a round of changes.",
      tag: "neuroid-test",
      requireInteraction: true,
    });
    if (shown) {
      toast.success("Sent. If nothing appeared on your desktop, it's your OS holding it back", {
        description:
          "Check Do Not Disturb, Focus, and your notification settings for this browser.",
        duration: 10_000,
      });
      return;
    }
    toast.error("The browser refused it", {
      description: "Open the checks below — one of them will say why.",
      duration: 12_000,
    });
    setOpen(true);
    void run();
  }

  const failing = (checks ?? []).filter((check) => !check.ok);

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
        ) : state !== "unsupported" ? (
          <>
            <Button size="sm" variant="primary" loading={busy} onClick={() => void turnOn()}>
              Turn on
            </Button>
            <span className="text-[11.5px] text-[var(--color-ink-3)]">
              Off — you&apos;ll only see the bell and in-app toasts
            </span>
          </>
        ) : null}
      </div>

      <InstallApp />

      {/* ------------------------------------------------------ the checks */}

      <div className="mt-4 border-t border-[var(--color-line)] pt-3">
        <button
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center gap-2 text-[11.5px] text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"
        >
          <span
            className="inline-flex items-center gap-1.5 font-medium"
            style={{
              color:
                failing.length > 0 || live === "failed"
                  ? "var(--color-critical)"
                  : "var(--color-ink-2)",
            }}
          >
            {failing.length > 0 || live === "failed" ? (
              <X size={12} />
            ) : (
              <Check size={12} />
            )}
            {checks === null
              ? "Checking…"
              : failing.length === 0 && live !== "failed"
                ? "Everything that has to be true, is"
                : `${failing.length + (live === "failed" ? 1 : 0)} thing${
                    failing.length + (live === "failed" ? 1 : 0) === 1 ? "" : "s"
                  } stopping these from arriving`}
          </span>
          <span className="ml-auto text-[var(--color-ink-3)]">{open ? "Hide" : "Show"}</span>
        </button>

        {open && (
          <ul className="mt-2.5 space-y-2">
            {(checks ?? []).map((check) => (
              <li key={check.key} className="flex items-start gap-2 text-[11.5px] leading-relaxed">
                <span
                  className="mt-0.5 shrink-0"
                  style={{ color: check.ok ? "var(--color-good)" : "var(--color-critical)" }}
                >
                  {check.ok ? <Check size={12} /> : <X size={12} />}
                </span>
                <span className="min-w-0">
                  <span className="font-medium">{check.label}</span>
                  <span className="text-[var(--color-ink-2)]"> — {check.detail}</span>
                </span>
              </li>
            ))}

            <li className="flex items-start gap-2 text-[11.5px] leading-relaxed">
              <span
                className="mt-0.5 shrink-0"
                style={{
                  color:
                    live === "connected"
                      ? "var(--color-good)"
                      : live === "failed"
                        ? "var(--color-critical)"
                        : "var(--color-ink-3)",
                }}
              >
                {live === "connected" ? <Check size={12} /> : live === "failed" ? <X size={12} /> : <Wifi size={12} />}
              </span>
              <span className="min-w-0">
                <span className="font-medium">Live channel</span>
                <span className="text-[var(--color-ink-2)]">
                  {" — "}
                  {live === "connected"
                    ? "Connected. Notifications arrive the moment they're written."
                    : live === "failed"
                      ? "Not connected, so nothing arrives until you reload. Realtime may be switched off for the notifications table in Supabase, or a network is blocking websockets."
                      : "Checking…"}
                </span>
              </span>
            </li>

            <li className="pt-1">
              <Button size="sm" variant="ghost" onClick={() => void run()}>
                <RefreshCw size={12} /> Check again
              </Button>
            </li>
          </ul>
        )}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-[var(--color-ink-3)]">
        This is per browser, so turning it on here doesn&apos;t turn it on at
        home. They arrive while the app is open in a tab — closing the browser
        closes the channel.
      </p>
    </Card>
  );
}
