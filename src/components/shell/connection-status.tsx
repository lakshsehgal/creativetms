"use client";

import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";

/**
 * Says out loud when the tool can't reach the server.
 *
 * Without this the failure is invisible: you drag a card, it moves, and four
 * seconds later a toast you've already scrolled past says it didn't save. A
 * bar that stays on screen for as long as the problem lasts is the difference
 * between "the wifi dropped" and "this tool loses my work".
 */
export function ConnectionStatus() {
  const [offline, setOffline] = useState(false);
  const [returned, setReturned] = useState(false);

  useEffect(() => {
    // navigator.onLine is only trustworthy in the negative direction, which
    // happens to be the direction that matters here.
    const goOffline = () => {
      setOffline(true);
      setReturned(false);
    };
    const goOnline = () => {
      setOffline((wasOffline) => {
        if (wasOffline) setReturned(true);
        return false;
      });
    };

    setOffline(!navigator.onLine);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  useEffect(() => {
    if (!returned) return;
    const id = setTimeout(() => setReturned(false), 6000);
    return () => clearTimeout(id);
  }, [returned]);

  if (!offline && !returned) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex shrink-0 items-center justify-center gap-2 px-4 py-1.5 text-[12px] font-medium"
      style={
        offline
          ? { background: "var(--color-critical)", color: "#ffffff" }
          : { background: "var(--color-good)", color: "#ffffff" }
      }
    >
      {offline ? (
        <>
          <CloudOff size={13} aria-hidden />
          You&apos;re offline. Nothing is lost — anything you type is kept, and
          changes retry once the connection is back.
        </>
      ) : (
        <>
          <RefreshCw size={13} aria-hidden />
          Back online.
        </>
      )}
    </div>
  );
}
