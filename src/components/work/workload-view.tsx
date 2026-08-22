"use client";

import { useMemo, useState } from "react";
import { CircleHelp, Users } from "lucide-react";
import type { Profile, TicketWithRefs } from "@/lib/types";
import { canSeeAllTime } from "@/lib/types";
import { dayRange, buildWorkload, estimateMinutes, loadState, LOAD_STATES } from "@/lib/planning";
import type { BenchmarkMap, LoadState, WorkloadCell, WorkloadRow } from "@/lib/planning";
import { minutesToHuman } from "@/lib/format";
import { useToday } from "@/hooks/use-today";
import { Avatar, FormatBadge, StatusPill } from "@/components/ui/primitives";
import { isWeekend } from "@/lib/planning";

const WINDOWS = [7, 14] as const;
type Window = (typeof WINDOWS)[number];

/**
 * Who can take the next brief.
 *
 * This is a forecast, not a stopwatch. Every number here is *committed* work
 * — the benchmark cost of what someone has been given — and never how long
 * anybody actually took. That distinction is what makes it safe to show the
 * whole studio: it answers "is Thursday full?" without answering "was Aarti
 * slow on Tuesday?", which is a different question with a different audience.
 */
export function WorkloadView({
  tickets,
  viewer,
  designers,
  benchmarks,
  onPatch,
  onOpen,
}: {
  tickets: TicketWithRefs[];
  viewer: Profile;
  designers: Profile[];
  benchmarks: BenchmarkMap;
  onPatch: (ticket: TicketWithRefs, fields: Record<string, unknown>) => void;
  onOpen: (ticketId: string) => void;
}) {
  const today = useToday();
  const [span, setSpan] = useState<Window>(7);
  const [selected, setSelected] = useState<{ rowKey: string; day: string } | null>(null);

  const days = useMemo(() => (today ? dayRange(today, span) : []), [today, span]);

  const { rows, unassigned } = useMemo(() => {
    if (!today) return { rows: [] as WorkloadRow[], unassigned: null };
    return buildWorkload({ tickets, people: designers, days, today, benchmarks });
  }, [tickets, designers, days, today, benchmarks]);

  const allRows = useMemo(
    () => (unassigned ? [...rows, unassigned] : rows),
    [rows, unassigned],
  );

  /** Studio totals per day — the row people actually plan the week from. */
  const teamTotals = useMemo(
    () =>
      days.map((day, index) => {
        let minutes = 0;
        let unestimated = 0;
        rows.forEach((row) => {
          minutes += row.cells[index].minutes;
          unestimated += row.cells[index].unestimated;
        });
        return { day, minutes, unestimated };
      }),
    [rows, days],
  );

  const teamCapacity = rows.reduce((sum, row) => sum + row.capacityMinutes, 0);

  const openCell = useMemo(() => {
    if (!selected) return null;
    const row = allRows.find((candidate) => candidate.person.id === selected.rowKey);
    if (!row) return null;
    const cell =
      selected.day === "undated"
        ? row.undated
        : row.cells[days.indexOf(selected.day)];
    return cell ? { row, cell } : null;
  }, [selected, allRows, days]);

  if (!today) {
    return <div className="skeleton m-5 h-72" />;
  }

  if (designers.length === 0) {
    return (
      <p className="px-6 py-16 text-center text-[13px] text-[var(--color-ink-3)]">
        No designers on the roster yet. Invite the team from the Team page and
        their capacity will show up here.
      </p>
    );
  }

  const canReassign = viewer.role === "admin" || viewer.role === "strategist";

  return (
    <div className="px-5 py-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-label="Window"
          className="flex items-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--color-line)] p-0.5"
        >
          {WINDOWS.map((option) => (
            <button
              key={option}
              onClick={() => {
                setSpan(option);
                setSelected(null);
              }}
              aria-pressed={span === option}
              className={`rounded-[var(--radius-sm)] px-2.5 py-1 text-[12px] transition-colors ${
                span === option
                  ? "bg-[var(--color-surface-3)] font-medium text-[var(--color-ink)]"
                  : "text-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
              }`}
            >
              {option} days
            </button>
          ))}
        </div>

        <Legend />
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)]">
        <table className="w-full border-collapse text-[12.5px]">
          <caption className="sr-only">
            Committed work per designer for the next {span} days, against each
            person&apos;s daily capacity.
          </caption>
          <thead>
            <tr className="border-b border-[var(--color-line)]">
              <th
                scope="col"
                className="sticky left-0 z-10 w-[190px] min-w-[190px] bg-[var(--color-surface)] px-3 py-2 text-left text-[10.5px] font-medium uppercase tracking-[0.06em] text-[var(--color-ink-3)]"
              >
                Designer
              </th>
              {days.map((day, index) => (
                <DayHeader key={day} day={day} isToday={index === 0} />
              ))}
              <th
                scope="col"
                className="min-w-[110px] px-2 py-2 text-center text-[10.5px] font-medium uppercase tracking-[0.06em] text-[var(--color-ink-3)]"
              >
                No date
              </th>
            </tr>
          </thead>

          <tbody>
            {allRows.map((row) => (
              <tr
                key={row.person.id}
                className="border-b border-[var(--color-line)] last:border-0"
              >
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-[var(--color-surface)] px-3 py-2 text-left font-normal"
                >
                  <span className="flex items-center gap-2">
                    {row.person.id === "unassigned" ? (
                      <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full border border-dashed border-[var(--color-line-strong)] text-[var(--color-ink-3)]">
                        <Users size={12} />
                      </span>
                    ) : (
                      <Avatar
                        id={row.person.id}
                        name={row.person.full_name}
                        email={row.person.email}
                        src={row.person.avatar_url}
                        size={26}
                      />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px] font-medium">
                        {row.person.full_name || row.person.email}
                      </span>
                      <span className="block text-[11px] text-[var(--color-ink-3)]">
                        {row.person.id === "unassigned"
                          ? "needs an owner"
                          : `${Math.round(row.capacityMinutes / 60)}h a day`}
                      </span>
                    </span>
                  </span>
                </th>

                {row.cells.map((cell, index) => (
                  <LoadCell
                    key={cell.day}
                    cell={cell}
                    capacity={row.capacityMinutes}
                    weekend={isWeekend(cell.day)}
                    isToday={index === 0}
                    selected={
                      selected?.rowKey === row.person.id && selected?.day === cell.day
                    }
                    onSelect={() =>
                      setSelected((previous) =>
                        previous?.rowKey === row.person.id && previous?.day === cell.day
                          ? null
                          : { rowKey: row.person.id, day: cell.day },
                      )
                    }
                    personName={row.person.full_name || row.person.email}
                  />
                ))}

                <LoadCell
                  cell={row.undated}
                  capacity={row.capacityMinutes}
                  weekend={false}
                  isToday={false}
                  undated
                  selected={selected?.rowKey === row.person.id && selected?.day === "undated"}
                  onSelect={() =>
                    setSelected((previous) =>
                      previous?.rowKey === row.person.id && previous?.day === "undated"
                        ? null
                        : { rowKey: row.person.id, day: "undated" },
                    )
                  }
                  personName={row.person.full_name || row.person.email}
                />
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr className="border-t-2 border-[var(--color-line-strong)] bg-[var(--color-surface-2)]">
              <th
                scope="row"
                className="sticky left-0 z-10 bg-[var(--color-surface-2)] px-3 py-2 text-left text-[11.5px] font-medium"
              >
                Studio
                <span className="ml-1.5 font-normal text-[var(--color-ink-3)]">
                  {Math.round(teamCapacity / 60)}h a day
                </span>
              </th>
              {teamTotals.map((total) => {
                const state = loadState(total.minutes, teamCapacity);
                return (
                  <td key={total.day} className="px-2 py-2 text-center">
                    <span className="tabular text-[11.5px] font-medium">
                      {total.minutes > 0 ? minutesToHuman(total.minutes) : "—"}
                    </span>
                    {teamCapacity > 0 && total.minutes > 0 && (
                      <span
                        className="ml-1 text-[10.5px]"
                        style={{ color: LOAD_STATES[state].tone }}
                        aria-label={LOAD_STATES[state].label}
                      >
                        {LOAD_STATES[state].icon}
                        {Math.round((total.minutes / teamCapacity) * 100)}%
                      </span>
                    )}
                    {total.unestimated > 0 && (
                      <span className="ml-1 text-[10.5px] text-[var(--color-ink-3)]">
                        +{total.unestimated}?
                      </span>
                    )}
                  </td>
                );
              })}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {openCell && (
        <CellDetail
          row={openCell.row}
          cell={openCell.cell}
          benchmarks={benchmarks}
          designers={designers}
          canReassign={canReassign}
          onPatch={onPatch}
          onOpen={onOpen}
          onClose={() => setSelected(null)}
        />
      )}

      <p className="mt-4 max-w-3xl text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">
        Load is the benchmark cost of work someone has been given, charged to
        the day it&apos;s due — never how long anyone actually took. Anything
        overdue is charged to today, because that&apos;s where it&apos;s
        really competing for hours. Briefs sitting with a strategist or the
        client don&apos;t count against a designer, and a format with no
        benchmark set shows as{" "}
        <span className="font-medium text-[var(--color-ink-2)]">+n?</span>{" "}
        rather than as free time.{" "}
        {canSeeAllTime(viewer.role) && (
          <>Actual time spent lives in Analytics and Scorecards.</>
        )}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- pieces */

function DayHeader({ day, isToday }: { day: string; isToday: boolean }) {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const weekend = isWeekend(day);

  return (
    <th
      scope="col"
      className={`min-w-[104px] px-2 py-2 text-center ${
        weekend ? "bg-[var(--color-surface-2)]" : ""
      }`}
    >
      <span
        className={`block text-[10.5px] font-medium uppercase tracking-[0.06em] ${
          isToday ? "text-[var(--color-ink)]" : "text-[var(--color-ink-3)]"
        }`}
      >
        {isToday ? "Today" : date.toLocaleDateString(undefined, { weekday: "short" })}
      </span>
      <span className="tabular block text-[11px] text-[var(--color-ink-3)]">
        {date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
      </span>
    </th>
  );
}

/**
 * One person, one day.
 *
 * The bar is the encoding — a length against a fixed track reads as a
 * proportion far more precisely than a colour does, and it keeps working
 * for a colourblind reader. Colour and the icon only say which side of
 * capacity the bar is on.
 */
function LoadCell({
  cell,
  capacity,
  weekend,
  isToday,
  undated = false,
  selected,
  onSelect,
  personName,
}: {
  cell: WorkloadCell;
  capacity: number;
  weekend: boolean;
  isToday: boolean;
  undated?: boolean;
  selected: boolean;
  onSelect: () => void;
  personName: string;
}) {
  const state: LoadState = undated
    ? cell.tickets.length > 0
      ? "ok"
      : "free"
    : loadState(cell.minutes, capacity);
  const meta = LOAD_STATES[state];
  const pct = capacity > 0 ? Math.round((cell.minutes / capacity) * 100) : 0;
  const empty = cell.tickets.length === 0;
  /** Work is booked here, but every ticket is in a format we can't size yet. */
  const unknownOnly = !empty && cell.minutes === 0 && cell.unestimated > 0;

  const label = undated
    ? `${cell.tickets.length} undated ticket${cell.tickets.length === 1 ? "" : "s"} for ${personName}`
    : `${personName}, ${cell.day}: ${
        empty
          ? "nothing booked"
          : unknownOnly
            ? `${cell.unestimated} ticket(s) booked, no benchmark to size them`
            : `${minutesToHuman(cell.minutes)} of ${Math.round(capacity / 60)}h`
      }`;

  return (
    <td
      className={`px-1.5 py-1.5 align-middle ${weekend ? "bg-[var(--color-surface-2)]" : ""} ${
        isToday ? "bg-[var(--color-accent-soft)]" : ""
      }`}
    >
      <button
        type="button"
        onClick={empty ? undefined : onSelect}
        disabled={empty}
        aria-label={label}
        title={label}
        className={`block w-full rounded-[var(--radius-sm)] px-1.5 py-1 text-left transition-colors ${
          empty
            ? "cursor-default"
            : "cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-ink)_6%,transparent)]"
        } ${selected ? "ring-2 ring-[var(--color-accent)]" : ""}`}
        style={
          state === "over"
            ? { background: "color-mix(in srgb, var(--color-critical) 9%, transparent)" }
            : undefined
        }
      >
        {empty ? (
          <span className="block py-1 text-center text-[11px] text-[var(--color-ink-3)]">—</span>
        ) : (
          <>
            <span className="flex items-baseline justify-between gap-1">
              <span className="tabular text-[11.5px] font-medium text-[var(--color-ink)]">
                {cell.minutes > 0 ? minutesToHuman(cell.minutes) : unknownOnly ? "?" : "—"}
              </span>
              <span className="flex items-center gap-1 text-[10.5px]">
                {cell.unestimated > 0 && (
                  <span
                    className="text-[var(--color-ink-3)]"
                    title={`${cell.unestimated} ticket(s) in a format with no benchmark yet`}
                  >
                    +{cell.unestimated}?
                  </span>
                )}
                {!undated && meta.icon && (
                  <span style={{ color: meta.tone }} aria-hidden>
                    {meta.icon}
                  </span>
                )}
                {/* A percentage of an unknown is not 0% — it's unknown. */}
                {!undated && capacity > 0 && cell.minutes > 0 && (
                  <span className="tabular text-[var(--color-ink-3)]">{pct}%</span>
                )}
              </span>
            </span>

            {!undated && (
              <Meter
                minutes={cell.minutes}
                capacity={capacity}
                tone={meta.tone}
                unknownOnly={unknownOnly}
              />
            )}
            {undated && (
              <span className="mt-1 block text-[10.5px] text-[var(--color-ink-3)]">
                {cell.tickets.length} ticket{cell.tickets.length === 1 ? "" : "s"}
              </span>
            )}
          </>
        )}
      </button>
    </td>
  );
}

/** A thin track with a rounded fill. Over-capacity spills into a second segment. */
function Meter({
  minutes,
  capacity,
  tone,
  unknownOnly = false,
}: {
  minutes: number;
  capacity: number;
  tone: string;
  unknownOnly?: boolean;
}) {
  if (capacity <= 0) return null;

  // Booked, but in a format with no benchmark. An empty track would say
  // "free"; a hatched one says "occupied, size unknown", which is the truth.
  if (unknownOnly) {
    return (
      <span
        className="mt-1 block h-[6px] w-full rounded-full"
        style={{
          background:
            "repeating-linear-gradient(135deg, var(--color-line-strong), var(--color-line-strong) 2px, var(--color-surface-3) 2px, var(--color-surface-3) 5px)",
        }}
      />
    );
  }

  const ratio = minutes / capacity;
  const filled = Math.min(1, ratio);
  // Everything past 100% is drawn in the last fifth of the track, so a wild
  // over-book is visible without the bar running off the cell.
  const spill = ratio > 1 ? Math.min(1, (ratio - 1) / 1) : 0;

  return (
    <span className="mt-1 flex h-[6px] w-full items-stretch gap-[2px] overflow-hidden">
      <span className="relative flex-1 overflow-hidden rounded-full bg-[var(--color-surface-3)]">
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${filled * 100}%`, background: tone }}
        />
      </span>
      {spill > 0 && (
        <span
          className="w-[18px] shrink-0 rounded-full"
          style={{
            background: `repeating-linear-gradient(135deg, ${tone}, ${tone} 2px, transparent 2px, transparent 4px)`,
          }}
          title="Booked past capacity"
        />
      )}
    </span>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--color-ink-3)]">
      {(["ok", "tight", "over"] as LoadState[]).map((state) => {
        const meta = LOAD_STATES[state];
        return (
          <li key={state} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-[6px] w-[14px] rounded-full"
              style={{ background: meta.tone }}
            />
            {meta.icon && (
              <span aria-hidden style={{ color: meta.tone }}>
                {meta.icon}
              </span>
            )}
            {meta.label}
          </li>
        );
      })}
      <li className="flex items-center gap-1.5">
        <CircleHelp size={11} />
        <span>
          <span className="font-medium">+n?</span> no benchmark yet
        </span>
      </li>
    </ul>
  );
}

/* ------------------------------------------------------------ drill-down */

function CellDetail({
  row,
  cell,
  benchmarks,
  designers,
  canReassign,
  onPatch,
  onOpen,
  onClose,
}: {
  row: WorkloadRow;
  cell: WorkloadCell;
  benchmarks: BenchmarkMap;
  designers: Profile[];
  canReassign: boolean;
  onPatch: (ticket: TicketWithRefs, fields: Record<string, unknown>) => void;
  onOpen: (ticketId: string) => void;
  onClose: () => void;
}) {
  const heading =
    cell.day === "undated"
      ? "No due date"
      : new Date(
          Number(cell.day.slice(0, 4)),
          Number(cell.day.slice(5, 7)) - 1,
          Number(cell.day.slice(8, 10)),
        ).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  return (
    <section className="mt-4 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)]">
      <header className="flex items-center gap-2 border-b border-[var(--color-line)] px-4 py-2.5">
        <h3 className="text-[13px] font-semibold">
          {row.person.full_name || row.person.email}
          <span className="ml-2 font-normal text-[var(--color-ink-3)]">{heading}</span>
        </h3>
        <span className="tabular text-[11.5px] text-[var(--color-ink-3)]">
          {cell.tickets.length} ticket{cell.tickets.length === 1 ? "" : "s"}
          {cell.minutes > 0 && ` · ${minutesToHuman(cell.minutes)} booked`}
        </span>
        <button
          onClick={onClose}
          className="ml-auto text-[11.5px] text-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
        >
          Close
        </button>
      </header>

      <ul>
        {cell.tickets.map((ticket) => {
          const estimate = estimateMinutes(ticket, benchmarks);
          return (
            <li
              key={ticket.id}
              className="flex items-center gap-3 border-b border-[var(--color-line)] px-4 py-2 last:border-0 hover:bg-[var(--color-surface-2)]"
            >
              <FormatBadge format={ticket.format} quantity={ticket.quantity} />
              <button
                onClick={() => onOpen(ticket.id)}
                className="min-w-0 flex-1 truncate text-left text-[12.5px] hover:text-[var(--color-accent)]"
              >
                {ticket.title}
              </button>
              {ticket.brand && (
                <span className="hidden shrink-0 text-[11.5px] text-[var(--color-ink-3)] sm:block">
                  {ticket.brand.name}
                </span>
              )}
              <StatusPill status={ticket.status} />
              <span
                className="tabular w-[64px] shrink-0 text-right text-[11.5px] text-[var(--color-ink-3)]"
                title={
                  estimate == null
                    ? "No benchmark for this format yet — set one on the Team page"
                    : "Estimated from the format benchmark"
                }
              >
                {estimate == null ? "—" : minutesToHuman(estimate)}
              </span>
              {canReassign && (
                <select
                  aria-label={`Reassign ${ticket.title}`}
                  value={ticket.assigned_to ?? ""}
                  onChange={(event) =>
                    onPatch(ticket, { assigned_to: event.target.value || null })
                  }
                  className="shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-1 text-[11.5px]"
                >
                  <option value="">Unassigned</option>
                  {designers.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name || person.email}
                    </option>
                  ))}
                </select>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
