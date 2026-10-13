import type { CreativeFormat, DailyScorecard, Profile, Ticket } from "@/lib/types";
import { FORMAT_ORDER } from "@/lib/types";

/**
 * Today's card doesn't exist yet — the roll-up runs at night — so for the
 * current day we build the same shape live from today's sign-offs.
 * Past days read the stored row, which is authoritative.
 */
export function computeLiveScorecards({
  day,
  designers,
  tickets,
}: {
  day: string;
  designers: Profile[];
  tickets: Pick<
    Ticket,
    "id" | "assigned_to" | "format" | "quantity" | "revision_count" | "due_at" | "approved_at"
  >[];
}): DailyScorecard[] {
  return designers
    .map((designer) => {
      const done = tickets.filter((ticket) => ticket.assigned_to === designer.id);

      const unitsByFormat: Partial<Record<CreativeFormat, number>> = {};
      let units = 0;
      let firstPass = 0;
      let revisionRounds = 0;
      let onTime = 0;
      let late = 0;

      done.forEach((ticket) => {
        units += ticket.quantity;
        unitsByFormat[ticket.format] = (unitsByFormat[ticket.format] ?? 0) + ticket.quantity;
        if (ticket.revision_count === 0) firstPass += 1;
        revisionRounds += ticket.revision_count;
        if (ticket.due_at && ticket.approved_at) {
          if (new Date(ticket.approved_at) <= new Date(ticket.due_at)) onTime += 1;
          else late += 1;
        }
      });

      return {
        id: `live-${designer.id}-${day}`,
        designer_id: designer.id,
        day,
        tickets_completed: done.length,
        units_completed: units,
        units_by_format: unitsByFormat,
        first_pass_count: firstPass,
        revision_rounds: revisionRounds,
        on_time_count: onTime,
        late_count: late,
        generated_at: new Date().toISOString(),
      } satisfies DailyScorecard;
    })
    .filter((card) => card.tickets_completed > 0);
}

/** Sum of a format map, used for the "n units" caption. */
export function totalUnits(card: DailyScorecard): number {
  return FORMAT_ORDER.reduce((sum, format) => sum + (card.units_by_format?.[format] ?? 0), 0);
}
