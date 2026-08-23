"use client";

import { useState } from "react";
import type { Profile } from "@/lib/types";
import { PageHeader } from "@/components/ui/primitives";
import { ShootBlocks } from "./shoot-blocks";
import { ShootBriefs } from "./shoot-briefs";

/**
 * Everything to do with a shoot, in one place.
 *
 * These two halves used to be a card at the bottom of the Team page and a
 * standalone HTML file somebody kept in their downloads folder. They belong
 * together: the days you block are the days the call sheet is written for, and
 * the person doing one is doing the other twenty minutes later.
 */
const TABS = [
  { key: "bandwidth" as const, label: "Bandwidth" },
  { key: "briefs" as const, label: "Call sheets" },
];

type Tab = (typeof TABS)[number]["key"];

export function ShootClient({
  profile,
  designers,
}: {
  profile: Profile;
  designers: Profile[];
}) {
  const [tab, setTab] = useState<Tab>("bandwidth");

  return (
    <>
      <PageHeader
        title="Shoot"
        subtitle="Who's booked out, and the call sheet for the day"
      >
        <div
          role="tablist"
          aria-label="Shoot section"
          data-tour="shoot-tabs"
          className="flex items-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--color-line)] p-0.5 print:hidden"
        >
          {TABS.map((option) => (
            <button
              key={option.key}
              role="tab"
              aria-selected={tab === option.key}
              onClick={() => setTab(option.key)}
              className={`rounded-[var(--radius-sm)] px-2.5 py-1 text-[12px] transition-colors ${
                tab === option.key
                  ? "bg-[var(--color-surface-3)] font-medium text-[var(--color-ink)]"
                  : "text-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {tab === "bandwidth" ? (
          <div className="mx-auto max-w-[980px] space-y-4">
            <ShootBlocks designers={designers} />
          </div>
        ) : (
          <ShootBriefs profile={profile} designers={designers} />
        )}
      </div>
    </>
  );
}
