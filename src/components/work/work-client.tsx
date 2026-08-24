"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, GanttChart, KanbanSquare, Plus, Rows3, Scale } from "lucide-react";
import type {
  Brand,
  FormatBenchmark,
  Profile,
  SavedView,
  TicketStatus,
  TicketWithRefs,
} from "@/lib/types";
import { benchmarkMap } from "@/lib/planning";
import { GROUPINGS, groupTickets, isDraggable, type GroupKey } from "@/lib/grouping";
import { positionBetween, queryKeys } from "@/lib/queries";
import {
  applyFilters,
  filtersFromParams,
  filtersFromStored,
  filtersToParams,
  type TicketFilters,
} from "@/lib/filters";
import { supabaseBrowser } from "@/lib/supabase/client";
import { withRetry, reportWriteFailure } from "@/lib/write";
import { useLiveTickets } from "@/hooks/use-live-tickets";
import { PageHeader } from "@/components/ui/primitives";
import { Button, Select } from "@/components/ui/form";
import { NewTicketDialog } from "@/components/board/new-ticket-dialog";
import { TicketModal } from "@/components/ticket/ticket-modal";
import { FilterBar } from "./filter-bar";
import { SavedViews } from "./saved-views";
import { BoardView } from "./board-view";
import { ListView } from "./list-view";
import { TodayView } from "./today-view";
import { WorkloadView } from "./workload-view";
import { TimelineView } from "./timeline-view";

type Layout = "board" | "list" | "today" | "workload" | "timeline";

// List first: it's the view that answers "what's the state of everything"
// fastest, which is the question most people open the tool with.
const LAYOUTS: { key: Layout; label: string; icon: typeof Rows3 }[] = [
  { key: "list", label: "List", icon: Rows3 },
  { key: "board", label: "Board", icon: KanbanSquare },
  { key: "today", label: "Today", icon: CalendarCheck },
  { key: "workload", label: "Workload", icon: Scale },
  { key: "timeline", label: "Timeline", icon: GanttChart },
];

/** Views that answer a question about the whole studio, not a filtered slice. */
const UNFILTERED: Layout[] = ["today"];

