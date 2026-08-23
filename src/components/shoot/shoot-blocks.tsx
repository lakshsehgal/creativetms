"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarOff, Camera, Plus, Trash2 } from "lucide-react";
import type { AvailabilityBlock, BlockKind, Profile } from "@/lib/types";
import { BLOCK_KINDS, blockKindMeta } from "@/lib/types";
import { isoDay, minutesToHuman } from "@/lib/format";
import { addDays, dayCapacity } from "@/lib/planning";
import { supabaseBrowser } from "@/lib/supabase/client";
import { withRetry, reportWriteFailure } from "@/lib/write";
import { Card, Avatar } from "@/components/ui/primitives";
import { Button, Field, Select, TextInput } from "@/components/ui/form";
import { Dialog, DialogFooter } from "@/components/ui/dialog";

/**
 * Days somebody isn't at a desk.
 *
 * Several of the designers shoot as well, and a day on set is a day gone. The
 * workload grid used to show them with a full eight hours while they were
 * standing in a warehouse — a confident wrong number, which is worse than no
 * number, because it's the one a deadline gets promised against.
 *
 * Marked by an operator or an admin, never by the designer: this is capacity
 * other people plan against, so it isn't a thing to edit unilaterally.
 */
export function ShootBlocks({ designers }: { designers: Profile[] }) {
  const supabase = supabaseBrowser();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);

  const from = isoDay();
  const to = addDays(from, 60);

  const blocks = useQuery({
    queryKey: ["availability-blocks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("availability_blocks")
        .select("*")
        .gte("day", from)
        .lte("day", to)
        .order("day");
      if (error) throw error;
      return (data ?? []) as AvailabilityBlock[];
    },
  });

  const byPerson = useMemo(() => new Map(designers.map((p) => [p.id, p])), [designers]);

  async function remove(block: AvailabilityBlock) {
    const { error } = await withRetry(() =>
      supabase.from("availability_blocks").delete().eq("id", block.id),
    );
    if (error) {
      reportWriteFailure(error.message, "that change", () => void remove(block));
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["availability-blocks"] });
    toast.success("Day freed up");
  }

  const rows = blocks.data ?? [];

  return (
    <>
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-line)] px-4 py-2.5">
          <Camera size={13} className="text-[var(--color-ink-3)]" />
          <h2 className="text-[12.5px] font-semibold tracking-tight">Shoots &amp; time off</h2>
          <span className="text-[11.5px] text-[var(--color-ink-3)]">
            next 60 days · comes straight out of Workload
          </span>
          <span className="ml-auto">
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
              <Plus size={13} /> Block a day
            </Button>
          </span>
        </div>

        {blocks.isLoading ? (
          <div className="skeleton m-4 h-16" />
        ) : rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12.5px] leading-relaxed text-[var(--color-ink-3)]">
            Nobody is booked out. Mark a shoot here and that person&apos;s hours
            disappear from the workload grid, with a warning to any strategist
            briefing them for that day.
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

                  <span className="tabular shrink-0 text-[11.5px] text-[var(--color-ink-2)]">
                    {new Date(`${block.day}T00:00:00`).toLocaleDateString(undefined, {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
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
      </Card>

      {adding && (
        <AddBlockDialog
          onClose={() => setAdding(false)}
          designers={designers}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["availability-blocks"] })}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ form */

/**
 * What the form should already say when it opens.
 *
 * Blocking a designer out from inside a call sheet is the same act as blocking
 * them from the Bandwidth tab, so it is the same form — it just starts with the
 * shoot's date, call time and name already in it. Retyping a date you are
 * looking at is how the wrong date gets blocked.
 */
export interface BlockPreset {
  day?: string;
  until?: string;
  span?: "whole" | "range";
  startTime?: string;
  endTime?: string;
  kind?: BlockKind;
  note?: string;
}

/**
 * Mounted only while it is open, so every opening starts from the preset
 * rather than from whatever the last person typed and abandoned.
 */
export function AddBlockDialog({
  onClose,
  designers,
  onSaved,
  preset,
}: {
  onClose: () => void;
  designers: Profile[];
  onSaved: () => void;
  preset?: BlockPreset;
}) {
  const supabase = supabaseBrowser();
  const [saving, setSaving] = useState(false);
  const [designerId, setDesignerId] = useState("");
  const [day, setDay] = useState(preset?.day || isoDay());
  const [until, setUntil] = useState(preset?.until ?? "");
  const [span, setSpan] = useState<"whole" | "range">(preset?.span ?? "whole");
  const [startTime, setStartTime] = useState(preset?.startTime || "10:00");
  const [endTime, setEndTime] = useState(preset?.endTime || "16:00");
  const [kind, setKind] = useState<BlockKind>(preset?.kind ?? "shoot");
  const [note, setNote] = useState(preset?.note ?? "");

  const person = designers.find((row) => row.id === designerId);
  const preview =
    span === "whole"
      ? person
        ? `all ${minutesToHuman(dayCapacity(person.daily_capacity_minutes, day))} of that day`
        : "the whole day"
      : minutesToHuman(minutesBetween(startTime, endTime));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!designerId) return;
    if (span === "range" && minutesBetween(startTime, endTime) <= 0) {
      toast.error("The end time has to be after the start.");
      return;
    }

    // A shoot usually runs several days; one form, one row per day.
    const days: string[] = [];
    const last = until && until > day ? until : day;
    for (let d = day; d <= last; d = addDays(d, 1)) {
      days.push(d);
      if (days.length > 60) break; // a runaway range is a typo, not a shoot
    }

    setSaving(true);
    const { error } = await withRetry(() =>
      supabase.from("availability_blocks").insert(
        days.map((d) => ({
          designer_id: designerId,
          day: d,
          start_time: span === "whole" ? null : startTime,
          end_time: span === "whole" ? null : endTime,
          kind,
          note: note.trim(),
        })),
      ),
    );
    setSaving(false);

    if (error) {
      reportWriteFailure(error.message, "that block", () => void submit(event));
      return;
    }

    toast.success(days.length === 1 ? "Day blocked" : `${days.length} days blocked`);
    setNote("");
    setUntil("");
    onSaved();
    onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Block someone's time"
      description="Their hours come out of the workload grid, and strategists get warned before briefing them for it."
      width={480}
    >
      <form onSubmit={submit}>
        <Field label="Who" htmlFor="block-who">
          <Select
            id="block-who"
            required
            value={designerId}
            onChange={(event) => setDesignerId(event.target.value)}
          >
            <option value="">Pick a designer</option>
            {designers.map((row) => (
              <option key={row.id} value={row.id}>
                {row.full_name || row.email}
              </option>
            ))}
          </Select>
        </Field>

        <div className="mt-3.5 grid grid-cols-2 gap-3">
          <Field label="From" htmlFor="block-day">
            <TextInput
              id="block-day"
              type="date"
              required
              value={day}
              onChange={(event) => setDay(event.target.value)}
            />
          </Field>
          <Field label="Until" htmlFor="block-until" hint="Blank for a single day">
            <TextInput
              id="block-until"
              type="date"
              min={day}
              value={until}
              onChange={(event) => setUntil(event.target.value)}
            />
          </Field>
        </div>

        <div className="mt-3.5 grid grid-cols-2 gap-3">
          <Field label="Reason" htmlFor="block-kind">
            <Select
              id="block-kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as BlockKind)}
            >
              {(Object.keys(BLOCK_KINDS) as BlockKind[]).map((key) => (
                <option key={key} value={key}>
                  {BLOCK_KINDS[key].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="How much" htmlFor="block-span">
            <Select
              id="block-span"
              value={span}
              onChange={(event) => setSpan(event.target.value as "whole" | "range")}
            >
              <option value="whole">Whole day</option>
              <option value="range">Part of the day</option>
            </Select>
          </Field>
        </div>

        {span === "range" && (
          <div className="mt-3.5 grid grid-cols-2 gap-3">
            <Field label="Start" htmlFor="block-start">
              <TextInput
                id="block-start"
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
              />
            </Field>
            <Field label="End" htmlFor="block-end">
              <TextInput
                id="block-end"
                type="time"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
              />
            </Field>
          </div>
        )}

        <Field
          label="Note"
          htmlFor="block-note"
          hint="Optional — where, or what for"
          className="mt-3.5"
        >
          <TextInput
            id="block-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="SuperBottoms warehouse shoot"
          />
        </Field>

        <p className="mt-3 flex items-start gap-2 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] px-2.5 py-2 text-[11.5px] leading-relaxed text-[var(--color-ink-2)]">
          <CalendarOff size={13} className="mt-0.5 shrink-0 text-[var(--color-ink-3)]" />
          <span>
            Takes {preview} out of {person ? person.full_name.split(" ")[0] : "their"} availability
            {until && until > day ? ", for every day in the range" : ""}.
          </span>
        </p>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving} disabled={!designerId}>
            Block it
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

/** "10:00" → "16:00" is 360. Returns 0 if the range is backwards. */
export function minutesBetween(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => !Number.isFinite(n))) return 0;
  return Math.max(0, eh * 60 + em - (sh * 60 + sm));
}
