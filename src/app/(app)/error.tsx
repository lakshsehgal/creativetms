"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";

/**
 * Replaces Next's bare "Application error: a client-side exception occurred",
 * which tells the person nothing and tells us nothing either. One broken
 * component now degrades into a readable message with the actual error text,
 * and a retry that doesn't need a full reload.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Creative TMS error:", error);
  }, [error]);

  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-[20px] font-semibold tracking-tight">Something broke on this screen</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
          The rest of the tool is fine — your work is saved. Try again, and if it
          keeps happening send this message over:
        </p>

        <pre className="mt-4 overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2 text-left text-[11.5px] text-[var(--color-ink-2)]">
          {error.message || "Unknown error"}
          {error.digest ? `\n\ndigest: ${error.digest}` : ""}
        </pre>

        <button
          onClick={reset}
          className="mt-5 inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)]"
        >
          <RefreshCw size={14} /> Try again
        </button>
      </div>
    </main>
  );
}
