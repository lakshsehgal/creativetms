"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarOff, Plus, Trash2 } from "lucide-react";
import type { AvailabilityBlock, Profile, Shoot } from "@/lib/types";
import { blockKindMeta } from "@/lib/types";
import { supabaseBrowser } from "@/lib/supabase/client";
import { reportWriteFailure, withRetry } from "@/lib/write";
import { Card, Avatar } from "@/components/ui/primitives";
import { Button } from "@/components/ui/form";
import { AddBlockDialog } from "./shoot-blocks";

/**
 * Taking the crew off the board, from inside the call sheet.
 *
 * The same blocks as the Bandwidth tab — same table, same rows, same effect on
 * the workload grid — but reachable at the moment somebody is actually deciding
 * who is coming. Writing "Abhay — Frame team" into the crew list and then
 * remembering, in another tab, to also mark Abhay as gone that day is a step
 * that gets skipped, and the cost of skipping it is a designer promised out for
 * eight hours he is spending in a warehouse.
 *
 * It shows only this shoot's day, so it answers one question — is everybody on
 * this sheet actually free of briefs? — rather than presenting the whole
 * calendar again.
 */
export function ShootDayBlocks({
  shoot,
  designers,
}: {
  shoot: Shoot;
  designers: Profile[];
}) {
  const supabase = supabaseBrowser();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);

  const day = shoot.shoot_date;

  const blocks = useQuery({
    queryKey: ["availability-blocks", day],
    enabled: Boolean(day),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("availability_blocks")
        .select("*")
        .eq("day", day)
        .order("start_time", { nullsFirst: true });
      if (error) throw error;
      return (data ?? []) as AvailabilityBlock[];
    },
  });

  const byPerson = useMemo(() => new Map(designers.map((p) => [p.id, p])), [designers]);
  const rows = blocks.data ?? [];

  // Anyone typed onto the crew who is also a designer here — those are the
  // people whose hours the workload grid is still counting on.
  const crewNames = useMemo(
    () =>
      new Set(
        shoot.doc.crew
          .flatMap((group) => group.members)
          .map((member) => member.name.trim().toLowerCase())
          .filter(Boolean),
      ),
    [shoot.doc.crew],
  );

  const unblocked = useMemo(
    () =>
      designers.filter(
        (person) =>
          crewNames.has(person.full_name.trim().toLowerCase()) &&
          !rows.some((block) => block.designer_id === person.id),
      ),
    [designers, crewNames, rows],
  );

  async function remove(block: AvailabilityBlock) {
    const { error } = await withRetry(() =>
      supabase.from("availability_blocks").delete().eq("id", block.id),
    );
    if (error) {
      reportWriteFailure(error.message, "that block", () => void remove(block));
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["availability-blocks"] });
    toast.success("Day freed up");
  }

  const dayLabel = day
    ? new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : "";

  return (
    <>
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-line)] px-4 py-2.5">
          <CalendarOff size={13} className="text-[var(--color-ink-3)]" />
          <h2 className="text-[12.5px] font-semibold tracking-tight">Bandwidth for this day</h2>
          <span className="text-[11.5px] text-[var(--color-ink-3)]">
            {day ? dayLabel : "set a shoot date first"} · comes straight out of Workload
          </span>
          <span className="ml-auto">
            <Button
              size="sm"
              variant="secondary"
              disabled={!day}
              onClick={() => setAdding(true)}
            >
              <Plus size={13} /> Block a designer
            </Button>
          </span>
        </div>

        {!day ? (
          <p className="px-4 py-6 text-center text-[12.5px] leading-relaxed text-[var(--color-ink-3)]">
            Put a date on the call sheet above and you can take the crew off the
            board from here.
          </p>
        ) : blocks.isLoading ? (
          <div className="skeleton m-4 h-14" />
        ) : rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12.5px] leading-relaxed text-[var(--color-ink-3)]">
            Nobody is booked out on this day yet. Anyone on this crew who also
            takes briefs should be blocked, or the workload grid will keep
            promising hours they&apos;ll be spending on set.
          </p>
        ) : (
          <ul>
            {rows.map((block) => {
              const person = byPerson.get(block.designer_id);
              const meta = blockKindMeta(block.kind);
              const whole = block.minutes == null;
              return (
                <li
                  key={block.id}
                  className="flex items-center gap-3 border-b border-[var(--color-line)] px-4 py-2 last:border-0"
                >
                  {person ? (
                    <Avatar
                      id={person.id}
                      name={person.full_name}
                      email={person.email}
                      src={person.avatar_url}
                      size={24}
                    />
                  ) : (
                    <span className="h-6 w-6 shrink-0 rounded-full bg-[var(--color-surface-3)]" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">
                    {person?.full_name || person?.email || "Someone off the roster"}
                  </span>

                  <span
                    className="shrink-0 rounded-[var(--radius-xs)] px-1.5 py-0.5 text-[10.5px] font-medium"
                    style={{
                      background: `color-mix(in srgb, ${meta.tone} 16%, transparent)`,
                      color: meta.tone,
                    }}
                  >
                    {meta.label}
                  </span>

                  <span className="tabular w-[110px] shrink-0 text-right text-[11.5px] text-[var(--color-ink-3)]">
                    {whole
                      ? "whole day"
                      : `${block.start_time?.slice(0, 5)}–${block.end_time?.slice(0, 5)}`}
                  </span>

                  {block.note && (
                    <span className="hidden min-w-0 shrink truncate text-[11.5px] text-[var(--color-ink-3)] lg:block">
                      {block.note}
                    </span>
                  )}

                  <button
                    onClick={() => void remove(block)}
                    aria-label="Remove this block"
                    title="Remove"
                    className="shrink-0 text-[var(--color-ink-3)] transition-colors hover:text-[var(--color-critical)]"
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/*
          Named on the crew, still counted as available. Said out loud because
          the whole point of this card is catching it before the day, and a
          silent gap is the one that gets found on the morning.
        */}
        {day && unblocked.length > 0 && (
          <p className="border-t border-[var(--color-line)] px-4 py-2 text-[11.5px] leading-relaxed text-[var(--color-ink-2)]">
            <span className="font-medium">
              {unblocked.map((person) => person.full_name.split(" ")[0]).join(", ")}
            </span>{" "}
            {unblocked.length === 1 ? "is" : "are"} on this crew and still open
            for briefs that day.
          </p>
        )}
      </Card>

      {adding && day && (
        <AddBlockDialog
          designers={designers}
          onClose={() => setAdding(false)}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["availability-blocks"] })}
          preset={{
            day,
            kind: "shoot",
            note: [shoot.brand, shoot.title].filter(Boolean).join(" — ") || "Shoot",
            startTime: shoot.doc.callTime || undefined,
          }}
        />
      )}
    </>
  );
}
