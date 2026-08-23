"use client";

import { ExternalLink, Info } from "lucide-react";
import type { Brand } from "@/lib/types";
import { BRAND_LINKS } from "@/lib/types";

/**
 * The brand's profile, where the work happens.
 *
 * The Brands page isn't in a designer's sidebar and doesn't need to be — what
 * they need is the logo folder and the one line about what this client hates,
 * at the moment they've picked the ticket up and the clock is running. Asking
 * in a group chat where the brand kit lives is a five-minute tax on every first
 * ticket for a client, paid by the person least able to answer it.
 *
 * Nothing shows if nobody has filled anything in. An empty panel on every
 * ticket would teach people to stop looking at it, and then filling it in
 * later wouldn't help.
 */
export function BrandPanel({ brand }: { brand: Brand | null | undefined }) {
  if (!brand) return null;

  const links = BRAND_LINKS.filter((link) => brand[link.key]?.trim());
  const notes = brand.notes?.trim() ?? "";
  if (links.length === 0 && !notes) return null;

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
      <h2 className="flex items-center gap-1.5 text-[12.5px] font-semibold tracking-tight">
        <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: brand.color }} />
        {brand.name}
      </h2>

      {links.length > 0 && (
        <ul className="mt-2 space-y-1">
          {links.map((link) => (
            <li key={link.key}>
              <a
                href={brand[link.key]}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[12px] text-[var(--color-ink-2)] underline decoration-[var(--color-line-strong)] underline-offset-2 transition-colors hover:text-[var(--color-ink)]"
              >
                {link.label}
                <ExternalLink size={10} className="shrink-0 text-[var(--color-ink-3)]" />
              </a>
            </li>
          ))}
        </ul>
      )}

      {notes && (
        <p className="mt-2.5 flex items-start gap-2 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] px-2.5 py-2 text-[11.5px] leading-relaxed text-[var(--color-ink-2)]">
          <Info size={12} className="mt-0.5 shrink-0 text-[var(--color-ink-3)]" />
          <span className="whitespace-pre-line">{notes}</span>
        </p>
      )}
    </section>
  );
}
