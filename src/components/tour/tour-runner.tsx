"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import type { Anchor, Track, TourStep } from "@/lib/tour";
import { markTourSeen } from "@/lib/tour";
import { Button } from "@/components/ui/form";
import { TourArt } from "./tour-art";

/**
 * The walkthrough, running.
 *
 * It drives the real product: it navigates, presses layout tabs, opens the
 * brief dialog, and puts a spotlight on the actual element rather than on a
 * picture of one. That costs more than a slideshow and is worth it — a
 * screenshot tour is wrong the first time a button moves, and wrong in the
 * most expensive way, because it looks authoritative.
 *
 * The overlay swallows clicks. Half-following a tour while poking at the app
 * underneath is how people end up lost in both, and the spotlight would be
 * pointing at the wrong screen within two steps.
 */

const RADIUS = 10;
const PAD = 6;
/** Long enough for a route change and a query, short enough not to feel stuck. */
const WAIT_MS = 3500;

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function TourRunner({ track, onClose }: { track: Track; onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();

  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [ready, setReady] = useState(false);
  // The launcher lives in the sidebar, so without a portal this overlay would
  // render inside <nav> — a dialog inside a navigation landmark, and one
  // ancestor transform away from a fixed overlay that no longer covers the
  // page. It belongs on the body.
  const cardRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDialogElement>(null);

  /**
   * Get — and stay — above the app's own dialogs.
   *
   * The brief form is a real <dialog> opened with showModal(), which puts it in
   * the browser's top layer, above every z-index there is. The strategist's
   * walkthrough opens that form on purpose, and without this the tour ends up
   * behind it: the spotlight is invisible and Next can't be clicked. The step
   * it's stuck on is step four of eighteen.
   *
   * A manual popover was the tidier idea and doesn't work — Chromium paints a
   * modal dialog above a popover regardless of which was promoted last, which
   * this was caught doing. So the overlay is a modal dialog too, and dialogs do
   * stack: the one shown most recently is on top. Re-showing it after a step
   * opens a dialog of its own puts the walkthrough back in front.
   *
   * Being modal also does something the old overlay faked: everything behind it
   * is inert, so nobody can half-follow the tour while poking at the app
   * underneath. The tour's own presses still land, because those are dispatched
   * directly rather than by pointing at the screen.
   */
  const promote = useCallback(() => {
    const node = layerRef.current;
    if (!node) return;
    try {
      if (node.open) node.close();
      node.showModal();
    } catch {
      // No dialog support: leave it open as an ordinary fixed overlay, which
      // is right for everything except sitting over another dialog.
      node.setAttribute("open", "");
    }
  }, []);

  // Before paint, and on the first render rather than the second: this only
  // ever mounts client-side, from a button or a first-visit effect, so there
  // is no server paint to agree with — and a step that navigates immediately
  // was outrunning a two-render mount.
  useLayoutEffect(() => {
    promote();
  }, [promote]);

  const steps = track.steps;
  const step: TourStep | undefined = steps[index];

  /* --------------------------------------------------------------- moving */

  const finish = useCallback(() => {
    markTourSeen(track);
    onClose();
  }, [track, onClose]);

  const go = useCallback(
    (next: number) => {
      if (next < 0) return;
      if (next >= steps.length) {
        finish();
        return;
      }
      setReady(false);
      setBox(null);
      setIndex(next);
    },
    [steps.length, finish],
  );

  /*
    Setting a step up: navigate if it asks, press what it asks, then find the
    thing it points at. Each stage waits for the last, because a route change
    in this app is a server render and the element genuinely isn't there yet.
  */
  useEffect(() => {
    if (!step) return;
    let cancelled = false;

    async function prepare(current: TourStep) {
      if (current.path && current.path !== pathname) {
        router.push(current.path);
        const arrived = await waitFor(() => window.location.pathname === current.path);
        if (!arrived || cancelled) return;
        // The page has swapped; give React the frame it needs to paint it.
        await frame();
      }

      if (current.click) {
        const button = await waitForEl(current.click);
        if (cancelled) return;
        // Only press it if it isn't already the state we want — pressing a
        // tab that is already open is harmless, but pressing a toggle twice
        // is not.
        if (button && button.getAttribute("aria-selected") !== "true") {
          button.click();
          await frame();
        }
      }

      if (cancelled) return;

      if (!current.target) {
        setBox(null);
        setReady(true);
        return;
      }

      const element = await waitForEl(current.target);
      if (cancelled) return;

      if (!element) {
        // Nothing to point at. A step that says so up front skips itself; the
        // rest still get read, centred, because the words are usually the
        // point and the button is only where to find it.
        if (current.onlyIfPresent) {
          go(index + 1);
          return;
        }
        setBox(null);
        setReady(true);
        return;
      }

      element.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
      await settle();
      if (cancelled) return;
      setBox(rectOf(element));
      setReady(true);
    }

    void prepare(step);
    return () => {
      cancelled = true;
    };
    // `pathname` deliberately absent: it changes as a result of this effect,
    // and re-running on it would restart the step it just finished setting up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, index]);

  /* Keep the spotlight on the element while the page moves under it. */
  useEffect(() => {
    if (!step?.target || !ready) return;
    const update = () => {
      const element = find(step.target as Anchor);
      setBox(element ? rectOf(element) : null);
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const id = window.setInterval(update, 400);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.clearInterval(id);
    };
  }, [step, ready]);

  /* Keys, because a walkthrough you can't escape is a trap. */
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") finish();
      if (event.key === "ArrowRight" || event.key === "Enter") go(index + 1);
      if (event.key === "ArrowLeft") go(index - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, go, finish]);

  /*
    Re-promote only when a native dialog has appeared above us. Doing it on
    every step would flicker the overlay for no reason.
  */
  useEffect(() => {
    if (!ready) return;
    // Somebody else's dialog opened during this step — get back in front of it.
    if (document.querySelector("dialog[open]:not(.tour-layer)")) promote();
    cardRef.current?.focus();
  }, [ready, index, promote]);

  if (!step || typeof document === "undefined") return null;

  const place = placeCard(box);
  const last = index === steps.length - 1;

  return createPortal(
    <dialog
      ref={layerRef}
      className="tour-layer fixed inset-0 z-[120]"
      role="dialog"
      aria-label={`${track.role} walkthrough, step ${index + 1} of ${steps.length}`}
      // Esc on a modal dialog is the browser's, and it should mean the same
      // thing here as the Skip button rather than leaving a closed dialog
      // that React still thinks is open.
      onCancel={(event) => {
        event.preventDefault();
        finish();
      }}
    >
      {/* The dimmer, with a hole in it. An SVG mask rather than four divs so
          the corners can be rounded and the edge stays clean at any size. */}
      <svg className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <mask id="tour-hole">
            <rect width="100%" height="100%" fill="white" />
            {box && (
              <rect
                x={box.left - PAD}
                y={box.top - PAD}
                width={box.width + PAD * 2}
                height={box.height + PAD * 2}
                rx={RADIUS}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(8,10,14,0.62)" mask="url(#tour-hole)" />
      </svg>

      {box && (
        <span
          aria-hidden
          className="pointer-events-none absolute rounded-[10px] transition-[top,left,width,height] duration-200 ease-[var(--ease-out-quick)]"
          style={{
            top: box.top - PAD,
            left: box.left - PAD,
            width: box.width + PAD * 2,
            height: box.height + PAD * 2,
            boxShadow: "0 0 0 2px var(--color-brand), 0 0 0 7px color-mix(in srgb, var(--color-brand) 30%, transparent)",
          }}
        />
      )}

      <div
        ref={cardRef}
        tabIndex={-1}
        className="rise absolute w-[min(360px,calc(100vw-2rem))] rounded-[var(--radius-lg)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] p-4 text-[var(--color-ink)] shadow-[var(--shadow-pop)] outline-none"
        style={place}
      >
        <div className="flex items-start gap-3">
          <p className="tabular text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-3)]">
            {index + 1} / {steps.length}
          </p>
          <button
            onClick={finish}
            aria-label="Close the walkthrough"
            className="ml-auto -mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-ink)]"
          >
            <X size={14} />
          </button>
        </div>

        <h2 className="mt-1.5 text-[15px] font-semibold tracking-tight">{step.title}</h2>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">{step.body}</p>

        {step.art && (
          <div className="mt-3">
            <TourArt kind={step.art} />
          </div>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={finish}
            className="text-[11.5px] text-[var(--color-ink-3)] underline-offset-2 transition-colors hover:text-[var(--color-ink-2)] hover:underline"
          >
            Skip
          </button>
          <span className="ml-auto flex items-center gap-2">
            {index > 0 && (
              <Button size="sm" variant="ghost" onClick={() => go(index - 1)}>
                <ArrowLeft size={13} /> Back
              </Button>
            )}
            <Button size="sm" variant="primary" onClick={() => go(index + 1)}>
              {last ? "Done" : "Next"}
              {!last && <ArrowRight size={13} />}
            </Button>
          </span>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}

/* ---------------------------------------------------------------- finding */

function find(anchor: Anchor): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`);
}

function rectOf(element: HTMLElement): Box {
  const r = element.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function frame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** Long enough for a smooth scroll to land. */
function settle(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 260));
}

async function waitFor(test: () => boolean): Promise<boolean> {
  const until = Date.now() + WAIT_MS;
  while (Date.now() < until) {
    if (test()) return true;
    await frame();
    await new Promise((resolve) => window.setTimeout(resolve, 40));
  }
  return test();
}

async function waitForEl(anchor: Anchor): Promise<HTMLElement | null> {
  await waitFor(() => find(anchor) !== null);
  return find(anchor);
}

/* -------------------------------------------------------------- placement */

/**
 * Put the card beside the spotlight, on whichever side has room.
 *
 * Centred when there's nothing to point at, which is also the fallback when a
 * step's target has gone missing — a card floating next to nothing reads as a
 * bug, a card in the middle reads as a note.
 */
function placeCard(box: Box | null): React.CSSProperties {
  const width = Math.min(360, window.innerWidth - 32);
  const gap = 16;
  // The card's height isn't known until it renders; this is a working figure
  // for deciding which side it fits on, and it errs generous.
  const height = 260;

  if (!box) {
    return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  }

  const below = window.innerHeight - (box.top + box.height);
  const right = window.innerWidth - (box.left + box.width);

  let top: number;
  let left: number;

  if (right > width + gap) {
    // Beside it, which keeps the element and the words on one line of sight.
    left = box.left + box.width + gap;
    top = clamp(box.top - 8, 12, window.innerHeight - height - 12);
  } else if (box.left > width + gap) {
    left = box.left - width - gap;
    top = clamp(box.top - 8, 12, window.innerHeight - height - 12);
  } else if (below > height + gap) {
    top = box.top + box.height + gap;
    left = clamp(box.left, 12, window.innerWidth - width - 12);
  } else {
    top = clamp(box.top - height - gap, 12, window.innerHeight - height - 12);
    left = clamp(box.left, 12, window.innerWidth - width - 12);
  }

  return { top, left };
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}
