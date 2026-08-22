"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Text that survives a closed tab.
 *
 * The longest thing anyone types in this tool is a brief, and until now it
 * lived only in React state: press Escape, click the backdrop, follow a Slack
 * link, or lose the connection, and it was gone with no warning. Comments and
 * revision notes had the same problem on a smaller scale.
 *
 * Drafts are written to localStorage a moment after typing stops and cleared
 * the instant the real write succeeds, so the stored copy only ever exists
 * while there's something unsaved to protect.
 */

const PREFIX = "neuroid.draft.";
const MAX_AGE_MS = 7 * 24 * 3600_000;
const DEBOUNCE_MS = 400;

/** Keys with content nobody has saved yet — drives the leave-the-page warning. */
const dirty = new Set<string>();
let guardInstalled = false;

function installGuard() {
  if (guardInstalled || typeof window === "undefined") return;
  guardInstalled = true;
  window.addEventListener("beforeunload", (event) => {
    if (dirty.size === 0) return;
    // Browsers ignore the message these days and show their own, but the
    // preventDefault is still what triggers the prompt.
    event.preventDefault();
    event.returnValue = "";
  });
}

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; value: T };
    if (!parsed || typeof parsed.at !== "number") return null;
    // A three-week-old brief reappearing is noise, not a rescue.
    if (Date.now() - parsed.at > MAX_AGE_MS) {
      window.localStorage.removeItem(PREFIX + key);
      return null;
    }
    return parsed.value;
  } catch {
    // Private windows and blocked site data both throw here. Losing draft
    // persistence is survivable; throwing on render is not.
    return null;
  }
}

function write<T>(key: string, value: T) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), value }));
  } catch {
    /* out of quota, or storage disabled */
  }
}

function drop(key: string) {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* nothing to do */
  }
}

export interface Draft<T> {
  value: T;
  set: (next: T | ((previous: T) => T)) => void;
  /** Call after the real write lands. Removes the stored copy. */
  clear: () => void;
  /** Throw the draft away without saving — the explicit "discard" action. */
  discard: () => void;
  /** True when this mount picked up something left behind earlier. */
  restored: boolean;
}

export function useDraft<T>(
  key: string | null,
  empty: T,
  /** Decides whether the current value is worth protecting. */
  hasContent: (value: T) => boolean,
): Draft<T> {
  const [value, setValue] = useState<T>(empty);
  const [restored, setRestored] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emptyRef = useRef(empty);

  // Callers pass an inline predicate, so it is a new function every render.
  // Holding it in a ref keeps the effects below off that dependency.
  const hasContentRef = useRef(hasContent);
  hasContentRef.current = hasContent;

  // What a synchronous flush on unmount needs to know.
  const latest = useRef<{ key: string | null; value: T; populated: boolean }>({
    key,
    value: empty,
    populated: false,
  });

  // Restore on mount, in an effect so the server and the first client render
  // agree — reading localStorage during render would be a hydration mismatch.
  useEffect(() => {
    if (!key) return;
    installGuard();
    const saved = read<T>(key);
    if (saved != null && hasContentRef.current(saved)) {
      setValue(saved);
      setRestored(true);
    }
    // Only ever re-run for a different draft (a different ticket's comment box).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Persist a moment after typing stops.
  useEffect(() => {
    if (!key) return;
    if (timer.current) clearTimeout(timer.current);

    const populated = hasContentRef.current(value);
    latest.current = { key, value, populated };
    if (populated) dirty.add(key);
    else dirty.delete(key);

    timer.current = setTimeout(() => {
      if (populated) write(key, value);
      else drop(key);
    }, DEBOUNCE_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, value]);

  /**
   * Unmounting is not saving.
   *
   * Closing the modal is exactly the moment a debounce is still pending, so
   * cancelling the timer without writing would guarantee the loss this hook
   * exists to prevent. Flush synchronously instead.
   */
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      const { key: lastKey, value: lastValue, populated } = latest.current;
      if (lastKey && populated) write(lastKey, lastValue);
    };
  }, []);

  const set = useCallback((next: T | ((previous: T) => T)) => {
    setValue((previous) =>
      typeof next === "function" ? (next as (p: T) => T)(previous) : next,
    );
    setRestored(false);
  }, []);

  const clear = useCallback(() => {
    if (key) {
      dirty.delete(key);
      drop(key);
    }
    setValue(emptyRef.current);
    setRestored(false);
  }, [key]);

  return { value, set, clear, discard: clear, restored };
}

/** Whether anything anywhere is holding unsaved text. */
export function hasUnsavedDrafts(): boolean {
  return dirty.size > 0;
}
