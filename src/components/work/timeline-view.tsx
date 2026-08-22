"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import type { Profile, TicketWithRefs } from "@/lib/types";
import {
  addDays,
  buildTimeline,
  dayRange,
  groupBars,
  isWeekend,
  startOfWeek,
  RISKS,
  RISK_ORDER,
} from "@/lib/planning";
import type { Risk, TimelineBar } from "@/lib/planning";
import { dueLabel } from "@/lib/format";
import { useToday } from "@/hooks/use-today";
import { FormatBadge, StatusPill } from "@/components/ui/primitives";

/**
 * `minDayWidth` is a floor, not a fixed size. Columns stretch to fill whatever
 * width the screen actually has, so an eight-week span on a wide monitor uses
 * the room instead of leaving half the card blank, and still scrolls
 * horizontally on a laptop rather than squeezing days into nothing.
 */
const SPANS = [
  { weeks: 2, label: "2 weeks", minDayWidth: 34 },
  { weeks: 4, label: "4 weeks", minDayWidth: 20 },
  { weeks: 8, label: "8 weeks", minDayWidth: 12 },
] as const;

const GROUPINGS = [
  { key: "designer", label: "Designer" },
  { key: "brand", label: "Brand" },
  { key: "status", label: "Status" },
] as const;

const LABEL_WIDTH = 300;
const ROW_HEIGHT = 48;

/** Past this, the browser starts to feel it. Never truncate silently. */
const MAX_BARS = 400;

/**
 * The calendar shape of the pipeline.
 *
 * Bars run from when a brief was raised (or picked up) to when it's due, so
 * the thing you're looking for is overlap: four bars stacked on Thursday
 * means Thursday is the problem, and you can see it without reading a single
 * number.
 *
 * Colour encodes schedule risk, not workflow status. Nine status hues on one
 * chart is more colour than anyone can hold, and several of ours collapse
 * into each other for a red-green colourblind reader. Status is still on
 * every row, as a labelled pill, where it reads as words.
 */
