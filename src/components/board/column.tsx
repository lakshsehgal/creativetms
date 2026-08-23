"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { TicketWithRefs } from "@/lib/types";
import type { Group } from "@/lib/grouping";
import { TicketCard } from "./ticket-card";

/**
 * One lane of the board.
 *
 * It takes a Group rather than a status, because the board can now stack by
 * brand, designer, priority, format or due date as well. The lane doesn't need
 * to know which — it gets a label, a colour and a list, and only the status
 * grouping ever passes canDrop.
 */
export function Column({
  group,
  canDrop,
  canStart,
  onStart,
  onOpen,
  showTime,
  draggableIds,
  empty,
}: {
  group: Group;
  canDrop: boolean;
  canStart: (ticket: TicketWithRefs) => boolean;
  onStart: (ticket: TicketWithRefs) => void;
  onOpen: (ticketId: string) => void;
  showTime: boolean;
  draggableIds: Set<string>;
  /** What to say when the lane is empty — only the status lanes have one. */
  empty?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${group.id}`, disabled: !canDrop });

  const units = group.tickets.reduce((sum, ticket) => sum + ticket.quantity, 0);

  return (
    <section data-tour={`col-${group.id}`} className="flex h-full w-[286px] shrink-0 flex-col">
      <header
        className="mb-2 flex items-center gap-2 rounded-[var(--radius-md)] px-2.5 py-1.5"
        style={{ background: `color-mix(in srgb, ${group.tone} 12%, transparent)` }}
        title={group.hint}
      >
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: group.tone }} />
        <h2
          className="min-w-0 truncate text-[12.5px] font-semibold tracking-tight"
          style={{ color: group.tone }}
        >
          {group.label}
        </h2>
        <span
          className="tabular ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold text-white"
          style={{ background: group.tone }}
        >
          {group.tickets.length}
        </span>
        {units > group.tickets.length && (
          <span className="tabular shrink-0 text-[10.5px] text-[var(--color-ink-3)]" title="Total units in this lane">
            {units}u
          </span>
        )}
      </header>

      <div
        ref={setNodeRef}
        className={`flex-1 space-y-2 overflow-y-auto rounded-[var(--radius-lg)] border p-2 transition-colors ${
          isOver && canDrop
            ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
            : "border-[var(--color-line)] bg-[var(--color-surface-2)]/70"
        }`}
      >
        <SortableContext
          items={group.tickets.map((ticket) => ticket.id)}
          strategy={verticalListSortingStrategy}
        >
          {group.tickets.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              draggable={draggableIds.has(ticket.id)}
              canStart={canStart(ticket)}
              onStart={onStart}
              onOpen={onOpen}
              showTime={showTime}
            />
          ))}
        </SortableContext>

        {group.tickets.length === 0 && empty && (
          <p className="px-1 py-6 text-center text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">
            {empty}
          </p>
        )}
      </div>
    </section>
  );
}
