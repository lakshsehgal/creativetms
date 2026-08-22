"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarCheck, KanbanSquare, Plus, Rows3 } from "lucide-react";
import type { Brand, Profile, SavedView, TicketStatus, TicketWithRefs } from "@/lib/types";
import { positionBetween, queryKeys } from "@/lib/queries";
import { applyFilters, filtersFromParams, filtersToParams, type TicketFilters } from "@/lib/filters";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLiveTickets } from "@/hooks/use-live-tickets";
import { PageHeader } from "@/components/ui/primitives";
import { Button } from "@/components/ui/form";
import { NewTicketDialog } from "@/components/board/new-ticket-dialog";
import { TicketModal } from "@/components/ticket/ticket-modal";
import { FilterBar } from "./filter-bar";
import { SavedViews } from "./saved-views";
import { BoardView } from "./board-view";
import { ListView } from "./list-view";
import { TodayView } from "./today-view";

type Layout = "board" | "list" | "today";

// List first: it's the view that answers "what's the state of everything"
// fastest, which is the question most people open the tool with.
const LAYOUTS: { key: Layout; label: string; icon: typeof Rows3 }[] = [
  { key: "list", label: "List", icon: Rows3 },
  { key: "board", label: "Board", icon: KanbanSquare },
  { key: "today", label: "Today", icon: CalendarCheck },
];

export function WorkClient({
  profile,
  initialTickets,
  brands,
  designers,
  strategists,
}: {
  profile: Profile;
  initialTickets: TicketWithRefs[];
  brands: Brand[];
  designers: Profile[];
  strategists: Profile[];
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
      const url = search.toString() ? `/board?${search}` : "/board";
      window.history.replaceState(null, "", url);
    }, 250);
    return () => clearTimeout(id);
  }, [filters, layout]);

  const visible = useMemo(
    () => applyFilters(tickets, filters, profile),
    [tickets, filters, profile],
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

      const { error } = await supabase.from("tickets").update(payload).eq("id", ticket.id);

      if (error) {
        queryClient.setQueryData(queryKeys.tickets, previous);
        toast.error(error.message.replace(/^.*?:\s*/, ""));
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
    const next = filtersFromParams(new URLSearchParams(view.filters as Record<string, string>));
    setFilters(next, view.layout);
  }

  const live = tickets.filter((ticket) => ticket.status === "in_progress").length;

  return (
    <>
      <PageHeader
        title="Work"
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

        {profile.role !== "designer" && (
          <Button variant="primary" size="sm" onClick={() => setComposing(true)}>
            <Plus size={14} /> New ticket
          </Button>
        )}
      </PageHeader>

      {layout !== "today" && (
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
            onMove={move}
            onStart={start}
            onOpen={setOpenTicketId}
          />
        )}
        {layout === "list" && (
          <ListView
            tickets={visible}
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
