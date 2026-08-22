"use client";

import { useCallback, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { toast } from "sonner";
import type { Profile, TicketStatus, TicketWithRefs } from "@/lib/types";
import { ALLOWED_TARGETS, BOARD_COLUMNS, STATUSES } from "@/lib/types";
import { positionBetween } from "@/lib/queries";
import { Column } from "@/components/board/column";
import { TicketCard } from "@/components/board/ticket-card";

export function BoardView({
  profile,
  tickets,
  onMove,
  onStart,
  onOpen,
}: {
  profile: Profile;
  tickets: TicketWithRefs[];
  onMove: (ticket: TicketWithRefs, status: TicketStatus, position: number) => void;
  onStart: (ticket: TicketWithRefs) => void;
  onOpen: (ticketId: string) => void;
}) {
  const [dragging, setDragging] = useState<TicketWithRefs | null>(null);

  const sensors = useSensors(
    // A few pixels of slop so clicking a card's link doesn't start a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byColumn = useMemo(() => {
    const map = new Map<TicketStatus, TicketWithRefs[]>();
    BOARD_COLUMNS.forEach((status) => map.set(status, []));
    tickets.forEach((ticket) => map.get(ticket.status)?.push(ticket));
    map.forEach((list) => list.sort((a, b) => a.position - b.position));
    return map;
  }, [tickets]);

  /** A designer drags their own work, plus anything free in New Request. */
  const draggableIds = useMemo(() => {
    const ids = new Set<string>();
    tickets.forEach((ticket) => {
      if (
        profile.role !== "designer" ||
        ticket.assigned_to === profile.id ||
        !ticket.assigned_to
      ) {
        ids.add(ticket.id);
      }
    });
    return ids;
  }, [tickets, profile]);

  const allowedTargets = ALLOWED_TARGETS[profile.role];

  const canStart = useCallback(
    (ticket: TicketWithRefs) =>
      profile.role === "designer" &&
      ticket.status !== "in_progress" &&
      ["new_request", "size_changes", "needs_edit", "on_hold", "awaiting_assets"].includes(
        ticket.status,
      ) &&
      (!ticket.assigned_to || ticket.assigned_to === profile.id),
    [profile],
  );

  function onDragEnd(event: DragEndEvent) {
    const ticket = dragging;
    setDragging(null);
    if (!ticket || !event.over) return;

    const overId = String(event.over.id);
    const target = overId.startsWith("col:")
      ? (overId.slice(4) as TicketStatus)
      : tickets.find((row) => row.id === overId)?.status;
    if (!target) return;

    if (!allowedTargets.includes(target)) {
      toast.error(`${STATUSES[target].label} isn't yours to move work into.`);
      return;
    }

    const column = (byColumn.get(target) ?? []).filter((row) => row.id !== ticket.id);
    const dropIndex = overId.startsWith("col:")
      ? column.length
      : Math.max(0, column.findIndex((row) => row.id === overId));

    const position = positionBetween(column[dropIndex - 1]?.position, column[dropIndex]?.position);
    if (target === ticket.status && position === ticket.position) return;

    onMove(ticket, target, position);
  }

  function onDragStart(event: DragStartEvent) {
    setDragging(tickets.find((ticket) => ticket.id === event.active.id) ?? null);
  }

  return (
    <DndContext
      // Fixed id: without it dnd-kit numbers its aria ids from a global
      // counter, so server and client disagree and hydration rebuilds the board.
      id="board"
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="flex flex-1 gap-3 overflow-x-auto px-5 py-4">
        {BOARD_COLUMNS.map((status) => (
          <Column
            key={status}
            status={status}
            tickets={byColumn.get(status) ?? []}
            canDrop={allowedTargets.includes(status)}
            canStart={canStart}
            onStart={onStart}
            onOpen={onOpen}
            draggableIds={draggableIds}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
        {dragging && (
          <div className="w-[270px] rotate-1 shadow-[var(--shadow-drag)]">
            <TicketCard ticket={dragging} draggable={false} canStart={false} onStart={() => {}} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
