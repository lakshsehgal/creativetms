"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Brand, CreativeFormat, Profile, TicketPriority } from "@/lib/types";
import { FORMAT_ORDER, FORMATS, PRIORITIES } from "@/lib/types";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useDraft } from "@/hooks/use-draft";
import { withRetry, reportWriteFailure } from "@/lib/write";
import { queryKeys } from "@/lib/queries";
import { Flame } from "lucide-react";
import { isStudioToday, needsRushApproval, pastNoonInStudio, rushReasonOk } from "@/lib/rush";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { AvailabilityWarning } from "./availability-warning";
import { Button, Field, Select, TextArea, TextInput } from "@/components/ui/form";

/** Everything the form holds, so it can be stored and restored as one thing. */
interface DraftTicket {
  title: string;
  brief: string;
  format: CreativeFormat;
  quantity: number;
  priority: TicketPriority;
  brandId: string;
  assignee: string;
  dueAt: string;
  references: string;
  /** Set only when someone deliberately breaks the noon rule. */
  rush: boolean;
  needsAi: boolean;
  rushReason: string;
}

const EMPTY: DraftTicket = {
  title: "",
  brief: "",
  format: "static",
  quantity: 1,
  priority: "normal",
  brandId: "",
  assignee: "",
  dueAt: "",
  references: "",
  rush: false,
  needsAi: false,
  rushReason: "",
};

