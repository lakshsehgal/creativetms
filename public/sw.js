/**
 * Neuroid TMS service worker.
 *
 * It exists for one reason: notifications shown through a service worker are
 * real OS notifications. They survive the tab being backgrounded or the window
 * minimised, they can be told to stay on screen until acknowledged, and
 * clicking one can focus the tab that's already open instead of spawning a
 * fourth copy of the app — none of which a page-level `new Notification()`
 * does reliably.
 *
 * There is deliberately no fetch handler. Caching the app would mean shipping
 * a second, stale copy of a tool people make scheduling decisions in, and
 * every cache bug looks like a data bug to whoever hits it.
 *
 * Nor is there a message handler any more. The page used to post the worker a
 * "show this" message, which is fire-and-forget: it succeeded whether or not
 * the worker did anything, so a broken worker reported delivery and nobody
 * found out. The page now calls showNotification on the registration directly
 * and can tell when that fails. What's left here is the click, which only the
 * worker can handle.
 */

self.addEventListener("install", () => {
  // Take over immediately rather than waiting for every old tab to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/board", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Reuse a tab that already has the app open — a designer clicking a
      // notification wants the board they were on, not a fourth window.
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
