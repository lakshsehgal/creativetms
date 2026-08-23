"use client";

/**
 * Desktop notifications, via the service worker.
 *
 * `new Notification()` from a page is unreliable in exactly the situation
 * that matters: the tab is backgrounded, the window is minimised, someone is
 * in Premiere and the browser is behind three other apps. Notifications shown
 * through a service worker registration are real OS notifications — they
 * persist, they can require acknowledgement, and clicking one focuses the tab
 * already open rather than spawning another.
 *
 * Everything here degrades quietly. A browser with no service worker, a denied
 * permission, a private window — none of it throws, the in-app toast and the
 * bell still work, and nothing is lost, because the rows are written by
 * database triggers either way.
 */

const ENABLED_KEY = "neuroid.desktop-alerts";

export type AlertState = "unsupported" | "denied" | "off" | "on";

export function alertsSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof Notification !== "undefined"
  );
}

/** Whether the person has switched them on, independent of the OS permission. */
export function alertsPreferred(): boolean {
  try {
    return window.localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAlertsPreferred(on: boolean) {
  try {
    window.localStorage.setItem(ENABLED_KEY, on ? "1" : "0");
  } catch {
    /* private window — the toggle just won't persist */
  }
}

export function alertState(): AlertState {
  if (!alertsSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";
  return alertsPreferred() ? "on" : "off";
}

let registration: ServiceWorkerRegistration | null = null;
let registering: Promise<ServiceWorkerRegistration | null> | null = null;

/** Register once per page, and hand the same registration to every caller. */
export function ensureWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!alertsSupported()) return Promise.resolve(null);
  if (registration) return Promise.resolve(registration);
  if (registering) return registering;

  registering = navigator.serviceWorker
    .register("/sw.js")
    .then(async (reg) => {
      // A worker that hasn't activated yet can't show anything.
      await navigator.serviceWorker.ready;
      registration = reg;
      return reg;
    })
    .catch(() => null)
    .finally(() => {
      registering = null;
    });

  return registering;
}

/**
 * Ask for permission. Must be called from a real click — browsers ignore a
 * permission request that didn't come from a gesture, silently.
 */
export async function enableAlerts(): Promise<AlertState> {
  if (!alertsSupported()) return "unsupported";

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();

  if (permission !== "granted") {
    setAlertsPreferred(false);
    return permission === "denied" ? "denied" : "off";
  }

  await ensureWorker();
  setAlertsPreferred(true);
  return "on";
}

export function disableAlerts() {
  setAlertsPreferred(false);
}

export interface DesktopAlert {
  title: string;
  body: string;
  /** Replaces an earlier alert with the same tag instead of stacking. */
  tag?: string;
  url?: string;
  /** Stay on screen until acknowledged — for handoffs someone is waiting on. */
  requireInteraction?: boolean;
}

/**
 * Show one. Returns false when nothing was shown, so callers can tell the
 * difference between "delivered" and "silently dropped".
 */
export async function showDesktopAlert(alert: DesktopAlert): Promise<boolean> {
  if (alertState() !== "on") return false;

  const reg = await ensureWorker();
  if (!reg) return false;

  // Always through the registration, never by posting a message to the
  // controller. Both end up showing the same kind of notification, but
  // postMessage is fire-and-forget: it resolves whether or not the worker did
  // anything, so a stale or broken worker reported success and the "nothing
  // appeared" warning never fired. Reporting a delivery that didn't happen is
  // worse than not delivering.
  try {
    await reg.showNotification(alert.title, {
      body: alert.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: alert.tag,
      requireInteraction: Boolean(alert.requireInteraction),
      data: { url: alert.url ?? "/board" },
    });
    return true;
  } catch {
    return false;
  }
}

/* ----------------------------------------------------------- diagnosis */

export interface AlertCheck {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
}

/**
 * Why nothing is appearing.
 *
 * Desktop notifications fail at five different points and four of them are
 * invisible — a blocked permission, a worker that never registered because the
 * file 404s behind deployment protection, an insecure origin, an OS with Do
 * Not Disturb on. Without this the only signal anybody gets is silence, and
 * silence is indistinguishable from "nobody sent me anything".
 */
export async function diagnose(): Promise<AlertCheck[]> {
  const checks: AlertCheck[] = [];

  const secure = typeof window !== "undefined" && window.isSecureContext;
  checks.push({
    key: "secure",
    label: "Secure connection",
    ok: secure,
    detail: secure
      ? "This origin counts as secure, which notifications require."
      : "Notifications only work on a secure origin. On a link without a certificate the browser switches them off, not this app.",
  });

  const supported = alertsSupported();
  checks.push({
    key: "supported",
    label: "Browser can do this",
    ok: supported,
    detail: supported
      ? "Service workers and notifications are both available."
      : "This browser doesn't offer notifications — Safari in a private window and some in-app browsers don't.",
  });

  const permission = typeof Notification === "undefined" ? "default" : Notification.permission;
  checks.push({
    key: "permission",
    label: "You allowed them",
    ok: permission === "granted",
    detail:
      permission === "granted"
        ? "Allowed for this site."
        : permission === "denied"
          ? "Blocked for this site. The app can't ask again — open the padlock menu beside the address bar, set Notifications to Allow, then reload."
          : "Not asked yet. Turn them on below.",
  });

  checks.push({
    key: "preferred",
    label: "Switched on here",
    ok: alertsPreferred(),
    detail: alertsPreferred()
      ? "On for this browser."
      : "Off. This is per browser, so turning it on at the office doesn't turn it on at home.",
  });

  // The worker file itself. Deployment protection returning a login page for
  // /sw.js is the failure that looks exactly like nothing being wrong.
  let fileOk = false;
  let fileDetail = "Couldn't reach /sw.js at all.";
  try {
    const response = await fetch("/sw.js", { cache: "no-store" });
    const type = response.headers.get("content-type") ?? "";
    fileOk = response.ok && /javascript|ecmascript/i.test(type);
    fileDetail = response.ok
      ? fileOk
        ? "Served correctly."
        : `Served as ${type || "an unknown type"} rather than JavaScript — usually a login or preview page standing in front of it.`
      : `The server answered ${response.status}. If this deployment is password-protected, that protection also blocks the worker.`;
  } catch (error) {
    fileDetail = error instanceof Error ? error.message : fileDetail;
  }
  checks.push({ key: "file", label: "Worker file reachable", ok: fileOk, detail: fileDetail });

  const registration = supported ? await ensureWorker() : null;
  checks.push({
    key: "worker",
    label: "Worker registered",
    ok: Boolean(registration),
    detail: registration
      ? "Registered and active."
      : "Registration failed. Almost always the line above.",
  });

  return checks;
}