export function TimelineView({
  tickets,
  viewer,
  onOpen,
}: {
  tickets: TicketWithRefs[];
  viewer: Profile;
  onOpen: (ticketId: string) => void;
}) {
  const today = useToday();
  const [spanIndex, setSpanIndex] = useState(0);
  const [groupBy, setGroupBy] = useState<(typeof GROUPINGS)[number]["key"]>("designer");
  const [weekOffset, setWeekOffset] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const span = SPANS[spanIndex];

  /**
   * The scroll container's own width drives the column size.
   *
   * A callback ref rather than useRef + useEffect: the frame isn't in the tree
   * on the first paint (the date hasn't resolved yet) or when nothing matches,
   * so a mount-time effect would attach the observer to nothing and never
   * retry. This one fires whenever the node actually appears or goes away.
   */
  const [frameWidth, setFrameWidth] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);

  const frameRef = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    if (!node) return;
    const observer = new ResizeObserver(([entry]) =>
      setFrameWidth(entry.contentRect.width),
    );
    observer.observe(node);
    observerRef.current = observer;
    setFrameWidth(node.clientWidth);
  }, []);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  const days = useMemo(() => {
    if (!today) return [];
    const start = addDays(startOfWeek(today), weekOffset * 7);
    return dayRange(start, span.weeks * 7);
  }, [today, weekOffset, span.weeks]);

  const bars = useMemo(
    () => (today ? buildTimeline({ tickets, days, today }) : []),
    [tickets, days, today],
  );

  const groups = useMemo(() => groupBars(bars, groupBy), [bars, groupBy]);

  const shown = useMemo(() => {
    let budget = MAX_BARS;
    return groups.map((group) => {
      const slice = group.bars.slice(0, Math.max(0, budget));
      budget -= slice.length;
      return { ...group, bars: slice, hidden: group.bars.length - slice.length };
    });
  }, [groups]);

  const hiddenTotal = shown.reduce((sum, group) => sum + group.hidden, 0);

  const dayWidth = useMemo(() => {
    const columns = span.weeks * 7;
    const roomy = Math.floor((frameWidth - LABEL_WIDTH) / columns);
    return Math.max(span.minDayWidth, Number.isFinite(roomy) ? roomy : 0);
  }, [frameWidth, span]);

  if (!today) return <div className="skeleton m-5 h-72" />;

  const todayIndex = days.indexOf(today);
  const trackWidth = days.length * dayWidth;

  return (
    <div className="px-5 py-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Segmented
          label="Group by"
          options={GROUPINGS.map((option) => ({ key: option.key, label: option.label }))}
          value={groupBy}
          onChange={(key) => setGroupBy(key as typeof groupBy)}
        />

        <Segmented
          label="Span"
          options={SPANS.map((option, index) => ({
            key: String(index),
            label: option.label,
          }))}
          value={String(spanIndex)}
          onChange={(key) => setSpanIndex(Number(key))}
        />

        <div className="flex items-center gap-0.5">
          <IconButton label="Earlier" onClick={() => setWeekOffset((n) => n - 1)}>
            <ChevronLeft size={14} />
          </IconButton>
          <button
            onClick={() => setWeekOffset(0)}
            disabled={weekOffset === 0}
            className="rounded-[var(--radius-sm)] px-2 py-1 text-[12px] text-[var(--color-ink-3)] transition-colors enabled:hover:text-[var(--color-ink)] disabled:opacity-40"
          >
            Today
          </button>
          <IconButton label="Later" onClick={() => setWeekOffset((n) => n + 1)}>
            <ChevronRight size={14} />
          </IconButton>
        </div>

        <ul className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--color-ink-3)]">
          {RISK_ORDER.map((risk) => (
            <li key={risk} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-[8px] w-[16px] rounded-full"
                style={{ background: RISKS[risk].tone, opacity: RISKS[risk].muted ? 0.45 : 1 }}
              />
              {RISKS[risk].icon && (
                <span aria-hidden style={{ color: RISKS[risk].tone }}>
                  {RISKS[risk].icon}
                </span>
              )}
              {RISKS[risk].label}
            </li>
          ))}
        </ul>
      </div>

      {bars.length === 0 ? (
        <p className="py-16 text-center text-[13px] text-[var(--color-ink-3)]">
          Nothing scheduled in this window. Try a wider span, or step back a
          week.
        </p>
      ) : (
        <div
          ref={frameRef}
          className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)]"
        >
          <div style={{ width: LABEL_WIDTH + trackWidth }}>
            <Header
              days={days}
              dayWidth={dayWidth}
              todayIndex={todayIndex}
              dense={dayWidth < 26}
            />

            {shown.map((group) => {
              const isCollapsed = collapsed.has(group.key);
              return (
                <Fragment key={group.key}>
                  <div className="flex items-center border-b border-[var(--color-line)] bg-[var(--color-surface-2)]">
                    <button
                      onClick={() =>
                        setCollapsed((previous) => {
                          const next = new Set(previous);
                          if (next.has(group.key)) next.delete(group.key);
                          else next.add(group.key);
                          return next;
                        })
                      }
                      className="sticky left-0 z-20 flex items-center gap-1.5 bg-[var(--color-surface-2)] px-3 py-1.5 text-left"
                      style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }}
                    >
                      <ChevronDown
                        size={13}
                        className="text-[var(--color-ink-3)]"
                        style={{
                          transform: isCollapsed ? "rotate(-90deg)" : undefined,
                          transition: "transform .15s",
                        }}
                      />
                      <span className="truncate text-[12.5px] font-semibold">{group.label}</span>
                      <span className="tabular text-[11px] text-[var(--color-ink-3)]">
                        {group.bars.length}
                        {group.hidden > 0 && ` of ${group.bars.length + group.hidden}`}
                      </span>
                    </button>
                  </div>

                  {!isCollapsed &&
                    group.bars.map((bar) => (
                      <Row
                        key={bar.ticket.id}
                        bar={bar}
                        days={days}
                        dayWidth={dayWidth}
                        todayIndex={todayIndex}
                        onOpen={onOpen}
                      />
                    ))}
                </Fragment>
              );
            })}
          </div>
        </div>
      )}

      {hiddenTotal > 0 && (
        <p className="mt-2 text-[11.5px] text-[var(--color-warning)]">
          {hiddenTotal} more ticket{hiddenTotal === 1 ? "" : "s"} match this
          window but aren&apos;t drawn — narrow the filters above to see them.
        </p>
      )}

      <p className="mt-4 max-w-3xl text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">
        A bar starts when work started, or when the brief was raised if nobody
        has picked it up, and ends on the due date. Overdue work keeps
        stretching to today, so a bar that won&apos;t stop growing is the one
        to look at. Undated briefs show as a hollow marker on the day they were
        raised. This is the live pipeline — signed-off work leaves the board
        and lives in Analytics. The List view is the same data as a table.
        {viewer.role === "designer" && " Only your own work is timed; this view is about dates, not minutes."}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- pieces */

