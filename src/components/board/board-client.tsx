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
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search, SlidersHorizontal } from "lucide-react";
import type { Brand, Profile, TicketStatus, TicketWithRefs } from "@/lib/types";
import { ALLOWED_TARGETS, BOARD_COLUMNS, FORMAT_ORDER, FORMATS, STATUSES } from "@/lib/types";
import { supabaseBrowser } from "@/lib/supabase/client";
import { positionBetween, queryKeys } from "@/lib/queries";
import { useLiveTickets } from "@/hooks/use-live-tickets";
import { Button, Select, TextInput } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/primitives";
import { Column } from "./column";
import { TicketCard } from "./ticket-card";
import { NewTicketDialog } from "./new-ticket-dialog";

interface Props {
  profile: Profile;
  initialTickets: TicketWithRefs[];
  brands: Brand[];
  designers: Profile[];
}

export function BoardClient({ profile, initialTickets, brands, designers }: Props) {
  const supabase = supabaseBrowser();
  const queryClient = useQueryClient();
  const { tickets } = useLiveTickets(initialTickets);

  const [dragging, setDragging] = useState<TicketWithRefs | null>(null);
  const [composing, setComposing] = useState(false);
  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("all");
  const [formatFilter, setFormatFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState(profile.role === "designer" ? "me" : "all");

  const sensors = useSensors(
    // A few pixels of slop means clicking a card's link doesn't start a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return tickets.filter((ticket) => {
      if (brandFilter !== "all" && ticket.brand_id !== brandFilter) return false;
      if (formatFilter !== "all" && ticket.format !== formatFilter) return false;
      if (ownerFilter === "me" && ticket.assigned_to !== profile.id) return false;
      if (ownerFilter === "unassigned" && ticket.assigned_to) return false;
      if (ownerFilter !== "all" && ownerFilter !== "me" && ownerFilter !== "unassigned") {
        if (ticket.assigned_to !== ownerFilter) return false;
      }
      if (needle) {
        const haystack =
          `${ticket.number} ${ticket.title} ${ticket.brand?.name ?? ""} ${ticket.assignee?.full_name ?? ""}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [tickets, search, brandFilter, formatFilter, ownerFilter, profile.id]);

  const byColumn = useMemo(() => {
    const map = new Map<TicketStatus, TicketWithRefs[]>();
    BOARD_COLUMNS.forEach((status) => map.set(status, []));
    visible.forEach((ticket) => map.get(ticket.status)?.push(ticket));
    map.forEach((list) => list.sort((a, b) => a.position - b.position));
    return map;
  }, [visible]);

  /** A designer drags their own work, plus anything free in the backlog. */
  const draggableIds = useMemo(() => {
    const ids = new Set<string>();
    visible.forEach((ticket) => {
      if (profile.role !== "designer" || ticket.assigned_to === profile.id || !ticket.assigned_to) {
        ids.add(ticket.id);
      }
    });
    return ids;
  }, [visible, profile]);

  const allowedTargets = ALLOWED_TARGETS[profile.role];

  const canStart = useCallback(
    (ticket: TicketWithRefs) =>
      profile.role === "designer" &&
      ticket.status !== "in_progress" &&
      ["backlog", "assigned", "revisions"].includes(ticket.status) &&
      (!ticket.assigned_to || ticket.assigned_to === profile.id),
    [profile],
  );

  /** Optimistic write: patch the cache first, reconcile with the server after. */
  const applyMove = useCallback(
    async (ticket: TicketWithRefs, status: TicketStatus, position: number) => {
      const previous = queryClient.getQueryData<TicketWithRefs[]>(queryKeys.tickets);

      queryClient.setQueryData<TicketWithRefs[]>(queryKeys.tickets, (rows) =>
        (rows ?? []).map((row) =>
          row.id === ticket.id
            ? {
                ...row,
                status,
                position,
                assigned_to:
                  row.assigned_to ?? (status !== "backlog" ? profile.id : null),
              }
            : // Starting a ticket parks whatever else this designer had live.
              status === "in_progress" &&
                row.assigned_to === (ticket.assigned_to ?? profile.id) &&
                row.status === "in_progress"
              ? { ...row, status: "assigned" as TicketStatus }
              : row,
        ),
      );

      const patch: Record<string, unknown> = { status, position };
      if (!ticket.assigned_to && status !== "backlog") patch.assigned_to = profile.id;

      const { error } = await supabase.from("tickets").update(patch).eq("id", ticket.id);

      if (error) {
        queryClient.setQueryData(queryKeys.tickets, previous);
        toast.error(error.message.replace(/^.*?:\s*/, ""));
        return;
      }

      // The clock changed, so the elapsed figures did too.
      queryClient.invalidateQueries({ queryKey: queryKeys.ticketTime });
    },
    [queryClient, supabase, profile.id],
  );

  function onDragStart(event: DragStartEvent) {
    setDragging(tickets.find((ticket) => ticket.id === event.active.id) ?? null);
  }

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

    const position = positionBetween(
      column[dropIndex - 1]?.position,
      column[dropIndex]?.position,
    );

    if (target === ticket.status && position === ticket.position) return;
    void applyMove(ticket, target, position);
  }

  const startTicket = useCallback(
    (ticket: TicketWithRefs) => {
      const column = byColumn.get("in_progress") ?? [];
      void applyMove(ticket, "in_progress", positionBetween(undefined, column[0]?.position));
    },
    [applyMove, byColumn],
  );

  const liveCount = tickets.filter((t) => t.status === "in_progress").length;

  return (
    <>
      <PageHeader
        title="Board"
        subtitle={`${visible.length} open · ${liveCount} being worked on right now`}
      >
        {profile.role !== "designer" && (
          <Button variant="primary" size="sm" onClick={() => setComposing(true)}>
            <Plus size={14} /> New ticket
          </Button>
        )}
      </PageHeader>

      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-line)] px-5 py-2.5">
        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)]"
          />
          <TextInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search tickets"
            aria-label="Search tickets"
            className="!w-56 !py-1.5 !pl-7 !text-[12.5px]"
          />
        </div>

        <SlidersHorizontal size={13} className="ml-1 text-[var(--color-ink-3)]" />

        <Select
          value={brandFilter}
          onChange={(event) => setBrandFilter(event.target.value)}
          aria-label="Filter by brand"
          className="!w-auto !py-1.5 !text-[12.5px]"
        >
          <option value="all">All brands</option>
          {brands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </Select>

        <Select
          value={formatFilter}
          onChange={(event) => setFormatFilter(event.target.value)}
          aria-label="Filter by format"
          className="!w-auto !py-1.5 !text-[12.5px]"
        >
          <option value="all">All formats</option>
          {FORMAT_ORDER.map((format) => (
            <option key={format} value={format}>
              {FORMATS[format].label}
            </option>
          ))}
        </Select>

        <Select
          value={ownerFilter}
          onChange={(event) => setOwnerFilter(event.target.value)}
          aria-label="Filter by designer"
          className="!w-auto !py-1.5 !text-[12.5px]"
        >
          <option value="all">Everyone</option>
          <option value="me">Just mine</option>
          <option value="unassigned">Unassigned</option>
          {profile.role !== "designer" &&
            designers.map((designer) => (
              <option key={designer.id} value={designer.id}>
                {designer.full_name || designer.email}
              </option>
            ))}
        </Select>
      </div>

      <DndContext
        // Fixed id: without it dnd-kit numbers its aria ids from a global
        // counter, so the server and client disagree and hydration throws the
        // whole board away and re-renders it.
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
              onStart={startTicket}
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

      <NewTicketDialog
        open={composing}
        onClose={() => setComposing(false)}
        brands={brands}
        designers={designers}
        authorId={profile.id}
      />
    </>
  );
}
