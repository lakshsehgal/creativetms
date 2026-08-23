"use client";

import { memo, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Link2, RotateCcw } from "lucide-react";
import type { Profile, TicketStatus, TicketWithRefs } from "@/lib/types";
import { ALLOWED_TARGETS, STATUSES, STATUS_ORDER, canSeeOwnTime } from "@/lib/types";
import type { Group } from "@/lib/grouping";
import { dueLabel, dueState, humanDuration, shortName } from "@/lib/format";
import { Avatar, FormatBadge } from "@/components/ui/primitives";
import { EtaChip } from "@/components/ui/eta-chip";
import { RushFlag } from "@/components/ui/rush-flag";

const DUE_TONE: Record<string, string> = {
  overdue: "var(--color-critical)",
  today: "var(--color-warning)",
  soon: "var(--color-serious)",
  ok: "var(--color-ink-3)",
  none: "var(--color-ink-3)",
};

type SortKey = "due" | "number" | "title" | "time";

/**
 * The spreadsheet view. Grouped with a coloured rail down the left, the way
 * people expect after living in Monday — the heading carries what the rows
 * have in common, so each row can spend its width on what differs.
 *
 * What it's grouped by is decided above, and shared with the board, so the two
 * views never disagree about how the work is stacked.
 */
export function ListView({
  tickets,
  groups: incoming,
  viewer,
  designers,
  onPatch,
  onOpen,
}: {
  tickets: TicketWithRefs[];
  groups: Group[];
  viewer: Profile;
  designers: Profile[];
  onPatch: (ticket: TicketWithRefs, fields: Record<string, unknown>) => void;
  onOpen: (ticketId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortKey>("due");

  // Strategists never see timing; designers see their own finished totals.
  const showTime = canSeeOwnTime(viewer.role);

  /**
   * The grouping is decided above — this only sorts inside each one, and drops
   * the empties, because an empty heading in a table is a line of noise where
   * the board's empty lane is a drop target.
   */
  const groups = useMemo(
    () =>
      incoming
        .filter((group) => group.tickets.length > 0)
        .map((group) => ({
          ...group,
          tickets: [...group.tickets].sort((a, b) => {
            if (sort === "number") return b.number - a.number;
            if (sort === "title") return a.title.localeCompare(b.title);
            if (sort === "time") return (b.total_seconds ?? 0) - (a.total_seconds ?? 0);
            // Undated work sinks rather than pretending to be urgent.
            return (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999");
          }),
        })),
    [incoming, sort],
  );

  if (tickets.length === 0) {
    return (
      <p className="px-6 py-16 text-center text-[13px] text-[var(--color-ink-3)]">
        Nothing matches these filters.
      </p>
    );
  }

  return (
    <div className="min-w-[900px] px-5 py-4">
      <div className="mb-2 flex items-center gap-2 pl-1 text-[11px] text-[var(--color-ink-3)]">
        Sort
        {(showTime
          ? (["due", "number", "title", "time"] as SortKey[])
          : (["due", "number", "title"] as SortKey[])
        ).map((key) => (
          <button
            key={key}
            onClick={() => setSort(key)}
            className={`rounded-[var(--radius-sm)] px-1.5 py-0.5 transition-colors ${
              sort === key
                ? "bg-[var(--color-surface-3)] font-medium text-[var(--color-ink)]"
                : "hover:text-[var(--color-ink-2)]"
            }`}
          >
            {{ due: "Due", number: "Newest", title: "Title", time: "Time spent" }[key]}
          </button>
        ))}
      </div>

      {groups.map((group) => {
        const isCollapsed = collapsed.has(group.id);
        const units = group.tickets.reduce((sum, row) => sum + row.quantity, 0);

        return (
          <section key={group.id} className="mb-5">
            <button
              onClick={() =>
                setCollapsed((prev) => {
                  const next = new Set(prev);
                  next.has(group.id) ? next.delete(group.id) : next.add(group.id);
                  return next;
                })
              }
              className="mb-1.5 flex items-center gap-2"
              title={group.hint}
            >
              <ChevronRight
                size={14}
                style={{
                  color: group.tone,
                  transform: isCollapsed ? undefined : "rotate(90deg)",
                  transition: "transform .15s",
                }}
              />
              <span className="text-[13px] font-semibold" style={{ color: group.tone }}>
                {group.label}
              </span>
              <span className="tabular text-[11.5px] text-[var(--color-ink-3)]">
                {group.tickets.length} · {units} unit{units === 1 ? "" : "s"}
              </span>
            </button>

            {!isCollapsed && (
              <div
                className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)]"
                style={{ borderLeft: `3px solid ${group.tone}` }}
              >
                <table className="w-full border-collapse text-[12.5px]">
                  <thead>
                    <tr className="border-b border-[var(--color-line)] text-[10.5px] uppercase tracking-[0.06em] text-[var(--color-ink-3)]">
                      <th className="w-[38%] px-3 py-1.5 text-left font-medium">Ticket</th>
                      <th className="px-2 py-1.5 text-left font-medium">Brand</th>
                      <th className="px-2 py-1.5 text-left font-medium">Format</th>
                      <th className="w-[130px] px-0 py-1.5 text-center font-medium">Status</th>
                      <th className="px-2 py-1.5 text-left font-medium">Raised by</th>
                      <th className="px-2 py-1.5 text-left font-medium">Designer</th>
                      <th className="px-2 py-1.5 text-left font-medium">Due</th>
                      {showTime && (
                        <th className="px-3 py-1.5 text-right font-medium">Time</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {group.tickets.map((ticket) => (
                      <Row
                        key={ticket.id}
                        ticket={ticket}
                        viewer={viewer}
                        designers={designers}
                        onPatch={onPatch}
                        onOpen={onOpen}
                        showTime={showTime}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

const Row = memo(function Row({
  ticket,
  viewer,
  designers,
  onPatch,
  onOpen,
  showTime,
}: {
  ticket: TicketWithRefs;
  viewer: Profile;
  designers: Profile[];
  onPatch: (ticket: TicketWithRefs, fields: Record<string, unknown>) => void;
  onOpen: (ticketId: string) => void;
  showTime: boolean;
}) {
  const due = dueState(ticket);
  const isStaff = viewer.role !== "designer";
  const canMove =
    isStaff || ticket.assigned_to === viewer.id || !ticket.assigned_to;
  const targets = ALLOWED_TARGETS[viewer.role];

  return (
    <tr className="border-b border-[var(--color-line)] last:border-0 hover:bg-[var(--color-surface-2)]">
      <td className="px-3 py-1.5">
        <span className="flex items-center gap-2">
          <span className="tabular shrink-0 text-[11px] text-[var(--color-ink-3)]">
            #{ticket.number}
          </span>
          <RushFlag state={ticket.rush_state} />
          <Link
            href={`/tickets/${ticket.id}`}
            onClick={(event) => {
              // Plain click opens the panel; cmd/ctrl still opens a new tab.
              if (event.metaKey || event.ctrlKey || event.shiftKey) return;
              event.preventDefault();
              onOpen(ticket.id);
            }}
            className="truncate font-medium hover:text-[var(--color-accent)]"
          >
            {ticket.title}
          </Link>
          {ticket.review_url && (
            <a
              href={ticket.review_url}
              target="_blank"
              rel="noopener noreferrer"
              title="Open the review link"
              className="shrink-0 text-[var(--color-ink-3)] hover:text-[var(--color-accent)]"
            >
              <Link2 size={11} />
            </a>
          )}
          {ticket.revision_count > 0 && (
            <span
              className="tabular inline-flex shrink-0 items-center gap-0.5 text-[10.5px]"
              style={{ color: "var(--color-serious)" }}
              title={`${ticket.revision_count} revision round(s)`}
            >
              <RotateCcw size={9} />
              {ticket.revision_count}
            </span>
          )}
        </span>
      </td>

      <td className="px-2 py-1.5">
        {ticket.brand ? (
          <span className="flex items-center gap-1.5 text-[12px]">
            <span
              className="h-2 w-2 shrink-0 rounded-[2px]"
              style={{ background: ticket.brand.color }}
            />
            {ticket.brand.name}
          </span>
        ) : (
          <span className="text-[var(--color-ink-3)]">—</span>
        )}
      </td>

      <td className="px-2 py-1.5">
        <FormatBadge format={ticket.format} quantity={ticket.quantity} />
      </td>

      {/* The coloured status cell doubles as the control that changes it. */}
      <td className="p-0">
        <label className="relative block h-full cursor-pointer">
          <span className="sr-only">Status for {ticket.title}</span>
          <span
            className="flex h-[30px] items-center justify-center gap-1.5 text-[11.5px] font-semibold text-white"
            style={{ background: STATUSES[ticket.status].fill }}
          >
            {STATUSES[ticket.status].clockRuns && (
              <span className="breathe h-1.5 w-1.5 rounded-full bg-white/90" aria-hidden />
            )}
            {STATUSES[ticket.status].label}
          </span>
          <select
            value={ticket.status}
            disabled={!canMove}
            onChange={(event) => onPatch(ticket, { status: event.target.value })}
            className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-default"
          >
            {STATUS_ORDER.map((status) => (
              <option key={status} value={status} disabled={!targets.includes(status)}>
                {STATUSES[status].label}
              </option>
            ))}
          </select>
        </label>
      </td>

      {/* Who asked for it. Read next to who is doing it, the two together are
          the whole handoff — and a designer with a question about the brief
          now knows who to ask without opening the ticket. */}
      <td className="px-2 py-1.5">
        {ticket.author ? (
          <span
            className="flex items-center gap-1.5"
            title={ticket.author.full_name || ticket.author.email}
          >
            <Avatar
              id={ticket.author.id}
              name={ticket.author.full_name}
              email={ticket.author.email}
              src={ticket.author.avatar_url}
              size={18}
            />
            <span className="truncate">{shortName(ticket.author)}</span>
          </span>
        ) : (
          <span className="text-[var(--color-ink-3)]">—</span>
        )}
      </td>

      <td className="px-2 py-1.5">
        {isStaff ? (
          <select
            value={ticket.assigned_to ?? ""}
            onChange={(event) =>
              onPatch(ticket, { assigned_to: event.target.value || null })
            }
            aria-label={`Designer for ${ticket.title}`}
            className="max-w-[130px] cursor-pointer truncate rounded-[var(--radius-sm)] border border-transparent bg-transparent py-0.5 text-[12px] outline-none hover:border-[var(--color-line-strong)] focus:border-[var(--color-accent)]"
          >
            <option value="">Unassigned</option>
            {designers.map((person) => (
              <option key={person.id} value={person.id}>
                {person.full_name || person.email}
              </option>
            ))}
          </select>
        ) : ticket.assignee ? (
          <span className="flex items-center gap-1.5">
            <Avatar
              id={ticket.assignee.id}
              name={ticket.assignee.full_name}
              email={ticket.assignee.email}
              src={ticket.assignee.avatar_url}
              size={18}
            />
            <span className="truncate">{ticket.assignee.full_name}</span>
          </span>
        ) : (
          <span className="text-[var(--color-ink-3)]">—</span>
        )}
      </td>

      <td className="px-2 py-1.5">
        <span
          suppressHydrationWarning
          className="text-[11.5px] font-medium"
          style={{ color: DUE_TONE[due] }}
        >
          {ticket.due_at ? dueLabel(ticket.due_at) : "—"}
        </span>
        {/* Under the promise rather than in a column of its own: the two are
            only worth anything read against each other, and a column would be
            empty on most rows. */}
        <span className="mt-0.5 block">
          <EtaChip ticket={ticket} />
        </span>
      </td>

      {showTime && (
        <td className="tabular px-3 py-1.5 text-right text-[11.5px] text-[var(--color-ink-2)]">
          {(ticket.total_seconds ?? 0) > 0 ? humanDuration(ticket.total_seconds) : "—"}
        </td>
      )}
    </tr>
  );
});