function Header({
  days,
  dayWidth,
  todayIndex,
  dense,
}: {
  days: string[];
  dayWidth: number;
  todayIndex: number;
  dense: boolean;
}) {
  return (
    <div className="flex border-b border-[var(--color-line)]">
      <div
        className="sticky left-0 z-20 bg-[var(--color-surface)] px-3 py-2 text-[10.5px] font-medium uppercase tracking-[0.06em] text-[var(--color-ink-3)]"
        style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }}
      >
        Ticket
      </div>
      <div className="relative flex">
        {days.map((day, index) => {
          const [y, m, d] = day.split("-").map(Number);
          const date = new Date(y, m - 1, d);
          const weekend = isWeekend(day);
          const monday = index % 7 === 0;
          // At 8 weeks a label per day is unreadable, so only Mondays are named.
          const labelled = !dense || monday;

          return (
            <div
              key={day}
              className={`shrink-0 py-1.5 text-center ${
                weekend ? "bg-[var(--color-surface-2)]" : ""
              } ${index === todayIndex ? "bg-[var(--color-accent-soft)]" : ""} ${
                monday ? "border-l border-[var(--color-line-strong)]" : ""
              }`}
              style={{ width: dayWidth }}
            >
              {labelled ? (
                <>
                  <span
                    className={`block text-[9.5px] uppercase tracking-[0.05em] ${
                      index === todayIndex
                        ? "font-semibold text-[var(--color-ink)]"
                        : "text-[var(--color-ink-3)]"
                    }`}
                  >
                    {dense
                      ? date.toLocaleDateString(undefined, { month: "short" })
                      : date.toLocaleDateString(undefined, { weekday: "narrow" })}
                  </span>
                  <span
                    className={`tabular block text-[10.5px] ${
                      index === todayIndex
                        ? "font-semibold text-[var(--color-ink)]"
                        : "text-[var(--color-ink-3)]"
                    }`}
                  >
                    {date.getDate()}
                  </span>
                </>
              ) : (
                <span className="block h-[26px]" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Row({
  bar,
  days,
  dayWidth,
  todayIndex,
  onOpen,
}: {
  bar: TimelineBar;
  days: string[];
  dayWidth: number;
  todayIndex: number;
  onOpen: (ticketId: string) => void;
}) {
  const meta = RISKS[bar.risk];
  const left = bar.offset * dayWidth + 2;
  const width = Math.max(dayWidth - 4, bar.span * dayWidth - 4);

  const detail = [
    `#${bar.ticket.number} ${bar.ticket.title}`,
    bar.ticket.brand?.name,
    bar.open ? "No due date" : dueLabel(bar.ticket.due_at),
    meta.label,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="flex border-b border-[var(--color-line)] last:border-0 hover:bg-[var(--color-surface-2)]"
      style={{ height: ROW_HEIGHT }}
    >
      <div
        className="sticky left-0 z-10 flex flex-col justify-center gap-0.5 bg-[var(--color-surface)] px-3 py-1"
        style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }}
      >
        <span className="flex items-baseline gap-1.5">
          <span className="tabular shrink-0 text-[10px] text-[var(--color-ink-3)]">
            #{bar.ticket.number}
          </span>
          <button
            onClick={() => onOpen(bar.ticket.id)}
            className="min-w-0 flex-1 truncate text-left text-[12px] hover:text-[var(--color-accent)]"
            title={bar.ticket.title}
          >
            {bar.ticket.title}
          </button>
        </span>
        <span className="flex items-center gap-1.5">
          <FormatBadge format={bar.ticket.format} quantity={bar.ticket.quantity} />
          <StatusPill status={bar.ticket.status} />
        </span>
      </div>

      <div
        className="relative"
        style={{
          width: days.length * dayWidth,
          // Hairline day columns, a stronger rule every Monday, and a tint on
          // the weekend pair. All three are backgrounds on one element rather
          // than a div per day per row — at eight weeks that would be 56 nodes
          // in every row.
          backgroundImage: [
            `repeating-linear-gradient(to right, var(--color-line) 0 1px, transparent 1px ${dayWidth}px)`,
            `repeating-linear-gradient(to right, var(--color-line-strong) 0 1px, transparent 1px ${dayWidth * 7}px)`,
            // The window always opens on a Monday, so Sat/Sun are the last two
            // columns of every seven.
            `repeating-linear-gradient(to right, transparent 0 ${dayWidth * 5}px, var(--color-surface-2) ${dayWidth * 5}px ${dayWidth * 7}px)`,
          ].join(", "),
        }}
      >
        {todayIndex >= 0 && (
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-0 top-0 w-[2px] opacity-55"
            style={{
              left: todayIndex * dayWidth + dayWidth / 2 - 1,
              background: "var(--color-accent)",
            }}
          />
        )}

        {bar.open ? (
          // No due date: there's no span to draw, so mark the day it landed.
          <button
            onClick={() => onOpen(bar.ticket.id)}
            title={detail}
            aria-label={detail}
            className="absolute top-1/2 h-[11px] w-[11px] -translate-y-1/2 rotate-45 rounded-[2px] border-2"
            style={{
              left: bar.offset * dayWidth + dayWidth / 2 - 5,
              borderColor: meta.tone,
              background: "var(--color-surface)",
            }}
          />
        ) : (
          <button
            onClick={() => onOpen(bar.ticket.id)}
            title={detail}
            aria-label={detail}
            className="absolute top-1/2 flex h-[15px] -translate-y-1/2 items-center justify-end px-1 text-[9px] font-semibold text-white"
            style={{
              left,
              width,
              background: meta.tone,
              opacity: meta.muted ? 0.45 : 1,
              // A squared-off end says "this carries on past the window".
              borderTopLeftRadius: bar.clippedStart ? 0 : 4,
              borderBottomLeftRadius: bar.clippedStart ? 0 : 4,
              borderTopRightRadius: bar.clippedEnd ? 0 : 4,
              borderBottomRightRadius: bar.clippedEnd ? 0 : 4,
            }}
          >
            {meta.icon && width >= 22 && <span aria-hidden>{meta.icon}</span>}
          </button>
        )}
      </div>
    </div>
  );
}

function Segmented({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-[var(--color-ink-3)]">{label}</span>
      <div
        role="group"
        aria-label={label}
        className="flex items-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--color-line)] p-0.5"
      >
        {options.map((option) => (
          <button
            key={option.key}
            onClick={() => onChange(option.key)}
            aria-pressed={value === option.key}
            className={`rounded-[var(--radius-sm)] px-2.5 py-1 text-[12px] transition-colors ${
              value === option.key
                ? "bg-[var(--color-surface-3)] font-medium text-[var(--color-ink)]"
                : "text-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-[26px] w-[26px] place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-ink)]"
    >
      {children}
    </button>
  );
}

/** Risk is a state, so it always ships with an icon and a word, never a hue alone. */
export type { Risk };
