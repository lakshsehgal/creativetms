"use client";

import { memo } from "react";
import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Link2, Play, RotateCcw, Timer } from "lucide-react";
import type { TicketWithRefs } from "@/lib/types";
import { dueLabel, dueState, humanDuration } from "@/lib/format";
import { Avatar, FormatBadge, PriorityFlag } from "@/components/ui/primitives";

const DUE_TONE: Record<string, string> = {
  overdue: "var(--color-critical)",
  today: "var(--color-warning)",
  soon: "var(--color-serious)",
  ok: "var(--color-ink-3)",
  none: "var(--color-ink-3)",
};

interface Props {
  ticket: TicketWithRefs;
  draggable: boolean;
  canStart: boolean;
  onStart: (ticket: TicketWithRefs) => void;
}

function TicketCardInner({ ticket, draggable, canStart, onStart }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ticket.id,
    disabled: !draggable,
    data: { status: ticket.status },
  });

  const due = dueState(ticket);
  const running = ticket.status === "in_progress";

  return (
    <article
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
      }}
      {...attributes}
      {...listeners}
      className={`group relative rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] p-3 shadow-[0_1px_2px_rgb(16_24_40/0.04)] transition-[box-shadow,transform,border-color] duration-150 hover:-translate-y-px hover:border-[var(--color-line-strong)] hover:shadow-[0_4px_12px_-2px_rgb(16_24_40/0.10)] ${
        draggable ? "cursor-grab active:cursor-grabbing" : ""
      }`}
    >
      {running && (
        <span
          aria-hidden
          className="breathe absolute right-3 top-3 h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--color-accent)" }}
        />
      )}

      <div className="flex items-center gap-1.5">
        <FormatBadge format={ticket.format} quantity={ticket.quantity} />
        <PriorityFlag priority={ticket.priority} />
      </div>

      <Link
        href={`/tickets/${ticket.id}`}
        // The card is a drag handle, so the link opts out of the pointer sensor.
        onPointerDown={(event) => event.stopPropagation()}
        className="mt-2 block text-[13px] font-medium leading-snug tracking-tight hover:text-[var(--color-accent)]"
      >
        {ticket.title}
      </Link>

      {ticket.brand && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[var(--color-ink-3)]">
          <span
            className="h-2 w-2 shrink-0 rounded-[2px]"
            style={{ background: ticket.brand.color }}
          />
          {ticket.brand.name}
        </p>
      )}

      <footer className="mt-3 flex items-center gap-2">
        {ticket.assignee ? (
          <Avatar
            id={ticket.assignee.id}
            name={ticket.assignee.full_name}
            email={ticket.assignee.email}
            size={20}
            title={ticket.assignee.full_name}
          />
        ) : (
          <span className="grid h-5 w-5 place-items-center rounded-full border border-dashed border-[var(--color-line-strong)] text-[9px] text-[var(--color-ink-3)]">
            ?
          </span>
        )}

        {ticket.revision_count > 0 && (
          <span
            className="tabular inline-flex items-center gap-0.5 text-[10.5px]"
            style={{ color: "var(--color-serious)" }}
            title={`${ticket.revision_count} revision round${ticket.revision_count > 1 ? "s" : ""}`}
          >
            <RotateCcw size={10} />
            {ticket.revision_count}
          </span>
        )}

        {ticket.review_url && (
          <a
            href={ticket.review_url}
            target="_blank"
            rel="noopener noreferrer"
            onPointerDown={(event) => event.stopPropagation()}
            title="Open the Frame.io review"
            aria-label={`Open the review for ${ticket.title}`}
            className="text-[var(--color-ink-3)] transition-colors hover:text-[var(--color-accent)]"
          >
            <Link2 size={11} />
          </a>
        )}

        {(ticket.total_seconds ?? 0) > 0 && (
          <span
            className="tabular inline-flex items-center gap-1 text-[10.5px] text-[var(--color-ink-3)]"
            title="Time tracked on this ticket"
          >
            <Timer size={10} />
            {humanDuration(ticket.total_seconds)}
          </span>
        )}

        <span className="ml-auto flex items-center gap-1.5">
          {ticket.due_at && (
            <span
              // Relative to "now", so the server and client can word it
              // differently either side of a boundary. The client value wins.
              suppressHydrationWarning
              className="text-[10.5px] font-medium"
              style={{ color: DUE_TONE[due] }}
            >
              {dueLabel(ticket.due_at)}
            </span>
          )}

          {canStart && !running && (
            <button
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onStart(ticket)}
              title="Start working — this starts the clock"
              aria-label={`Start working on ${ticket.title}`}
              className="grid h-6 w-6 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] opacity-0 transition-[opacity,color,background-color] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)] focus-visible:opacity-100 group-hover:opacity-100"
            >
              <Play size={11} fill="currentColor" />
            </button>
          )}
        </span>
      </footer>
    </article>
  );
}

export const TicketCard = memo(TicketCardInner);
