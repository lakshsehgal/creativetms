"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarPlus, GripVertical, Lightbulb, Play, X } from "lucide-react";
import type { FormatBenchmark, Profile, TicketWithRefs } from "@/lib/types";
import { dueLabel, dueState, isoDay, minutesToHuman } from "@/lib/format";
import { benchmarkMap, dayCapacity, estimateMinutes } from "@/lib/planning";
import { suggestForToday } from "@/lib/suggest";
import { supabaseBrowser } from "@/lib/supabase/client";
import { positionBetween, queryKeys } from "@/lib/queries";
import { withRetry, reportWriteFailure } from "@/lib/write";
import { Card, EmptyState, FormatBadge, StatusPill } from "@/components/ui/primitives";
import { EtaAsks } from "./eta-asks";
import { Button } from "@/components/ui/form";

/**
 * The designer's day, chosen by the designer.
 *
 * A brief raised with today's due date does not appear here — it appears in
 * "Everything assigned to you" below, and somebody has to pick it. That is
 * the whole point: a strategist setting a date states when they need it, not
 * what somebody's Tuesday looks like.
 *
 * Suggestions rank that assigned list by how loudly the calendar is asking,
 * with the reason shown next to each one. They are a recommendation and
 * nothing more — nothing is added until it's clicked, and the running order
 * afterwards is dragged into whatever shape the person actually works in.
 */
