import { toast } from "sonner";

/**
 * Writes that survive a bad minute of wifi.
 *
 * A studio runs on hotel wifi, phone hotspots and a lift on the way to a
 * shoot. Before this, a single failed request threw the change away and
 * showed a toast that faded in four seconds — so the honest failure mode was
 * "I definitely moved that ticket" versus a board that says otherwise.
 *
 * Transient failures are retried with backoff. Failures that will never
 * succeed — a permission denied, a constraint violated — are surfaced
 * immediately, because retrying those only delays the bad news.
 */

export interface WriteResult<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

const RETRY_DELAYS_MS = [400, 1200, 3000];

/**
 * Is this worth trying again?
 *
 * PostgREST hands back a code for anything the database decided; the absence
 * of one, plus a fetch-shaped message, means the request never landed.
 */
export function isTransient(error: { message: string; code?: string } | null): boolean {
  if (!error) return false;

  // Postgres SQLSTATEs and PostgREST's own PGRST* codes are verdicts, not
  // accidents. Two exceptions: serialisation failures and deadlocks are the
  // database asking us to try again.
  if (error.code) {
    return error.code === "40001" || error.code === "40P01" || error.code === "57014";
  }

  const message = error.message?.toLowerCase() ?? "";
  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("network request failed") ||
    message.includes("load failed") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("connection")
  );
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run a Supabase write, retrying only what's worth retrying.
 *
 * Every call this wraps is idempotent — an UPDATE setting named columns, or
 * an INSERT the caller re-issues wholesale — so a retry after a response we
 * never saw is safe.
 */
export async function withRetry<T>(
  run: () => PromiseLike<WriteResult<T>>,
  { attempts = RETRY_DELAYS_MS.length + 1 }: { attempts?: number } = {},
): Promise<WriteResult<T>> {
  let result: WriteResult<T> = { data: null, error: null };

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      result = await run();
    } catch (thrown) {
      // The client throws rather than resolving when the request never left.
      result = {
        data: null,
        error: { message: thrown instanceof Error ? thrown.message : String(thrown) },
      };
    }

    if (!result.error) return result;
    if (!isTransient(result.error)) return result;

    const delay = RETRY_DELAYS_MS[attempt];
    if (delay == null) break;

    // No point burning retries while the machine knows it's offline; wait for
    // the connection to come back instead.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      await onceOnline(delay * 4);
    } else {
      await wait(delay);
    }
  }

  return result;
}

/** Resolve when the browser reports a connection again, or after a cap. */
function onceOnline(capMs: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener("online", done);
      resolve();
    };
    window.addEventListener("online", done);
    setTimeout(done, capMs);
  });
}

/**
 * Report a write that couldn't be saved.
 *
 * The toast does not auto-dismiss and carries the retry, because the whole
 * point is that nobody walks away believing a change landed when it didn't.
 */
export function reportWriteFailure(
  message: string,
  what: string,
  retry?: () => void,
) {
  toast.error(`Couldn't save ${what}`, {
    description: message.replace(/^.*?:\s*/, ""),
    duration: Infinity,
    closeButton: true,
    action: retry ? { label: "Try again", onClick: retry } : undefined,
  });
}
