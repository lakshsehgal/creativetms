import type {
  CreativeFormat,
  DailyScorecard,
  FormatBenchmark,
  Profile,
  Ticket,
  WorkSession,
} from "@/lib/types";
import { FORMAT_ORDER } from "@/lib/types";

/**
 * Today's card doesn't exist yet — the roll-up runs at night — so for the
 * current day we build the same shape live from sessions and sign-offs.
 * Past days read the stored row, which is authoritative.
 */
export function computeLiveScorecards({
  day,
  designers,
  sessions,
  tickets,
  benchmarks,
}: {
  day: string;
  designers: Profile[];
  sessions: (WorkSession & { ticket?: Pick<Ticket, "format" | "quantity"> | null })[];
  tickets: Pick<
    Ticket,
    "id" | "assigned_to" | "format" | "quantity" | "revision_count" | "due_at" | "approved_at"
  >[];
  benchmarks: FormatBenchmark[];
}): DailyScorecard[] {
  const target = new Map(benchmarks.map((row) => [row.format, row.target_minutes_per_unit]));

  return designers
    .map((designer) => {
      const mine = sessions.filter((session) => session.designer_id === designer.id);
      const done = tickets.filter((ticket) => ticket.assigned_to === designer.id);

      const secondsByFormat: Partial<Record<CreativeFormat, number>> = {};
      let activeSeconds = 0;
      const touched = new Set<string>();

      mine.forEach((session) => {
        const seconds =
          session.duration_seconds ??
          Math.max(
            0,
            Math.floor(
              (new Date(session.last_heartbeat_at).getTime() -
                new Date(session.started_at).getTime()) /
                1000,
            ),
          );
        activeSeconds += seconds;
        touched.add(session.ticket_id);
        const format = session.ticket?.format;
        if (format) secondsByFormat[format] = (secondsByFormat[format] ?? 0) + seconds;
      });

      const unitsByFormat: Partial<Record<CreativeFormat, number>> = {};
      let units = 0;
      let firstPass = 0;
      let revisionRounds = 0;
      let onTime = 0;
      let late = 0;
      let earnedMinutes = 0;

      done.forEach((ticket) => {
        units += ticket.quantity;
        unitsByFormat[ticket.format] = (unitsByFormat[ticket.format] ?? 0) + ticket.quantity;
        if (ticket.revision_count === 0) firstPass += 1;
        revisionRounds += ticket.revision_count;
        if (ticket.due_at && ticket.approved_at) {
          if (new Date(ticket.approved_at) <= new Date(ticket.due_at)) onTime += 1;
          else late += 1;
        }
        earnedMinutes += ticket.quantity * (target.get(ticket.format) ?? 0);
      });

      return {
        id: `live-${designer.id}-${day}`,
        designer_id: designer.id,
        day,
        active_seconds: activeSeconds,
        tickets_touched: touched.size,
        tickets_completed: done.length,
        units_completed: units,
        units_by_format: unitsByFormat,
        seconds_by_format: secondsByFormat,
        first_pass_count: firstPass,
        revision_rounds: revisionRounds,
        on_time_count: onTime,
        late_count: late,
        efficiency_pct:
          activeSeconds > 0 && earnedMinutes > 0
            ? Math.round((earnedMinutes * 60 * 100) / activeSeconds)
            : null,
        generated_at: new Date().toISOString(),
      } satisfies DailyScorecard;
    })
    .filter((card) => card.active_seconds > 0 || card.units_completed > 0);
}

/** Sum of a format map, used for the "n units" caption. */
export function totalUnits(card: DailyScorecard): number {
  return FORMAT_ORDER.reduce((sum, format) => sum + (card.units_by_format?.[format] ?? 0), 0);
}