export function DayPlan({
  profile,
  tickets,
  benchmarks,
  onStart,
}: {
  profile: Profile;
  tickets: TicketWithRefs[];
  benchmarks: FormatBenchmark[];
  onStart: (ticket: TicketWithRefs) => void;
}) {
  const supabase = supabaseBrowser();
  const queryClient = useQueryClient();
  const [showAll, setShowAll] = useState(false);

  const today = isoDay();
  const lookup = useMemo(() => benchmarkMap(benchmarks), [benchmarks]);

  const mine = useMemo(
    () => tickets.filter((ticket) => ticket.assigned_to === profile.id),
    [tickets, profile.id],
  );

  /** Today's list, in the order it will be worked. */
  const plan = useMemo(
    () =>
      mine
        .filter((ticket) => ticket.planned_for === today && ticket.status !== "approved")
        .sort((a, b) => (a.plan_position ?? 0) - (b.plan_position ?? 0)),
    [mine, today],
  );

  const plannedMinutes = useMemo(
    () =>
      plan.reduce((sum, ticket) => sum + (estimateMinutes(ticket, lookup) ?? 0), 0),
    [plan, lookup],
  );

  const capacity = dayCapacity(profile.daily_capacity_minutes, today);
  const remaining = Math.max(0, capacity - plannedMinutes);

  const suggestions = useMemo(
    () =>
      suggestForToday({
        tickets: mine,
        today,
        benchmarks: lookup,
        // Zero is a real answer, not a missing one — a full day flags
        // every suggestion rather than silently flagging none.
        capacityMinutes: capacity > 0 ? remaining : null,
        limit: 4,
      }),
    [mine, today, lookup, remaining],
  );

  const suggestedIds = new Set(suggestions.map((row) => row.ticket.id));

  /** Everything else that's assigned and still open. */
  const rest = useMemo(
    () =>
      mine
        .filter(
          (ticket) =>
            ticket.planned_for !== today &&
            !suggestedIds.has(ticket.id) &&
            ticket.status !== "approved" &&
            ticket.status !== "ready_for_approval" &&
            ticket.status !== "sent_to_client",
        )
        .sort((a, b) => (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mine, today, suggestions],
  );

  /* --------------------------------------------------------------- writes */

  const patch = useCallback(
    async (ticket: TicketWithRefs, fields: Record<string, unknown>) => {
      const previous = queryClient.getQueryData<TicketWithRefs[]>(queryKeys.tickets);
      queryClient.setQueryData<TicketWithRefs[]>(queryKeys.tickets, (rows) =>
        (rows ?? []).map((row) =>
          row.id === ticket.id ? ({ ...row, ...fields } as TicketWithRefs) : row,
        ),
      );

      const { error } = await withRetry(() =>
        supabase.from("tickets").update(fields).eq("id", ticket.id),
      );

      if (error) {
        queryClient.setQueryData(queryKeys.tickets, previous);
        reportWriteFailure(error.message, `“${ticket.title}”`, () => {
          void patch(ticket, fields);
        });
      }
    },
    [queryClient, supabase],
  );

  /**
   * Reordering writes one row.
   *
   * The dropped ticket takes a position midway between its new neighbours, so
   * moving one card is a single UPDATE rather than renumbering the list —
   * which also means two people reordering at once can't stamp on each other.
   */
  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const from = plan.findIndex((ticket) => ticket.id === active.id);
      const to = plan.findIndex((ticket) => ticket.id === over.id);
      if (from < 0 || to < 0) return;

      const without = plan.filter((ticket) => ticket.id !== active.id);
      const before = without[to - 1];
      const after = without[to];

      void patch(plan[from], {
        plan_position: positionBetween(before?.plan_position ?? undefined, after?.plan_position ?? undefined),
      });
    },
    [plan, patch],
  );

  const sensors = useSensors(
    // A few pixels of travel before a drag starts, so tapping a row on a
    // laptop trackpad still opens the ticket.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /* ------------------------------------------------------------------ UI */

  return (
    <div data-tour="day-plan" className="space-y-5">
      {/* Open questions first. Somebody is blocked on an answer only this
          person can give, and it clears itself the moment they give it. */}
      <EtaAsks tickets={mine} />

      {/* --------------------------------------------------- today's plan */}
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-line)] px-4 py-3">
          <h2 className="text-[13px] font-semibold tracking-tight">Today&apos;s plan</h2>
          <span className="tabular text-[11.5px] text-[var(--color-ink-3)]">
            {plan.length === 0
              ? "nothing picked yet"
              : `${plan.length} picked · about ${minutesToHuman(plannedMinutes)}`}
          </span>
          {plan.length > 0 && capacity > 0 && (
            <span
              className="tabular ml-auto text-[11.5px] font-medium"
              style={{
                color:
                  plannedMinutes > capacity
                    ? "var(--color-critical)"
                    : "var(--color-ink-3)",
              }}
            >
              {plannedMinutes > capacity
                ? `${minutesToHuman(plannedMinutes - capacity)} over your day`
                : `${minutesToHuman(remaining)} left`}
            </span>
          )}
        </div>

        {plan.length === 0 ? (
          <EmptyState
            icon={<CalendarPlus size={20} />}
            title="Nothing picked for today"
            hint="Add from the suggestions below, or from anything assigned to you. Nothing lands here on its own."
          />
        ) : (
          <DndContext
            id="day-plan"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={plan.map((ticket) => ticket.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul>
                {plan.map((ticket, index) => (
                  <PlanRow
                    key={ticket.id}
                    ticket={ticket}
                    index={index}
                    minutes={estimateMinutes(ticket, lookup)}
                    onStart={() => onStart(ticket)}
                    onRemove={() => void patch(ticket, { planned_for: null })}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </Card>

      {/* ---------------------------------------------------- suggestions */}
      {suggestions.length > 0 && (
        <Card padded={false}>
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-line)] px-4 py-3">
            <Lightbulb size={14} className="text-[var(--color-ink-3)]" />
            <h2 className="text-[13px] font-semibold tracking-tight">Suggested next</h2>
            <span className="text-[11.5px] text-[var(--color-ink-3)]">
              ranked by what&apos;s closest to its date — you decide
            </span>
          </div>
          <ul>
            {suggestions.map((suggestion) => (
              <li
                key={suggestion.ticket.id}
                className="flex items-center gap-3 border-b border-[var(--color-line)] px-4 py-2.5 last:border-0 hover:bg-[var(--color-surface-2)]"
              >
                <FormatBadge
                  format={suggestion.ticket.format}
                  quantity={suggestion.ticket.quantity}
                />
                <Link
                  href={`/tickets/${suggestion.ticket.id}`}
                  className="min-w-0 flex-1 truncate text-[13px] hover:underline"
                >
                  {suggestion.ticket.title}
                </Link>

                <span
                  className="shrink-0 rounded-[var(--radius-xs)] px-1.5 py-0.5 text-[10.5px] font-medium"
                  style={{
                    background: "var(--color-surface-3)",
                    color: "var(--color-ink-2)",
                  }}
                >
                  {suggestion.reason}
                </span>

                {suggestion.minutes != null && (
                  <span className="tabular hidden shrink-0 text-[11px] text-[var(--color-ink-3)] sm:block">
                    ~{minutesToHuman(suggestion.minutes)}
                  </span>
                )}

                {suggestion.beyondCapacity && (
                  <span
                    className="shrink-0 text-[10.5px] font-medium"
                    title="Adding this would take you past your day"
                    style={{ color: "var(--color-warning)" }}
                  >
                    over
                  </span>
                )}

                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void patch(suggestion.ticket, { planned_for: today })}
                >
                  <CalendarPlus size={12} /> Add
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ------------------------------------------- everything else mine */}
      {rest.length > 0 && (
        <Card padded={false}>
          <button
            onClick={() => setShowAll((open) => !open)}
            className="flex w-full items-center gap-2 border-b border-[var(--color-line)] px-4 py-3 text-left"
          >
            <h2 className="text-[13px] font-semibold tracking-tight">Everything assigned to you</h2>
            <span className="tabular rounded-full bg-[var(--color-surface-3)] px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--color-ink-2)]">
              {rest.length}
            </span>
            <span className="ml-auto text-[11.5px] text-[var(--color-accent)]">
              {showAll ? "Hide" : "Show"}
            </span>
          </button>

          {showAll && (
            <ul>
              {rest.map((ticket) => (
                <li
                  key={ticket.id}
                  className="flex items-center gap-3 border-b border-[var(--color-line)] px-4 py-2.5 last:border-0 hover:bg-[var(--color-surface-2)]"
                >
                  <FormatBadge format={ticket.format} quantity={ticket.quantity} />
                  <Link
                    href={`/tickets/${ticket.id}`}
                    className="min-w-0 flex-1 truncate text-[13px] hover:underline"
                  >
                    {ticket.title}
                  </Link>
                  <StatusPill status={ticket.status} />
                  {ticket.due_at && (
                    <span
                      suppressHydrationWarning
                      className="shrink-0 text-[11px] text-[var(--color-ink-3)]"
                    >
                      {dueLabel(ticket.due_at)}
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void patch(ticket, { planned_for: today })}
                  >
                    <CalendarPlus size={12} /> Add
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ rows */

function PlanRow({
  ticket,
  index,
  minutes,
  onStart,
  onRemove,
}: {
  ticket: TicketWithRefs;
  index: number;
  minutes: number | null;
  onStart: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ticket.id,
  });
  const due = dueState(ticket);
  const running = ticket.status === "in_progress";

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.55 : 1,
      }}
      className="flex items-center gap-2.5 border-b border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2.5 last:border-0 hover:bg-[var(--color-surface-2)]"
    >
      <button
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${ticket.title}`}
        className="grid h-6 w-5 shrink-0 cursor-grab place-items-center text-[var(--color-ink-3)] hover:text-[var(--color-ink)] active:cursor-grabbing"
      >
        <GripVertical size={14} />
      </button>

      <span className="tabular w-4 shrink-0 text-[11px] font-medium text-[var(--color-ink-3)]">
        {index + 1}
      </span>

      <FormatBadge format={ticket.format} quantity={ticket.quantity} />

      <Link
        href={`/tickets/${ticket.id}`}
        className="min-w-0 flex-1 truncate text-[13px] hover:underline"
      >
        {ticket.title}
      </Link>

      {ticket.brand && (
        <span className="hidden shrink-0 text-[11.5px] text-[var(--color-ink-3)] md:block">
          {ticket.brand.name}
        </span>
      )}

      {minutes != null && (
        <span className="tabular hidden shrink-0 text-[11px] text-[var(--color-ink-3)] sm:block">
          ~{minutesToHuman(minutes)}
        </span>
      )}

      {ticket.due_at && (
        <span
          suppressHydrationWarning
          className="shrink-0 text-[11px] font-medium"
          style={{
            color:
              due === "overdue"
                ? "var(--color-critical)"
                : due === "today"
                  ? "var(--color-warning)"
                  : "var(--color-ink-3)",
          }}
        >
          {dueLabel(ticket.due_at)}
        </span>
      )}

      {running ? (
        <span
          className="shrink-0 text-[11px] font-medium"
          style={{ color: "var(--color-accent)" }}
        >
          running
        </span>
      ) : (
        <Button size="sm" variant="primary" onClick={onStart}>
          <Play size={12} fill="currentColor" /> Start
        </Button>
      )}

      <button
        onClick={onRemove}
        aria-label={`Take ${ticket.title} off today`}
        title="Take off today"
        className="shrink-0 text-[var(--color-ink-3)] transition-colors hover:text-[var(--color-critical)]"
      >
        <X size={14} />
      </button>
    </li>
  );
}
