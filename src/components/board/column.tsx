"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { TicketStatus, TicketWithRefs } from "@/lib/types";
import { STATUSES } from "@/lib/types";
import { TicketCard } from "./ticket-card";

export function Column({
  status,
  tickets,
  canDrop,
  canStart,
  onStart,
  draggableIds,
}: {
  status: TicketStatus;
  tickets: TicketWithRefs[];
  canDrop: boolean;
  canStart: (ticket: TicketWithRefs) => boolean;
  onStart: (ticket: TicketWithRefs) => void;
  draggableIds: Set<string>;
}) {
  const meta = STATUSES[status];
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}`, disabled: !canDrop });

  const units = tickets.reduce((sum, ticket) => sum + ticket.quantity, 0);

  return (
    <section className="flex h-full w-[286px] shrink-0 flex-col">
      <header className="mb-2 flex items-center gap-2 px-1">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: meta.tone }} />
        <h2 className="text-[12.5px] font-semibold tracking-tight">{meta.label}</h2>
        <span className="tabular rounded-full bg-[var(--color-surface-3)] px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--color-ink-2)]">
          {tickets.length}
        </span>
        {units > tickets.length && (
          <span className="tabular text-[10.5px] text-[var(--color-ink-3)]" title="Total units in this column">
            {units} units
          </span>
        )}
      </header>

      <div
        ref={setNodeRef}
        className={`flex-1 space-y-2 overflow-y-auto rounded-[var(--radius-lg)] border p-2 transition-colors ${
          isOver && canDrop
            ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
            : "border-transparent bg-[var(--color-surface)]/60"
        }`}
      >
        <SortableContext
          items={tickets.map((ticket) => ticket.id)}
          strategy={verticalListSortingStrategy}
        >
          {tickets.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              draggable={draggableIds.has(ticket.id)}
              canStart={canStart(ticket)}
              onStart={onStart}
            />
          ))}
        </SortableContext>

        {tickets.length === 0 && (
          <p className="px-1 py-6 text-center text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">
            {meta.hint}
          </p>
        )}
      </div>
    </section>
  );
}
