"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface MultiOption {
  value: string;
  label: string;
  /** A swatch beside the label — the brand's colour, a status fill. */
  tone?: string;
  /** Sits above the options it introduces. */
  group?: string;
}

/**
 * A filter that takes several answers.
 *
 * A native `<select multiple>` is technically the right element and nobody can
 * use one: it needs ctrl-click, it shows a scrolling box that fights the
 * toolbar, and on a phone it is a different control entirely. This is a
 * button that says what is chosen and a list of checkboxes underneath.
 *
 * Nothing is chosen means no constraint, and the button says "All" — the same
 * thing the old single picker said, so the toolbar reads the same when nobody
 * has touched it.
 */
export function MultiSelect({
  label,
  options,
  value,
  onChange,
  allLabel = "All",
  width = 190,
}: {
  label: string;
  options: MultiOption[];
  value: string[];
  onChange: (next: string[]) => void;
  /** What the button says when nothing is ticked. */
  allLabel?: string;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const listId = useId();

  // Close on a click anywhere else, and on Escape. Both, because a dropdown
  // that only closes one way is one somebody ends up stuck under.
  useEffect(() => {
    if (!open) return;

    function onPointer(event: PointerEvent) {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const chosen = options.filter((option) => value.includes(option.value));

  // One choice reads as itself; several read as the first plus a count, which
  // stays the same width whether it's two brands or eleven.
  const summary =
    chosen.length === 0
      ? allLabel
      : chosen.length === 1
        ? chosen[0].label
        : `${chosen[0].label} +${chosen.length - 1}`;

  let lastGroup: string | undefined;

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${label}: ${summary}`}
        className="inline-flex max-w-[220px] items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface-2)] py-1 pl-2 pr-1.5 text-[12.5px] transition-colors hover:border-[var(--color-line-strong)]"
      >
        <span className="shrink-0 text-[11px] font-medium text-[var(--color-ink-3)]">{label}</span>
        <span
          className="truncate"
          style={{ color: chosen.length ? "var(--color-ink)" : "var(--color-ink-2)" }}
        >
          {summary}
        </span>
        <ChevronDown size={12} className="shrink-0 text-[var(--color-ink-3)]" />
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-multiselectable
          aria-label={label}
          className="rise absolute left-0 top-full z-40 mt-1 max-h-[320px] overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-pop)]"
          style={{ width }}
        >
          {options.map((option) => {
            const ticked = value.includes(option.value);
            const heading = option.group && option.group !== lastGroup ? option.group : null;
            lastGroup = option.group;

            return (
              <div key={option.value}>
                {heading && (
                  <p className="px-2.5 pb-0.5 pt-2 text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--color-ink-3)]">
                    {heading}
                  </p>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={ticked}
                  onClick={() =>
                    onChange(
                      ticked
                        ? value.filter((item) => item !== option.value)
                        : [...value, option.value],
                    )
                  }
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] transition-colors hover:bg-[var(--color-surface-2)]"
                >
                  <span
                    aria-hidden
                    className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[3px] border"
                    style={{
                      borderColor: ticked ? "var(--color-accent)" : "var(--color-line-strong)",
                      background: ticked ? "var(--color-accent)" : "transparent",
                      color: "var(--color-accent-ink)",
                    }}
                  >
                    {ticked && <Check size={10} strokeWidth={3} />}
                  </span>

                  {option.tone && (
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-[2px]"
                      style={{ background: option.tone }}
                    />
                  )}

                  <span className="min-w-0 truncate">{option.label}</span>
                </button>
              </div>
            );
          })}

          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 w-full border-t border-[var(--color-line)] px-2.5 py-1.5 text-left text-[11.5px] text-[var(--color-ink-3)] transition-colors hover:text-[var(--color-ink)]"
            >
              Clear {label.toLowerCase()}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
