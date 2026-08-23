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
import { ALLOWED_TARGETS, STATUSES, canSeeOwnTime } from "@/lib/types";
import { isDraggable, type Group, type GroupKey } from "@/lib/grouping";
import { positionBetween } from "@/lib/queries";
import { Column } from "@/components/board/column";
import { TicketCard } from "@/components/board/ticket-card";

export function BoardView({
  profile,
  tickets,
  groups,
  groupBy,
  onMove,
  onStart,
  onOpen,
}: {
  profile: Profile;
  tickets: TicketWithRefs[];
  groups: Group[];
  groupBy: GroupKey;
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

  /** Lanes in their given order, cards in the order people dragged them into. */
  const lanes = useMemo(
    () =>
      groups.map((group) => ({
        ...group,
        tickets: [...group.tickets].sort((a, b) => a.position - b.position),
      })),
    [groups],
  );

  const dragEnabled = isDraggable(groupBy);

  /** A designer drags their own work, plus anything free in New Request. */
  const draggableIds = useMemo(() => {
    const ids = new Set<string>();
    if (!dragEnabled) return ids;
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
  }, [tickets, profile, dragEnabled]);

  const allowedTargets = ALLOWED_TARGETS[profile.role];

  const canStart = useCallback(
    (ticket: TicketWithRefs) =>
      profile.role === "designer" &&
      ticket.status !== "in_progress" &&
      ["new_request", "size_changes", "needs_edit", "on_hold", "awaiting_assets"].includes(
        ticket.status,
      ) &&
      // A same-day escalation nobody has agreed to yet is not claimable, even
      // though it's sitting unassigned in New Request like any other backlog
      // item. The database refuses it too — this only avoids offering a button
      // that would come back with an error.
      ticket.rush_state !== "pending" &&
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

    // Same rule as the Start button, for the other way of moving a card. The
    // database refuses this as well; saying so here saves a round trip and
    // explains it in terms of what's actually happening.
    if (ticket.rush_state === "pending" && target !== ticket.status) {
      toast.error("Still waiting on approval", {
        description:
          "An operator or an admin has to agree to this one before anybody picks it up.",
      });
      return;
    }

    const column = (lanes.find((lane) => lane.id === target)?.tickets ?? []).filter(
      (row) => row.id !== ticket.id,
    );
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
        {lanes.map((lane) => (
          <Column
            key={lane.id}
            group={lane}
            canDrop={dragEnabled && allowedTargets.includes(lane.id as TicketStatus)}
            canStart={canStart}
            onStart={onStart}
            onOpen={onOpen}
            showTime={canSeeOwnTime(profile.role)}
            draggableIds={draggableIds}
            empty={dragEnabled ? lane.hint : undefined}
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