export function WorkClient({
  profile,
  initialTickets,
  brands,
  designers,
  strategists,
  benchmarks,
}: {
  profile: Profile;
  initialTickets: TicketWithRefs[];
  brands: Brand[];
  designers: Profile[];
  strategists: Profile[];
  benchmarks: FormatBenchmark[];
}) {
  const supabase = supabaseBrowser();
  const queryClient = useQueryClient();
  const params = useSearchParams();

  const { tickets } = useLiveTickets(initialTickets);
  const [composing, setComposing] = useState(false);
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);

  /**
   * Filters are LOCAL state, mirrored into the address bar afterwards.
   *
   * They used to live in the URL via router.replace, which on a dynamic page
   * meant every keystroke in the search box fetched a fresh RSC payload and
   * re-rendered the board. Typing "diwali" cost six server round trips. Now
   * filtering is pure client work — instant — and the URL is updated with
   * history.replaceState, which keeps the screen shareable without asking
   * Next to navigate anywhere.
   */
  const [filters, setLocalFilters] = useState<TicketFilters>(() => filtersFromParams(params));
  const [layout, setLayout] = useState<Layout>(() => (params.get("view") as Layout) || "list");

  /**
   * How the work is stacked. Status is the default because it's the shape of
   * the workflow; the rest answer questions the lanes can't.
   *
   * It lives in the address bar next to the filters, so "everything for
   * SuperBottoms, grouped by designer" is a link somebody can send.
   */
  const [groupBy, setGroupBy] = useState<GroupKey>(
    () => (params.get("group") as GroupKey) || "status",
  );

  const setFilters = useCallback((next: TicketFilters, nextLayout: Layout = layout) => {
    setLocalFilters(next);
    setLayout(nextLayout);
  }, [layout]);

  // Mirror to the address bar one frame later, so a fast typist isn't
  // rewriting history on every character.
  useEffect(() => {
    const id = setTimeout(() => {
      const search = filtersToParams(filters);
      if (layout !== "list") search.set("view", layout);
      if (groupBy !== "status") search.set("group", groupBy);
      const url = search.toString() ? `/tickets?${search}` : "/tickets";
      window.history.replaceState(null, "", url);
    }, 250);
    return () => clearTimeout(id);
  }, [filters, layout, groupBy]);

  const visible = useMemo(
    () => applyFilters(tickets, filters, profile),
    [tickets, filters, profile],
  );

  const benchmarkLookup = useMemo(() => benchmarkMap(benchmarks), [benchmarks]);

  /* One arrangement, shared by the board and the list, so they can't disagree. */
  const groups = useMemo(
    () => groupTickets(visible, groupBy, { designers, brands, now: new Date() }),
    [visible, groupBy, designers, brands],
  );

  /**
   * Optimistic write: patch the cache first, reconcile after. This is what
   * makes dragging a card feel instant instead of feeling like a form submit.
   */
  const patch = useCallback(
    async (ticket: TicketWithRefs, fields: Record<string, unknown>) => {
      const previous = queryClient.getQueryData<TicketWithRefs[]>(queryKeys.tickets);

      queryClient.setQueryData<TicketWithRefs[]>(queryKeys.tickets, (rows) =>
        (rows ?? []).map((row) =>
          row.id === ticket.id ? ({ ...row, ...fields } as TicketWithRefs) : row,
        ),
      );

      const payload = { ...fields };
      if (!ticket.assigned_to && fields.status && fields.status !== "new_request") {
        payload.assigned_to = profile.id;
      }

      const { error } = await withRetry(() =>
        supabase.from("tickets").update(payload).eq("id", ticket.id),
      );

      if (error) {
        // Put the board back the way it was, and make the failure something
        // you have to acknowledge rather than a toast that fades.
        queryClient.setQueryData(queryKeys.tickets, previous);
        reportWriteFailure(error.message, `“${ticket.title}”`, () => {
          void patch(ticket, fields);
        });
        return;
      }

      // A status change may have started or stopped a clock.
      if (fields.status) {
        queryClient.invalidateQueries({ queryKey: queryKeys.ticketTime });
      }
    },
    [queryClient, supabase, profile.id],
  );

  const move = useCallback(
    (ticket: TicketWithRefs, status: TicketStatus, position: number) =>
      void patch(ticket, { status, position }),
    [patch],
  );

  const start = useCallback(
    (ticket: TicketWithRefs) => {
      const top = visible
        .filter((row) => row.status === "in_progress")
        .sort((a, b) => a.position - b.position)[0];
      void patch(ticket, {
        status: "in_progress",
        position: positionBetween(undefined, top?.position),
      });
    },
    [patch, visible],
  );

  function applyView(view: SavedView) {
    setFilters(filtersFromStored(view.filters), view.layout);
  }

  const live = tickets.filter((ticket) => ticket.status === "in_progress").length;

  return (
    <>
      <PageHeader
        title="Tickets"
        subtitle={`${visible.length} shown · ${live} in progress`}
      >
        <SavedViews
          viewer={profile}
          filters={filters}
          layout={layout}
          onApply={applyView}
        />

        <div
          role="tablist"
          aria-label="Layout"
          data-tour="layouts"
          className="flex items-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--color-line)] p-0.5"
        >
          {LAYOUTS.map((option) => {
            const Icon = option.icon;
            const active = layout === option.key;
            return (
              <button
                key={option.key}
                role="tab"
                aria-selected={active}
                data-tour={`view-${option.key}`}
                onClick={() => setFilters(filters, option.key)}
                className={`inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 py-1 text-[12px] transition-colors ${
                  active
                    ? "bg-[var(--color-surface-3)] font-medium text-[var(--color-ink)]"
                    : "text-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
                }`}
              >
                <Icon size={13} />
                {option.label}
              </button>
            );
          })}
        </div>

        {/* Only where a heading exists to change — Workload, Timeline and Today
            have arrangements of their own that a grouping would fight with. */}
        {(layout === "board" || layout === "list") && (
          <label
            data-tour="group-by"
            className="flex items-center gap-1.5 text-[11.5px] text-[var(--color-ink-3)]"
            title={GROUPINGS.find((option) => option.key === groupBy)?.hint}
          >
            Group by
            <Select
              value={groupBy}
              onChange={(event) => setGroupBy(event.target.value as GroupKey)}
              aria-label="Group tickets by"
              className="!w-auto !py-1 !pl-2 !pr-7 !text-[12px]"
            >
              {GROUPINGS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
        )}

        {profile.role !== "designer" && (
          <Button
            data-tour="new-ticket"
            variant="primary"
            size="sm"
            onClick={() => setComposing(true)}
          >
            <Plus size={14} /> New ticket
          </Button>
        )}
      </PageHeader>

      {!UNFILTERED.includes(layout) && (
        <FilterBar
          filters={filters}
          onChange={(next) => setFilters(next)}
          brands={brands}
          designers={designers}
          strategists={strategists}
          viewer={profile}
        />
      )}

      <div className="flex flex-1 flex-col overflow-auto">
        {layout === "board" && (
          <BoardView
            profile={profile}
            tickets={visible}
            groups={groups}
            groupBy={groupBy}
            onMove={move}
            onStart={start}
            onOpen={setOpenTicketId}
          />
        )}
        {layout === "list" && (
          <ListView
            tickets={visible}
            groups={groups}
            viewer={profile}
            designers={designers}
            onPatch={(ticket, fields) => void patch(ticket, fields)}
            onOpen={setOpenTicketId}
          />
        )}
        {layout === "today" && (
          <TodayView
            tickets={tickets}
            viewer={profile}
            designers={designers}
            onPatch={(ticket, fields) => void patch(ticket, fields)}
          />
        )}
        {layout === "workload" && (
          <WorkloadView
            tickets={visible}
            viewer={profile}
            designers={designers}
            benchmarks={benchmarkLookup}
            onPatch={(ticket, fields) => void patch(ticket, fields)}
            onOpen={setOpenTicketId}
          />
        )}
        {layout === "timeline" && (
          <TimelineView tickets={visible} viewer={profile} onOpen={setOpenTicketId} />
        )}
      </div>

      {openTicketId && (
        <TicketModal
          ticketId={openTicketId}
          profile={profile}
          brands={brands}
          designers={designers}
          onClose={() => setOpenTicketId(null)}
        />
      )}

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
