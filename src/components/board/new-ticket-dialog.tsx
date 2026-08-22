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

  const { title, brief, format, quantity, priority, brandId, assignee, dueAt, references } =
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

  const [saving, setSaving] = useState(false);

  // Mirrors the database rule in enforce_due_date_rule().
  const pastNoon = new Date().getHours() >= 12;
  const earliestDue = (() => {
    const date = new Date();
    if (pastNoon) date.setDate(date.getDate() + 1);
    date.setHours(0, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T00:00`;
  })();

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

        <div className="mt-3.5 grid grid-cols-2 gap-3">
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

          <Field
            label="Due"
            htmlFor="due"
            hint={pastNoon ? "After midday — earliest is tomorrow" : undefined}
          >
            <TextInput
              id="due"
              type="datetime-local"
              // Past midday the picker won't offer today at all. A brief
              // raised this afternoon can't realistically ship tonight — the
              // designer's day was planned this morning.
              min={earliestDue}
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
            />
          </Field>
        </div>

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
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            Raise ticket
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