export function NewTicketDialog({
  open,
  onClose,
  brands,
  designers,
  authorId,
}: {
  open: boolean;
  onClose: () => void;
  brands: Brand[];
  designers: Profile[];
  authorId: string;
}) {
  const supabase = supabaseBrowser();
  const queryClient = useQueryClient();

  /**
   * The whole form is one draft.
   *
   * A brief is the longest thing anybody types in this tool, and the dialog
   * closes on Escape and on a backdrop click — both one keystroke away from
   * losing twenty minutes of writing. It's kept until the ticket is actually
   * raised.
   */
  const draft = useDraft<DraftTicket>(
    `new-ticket:${authorId}`,
    EMPTY,
    (value) =>
      value.title.trim().length > 0 ||
      value.brief.trim().length > 0 ||
      value.references.trim().length > 0,
  );
  const form = draft.value;
  const field = <K extends keyof DraftTicket>(key: K, value: DraftTicket[K]) =>
    draft.set((previous) => ({ ...previous, [key]: value }));

  const { title, brief, format, quantity, priority, brandId, assignee, dueAt, references, rush, rushReason, needsAi } =
    form;

  const setTitle = (value: string) => field("title", value);
  const setBrief = (value: string) => field("brief", value);
  const setFormat = (value: CreativeFormat) => field("format", value);
  const setQuantity = (value: number) => field("quantity", value);
  const setPriority = (value: TicketPriority) => field("priority", value);
  const setBrandId = (value: string) => field("brandId", value);
  const setAssignee = (value: string) => field("assignee", value);
  const setDueAt = (value: string) => field("dueAt", value);
  const setReferences = (value: string) => field("references", value);
  const setRushReason = (value: string) => field("rushReason", value);

  const [saving, setSaving] = useState(false);

  // Mirrors the database rule in enforce_due_date_rule(), including its one
  // door: an escalation somebody has put a reason to. Judged in the studio's
  // clock rather than the browser's — see lib/rush.ts.
  const pastNoon = pastNoonInStudio();
  const earliestDue = (() => {
    const date = new Date();
    if (pastNoon && !rush) date.setDate(date.getDate() + 1);
    date.setHours(0, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T00:00`;
  })();

  // Only an escalation that is actually for today needs approving. Ticking the
  // box and then picking Friday is just a normal brief.
  const dueToday = Boolean(dueAt) && isStudioToday(new Date(dueAt));
  const needsApproval = rush && needsRushApproval(dueAt);

  function toggleRush(on: boolean) {
    draft.set((previous) => ({
      ...previous,
      rush: on,
      // Turning it off puts the date back inside the rule rather than leaving
      // an impossible one sitting in the field.
      dueAt: on ? previous.dueAt : "",
      rushReason: on ? previous.rushReason : "",
    }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setSaving(true);

    const { error } = await withRetry(() =>
      supabase.from("tickets").insert({
        title: title.trim(),
        brief: brief.trim(),
        format,
        quantity,
        priority,
        brand_id: brandId || null,
        created_by: authorId,
        assigned_to: assignee || null,
        status: "new_request",
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        needs_ai: needsAi,
        // The database decides what this means: it holds the designer back,
        // routes it for approval, and auto-approves an admin's own.
        rush_state: needsApproval ? "pending" : null,
        rush_reason: needsApproval ? rushReason.trim() : "",
        reference_urls: references
          .split(/[\n,]/)
          .map((url) => url.trim())
          .filter(Boolean),
        position: Date.now(),
      }),
    );

    setSaving(false);

    if (error) {
      // Everything typed stays on screen and in the stored draft.
      reportWriteFailure(error.message, "that brief", () => void submit(event));
      return;
    }

    // Realtime will deliver the row, but refetching keeps the joined brand and
    // assignee correct even if the socket is slow to arrive.
    queryClient.invalidateQueries({ queryKey: queryKeys.tickets });
    toast.success(assignee ? "Ticket raised and assigned" : "Ticket raised to the backlog");
    // Saved for real — the stored copy can go.
    draft.clear();
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New creative ticket"
      description="Leave the designer blank to drop it in the backlog for someone to claim."
      width={580}
    >
      <form onSubmit={submit}>
        {draft.restored && (
          <p className="mb-3 flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-accent-soft)] px-2.5 py-1.5 text-[11.5px]">
            Picked up where you left off.
            <button
              type="button"
              onClick={draft.discard}
              className="ml-auto font-medium underline underline-offset-2"
            >
              Start fresh
            </button>
          </p>
        )}

        <Field label="Title" htmlFor="title">
          <TextInput
            id="title"
            autoFocus
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Diwali sale — hero video"
          />
        </Field>

        <Field label="Brief" htmlFor="brief" className="mt-3.5">
          <TextArea
            id="brief"
            rows={4}
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            placeholder="What's the ask, the hook, the deliverable spec, anything the designer shouldn't have to ask for."
          />
        </Field>

        <div data-tour="brief-format" className="mt-3.5 grid grid-cols-2 gap-3">
          <Field label="Format" htmlFor="format">
            <Select
              id="format"
              value={format}
              onChange={(event) => setFormat(event.target.value as CreativeFormat)}
            >
              {FORMAT_ORDER.map((key) => (
                <option key={key} value={key}>
                  {FORMATS[key].label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="How many" htmlFor="quantity" hint="Drives minutes-per-unit">
            <TextInput
              id="quantity"
              type="number"
              min={1}
              max={200}
              value={quantity}
              onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
            />
          </Field>
        </div>

        <div className="mt-3.5 grid grid-cols-2 gap-3">
          <Field label="Brand" htmlFor="brand">
            <Select id="brand" value={brandId} onChange={(event) => setBrandId(event.target.value)}>
              <option value="">No brand</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Priority" htmlFor="priority">
            <Select
              id="priority"
              value={priority}
              onChange={(event) => setPriority(event.target.value as TicketPriority)}
            >
              {(Object.keys(PRIORITIES) as TicketPriority[]).map((key) => (
                <option key={key} value={key}>
                  {PRIORITIES[key].label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="mt-3.5 grid grid-cols-2 gap-3">
          <div data-tour="brief-designer">
            <Field label="Designer" htmlFor="assignee" hint="Optional">
              <Select
                id="assignee"
                value={assignee}
                onChange={(event) => setAssignee(event.target.value)}
              >
                <option value="">Leave in backlog</option>
                {designers.map((designer) => (
                  <option key={designer.id} value={designer.id}>
                    {designer.full_name || designer.email}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div data-tour="brief-due">
            <Field
              label="Due"
              htmlFor="due"
              hint={pastNoon && !rush ? "After midday — earliest is tomorrow" : undefined}
            >
              <TextInput
                id="due"
                type="datetime-local"
                // Past midday the picker won't offer today, unless the
                // escalation below is switched on. A brief raised this
                // afternoon can't realistically ship tonight — the designer's
                // day was planned this morning — and the exception is a
                // decision, not a default.
                min={earliestDue}
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
              />
            </Field>
          </div>
        </div>

        {/* Generation. Ticking it changes what this is expected to cost, so
            the designer isn't measured against a bar for work made by hand.
            They can tick it themselves later too — usually they are the ones
            who find out a brief needs generating, because it rarely says so. */}
        <label className="mt-3.5 flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--color-line)] px-3 py-2.5 text-[12.5px]">
          <input
            type="checkbox"
            checked={needsAi}
            onChange={(event) => field("needsAi", event.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">Needs AI generation</span>
            <span className="mt-0.5 block text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">
              The imagery or footage has to be generated before it can be built.
              It takes longer, and this is what makes the expected time say so.
            </span>
          </span>
        </label>

        {/* ------------------------------------------------- the exception */}
        {pastNoon && (
          <div
            data-tour="brief-rush"
            className="mt-3.5 rounded-[var(--radius-md)] border px-3 py-2.5"
            style={{
              borderColor: rush
                ? "color-mix(in srgb, var(--color-serious) 45%, transparent)"
                : "var(--color-line)",
              background: rush
                ? "color-mix(in srgb, var(--color-serious) 7%, transparent)"
                : "transparent",
            }}
          >
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={rush}
                onChange={(event) => toggleRush(event.target.checked)}
                className="mt-0.5 shrink-0"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-[12.5px] font-medium">
                  <Flame size={13} style={{ color: "var(--color-serious)" }} />
                  This can&apos;t wait until tomorrow
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-relaxed text-[var(--color-ink-2)]">
                  Unlocks today&apos;s date. An operator or an admin has to agree
                  before it reaches a designer — until then nobody is working on
                  it.
                </span>
              </span>
            </label>

            {rush && (
              <div className="mt-2.5 pl-[26px]">
                <TextArea
                  rows={2}
                  aria-label="Why this can't wait"
                  placeholder="What's actually on fire? Whoever approves it reads this."
                  value={rushReason}
                  onChange={(event) => setRushReason(event.target.value)}
                />
                {needsApproval && rushReason.trim().length > 0 && !rushReasonOk(rushReason) && (
                  <p className="mt-1.5 text-[11px]" style={{ color: "var(--color-serious)" }}>
                    A few more words — a sentence somebody can act on.
                  </p>
                )}
                {rush && !dueToday && dueAt && (
                  <p className="mt-1.5 text-[11px] text-[var(--color-ink-3)]">
                    That date isn&apos;t today, so this goes through as an
                    ordinary brief — no approval needed.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <Field
          label="Reference links"
          htmlFor="refs"
          className="mt-3.5"
          hint="One per line — Drive folders, competitor ads, brand kit"
        >
          <TextArea
            id="refs"
            rows={2}
            value={references}
            onChange={(event) => setReferences(event.target.value)}
            placeholder="https://drive.google.com/..."
          />
        </Field>

        <AvailabilityWarning designerId={assignee} dueAt={dueAt} designers={designers} />

        <DialogFooter>
          <Button data-tour="brief-close" type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {/* The label says what will actually happen. "Raise ticket" on an
              escalation would imply it lands on somebody, and it doesn't. */}
          <Button
            type="submit"
            variant="primary"
            loading={saving}
            disabled={needsApproval && !rushReasonOk(rushReason)}
          >
            {needsApproval ? "Send for approval" : "Raise ticket"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
