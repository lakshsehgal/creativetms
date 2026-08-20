"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/**
 * Native <dialog> — the browser handles focus trapping, Esc and the top layer,
 * which is less code and better behaviour than a hand-rolled modal.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  width = 520,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  width?: number;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        // Clicking the backdrop lands on the dialog element itself.
        if (event.target === ref.current) onClose();
      }}
      aria-labelledby="dialog-title"
      className="rise m-auto w-[calc(100vw-2rem)] rounded-[var(--radius-lg)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] p-0 text-[var(--color-ink)] shadow-[var(--shadow-pop)] backdrop:bg-black/55 backdrop:backdrop-blur-[2px]"
      style={{ maxWidth: width }}
    >
      <div className="flex items-start gap-4 border-b border-[var(--color-line)] px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 id="dialog-title" className="text-[15px] font-semibold tracking-tight">
            {title}
          </h2>
          {description && (
            <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">
              {description}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-ink)]"
        >
          <X size={15} />
        </button>
      </div>
      <div className="px-5 py-4">{children}</div>
    </dialog>
  );
}

export function DialogFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-5 -mb-4 mt-5 flex items-center justify-end gap-2 border-t border-[var(--color-line)] px-5 py-3.5">
      {children}
    </div>
  );
}
