import type {
  ChecklistItem,
  ChecklistPhase,
  CrewGroup,
  CrewMember,
  Shoot,
  ShootDoc,
  ShootMeals,
} from "./types";

/**
 * The call sheet, as maths and defaults.
 *
 * Everything here is pure so it can be checked without a browser: the crew
 * count, the meal estimate, and the shape a brief is normalised into when it
 * comes back from the database. A jsonb column is a promise, not a guarantee —
 * a brief written by an older build has to open in a newer one, so every read
 * goes through `normaliseDoc` rather than trusting the shape.
 */

/* ------------------------------------------------------------------- ids */

/**
 * Stable-enough ids for rows inside the document.
 *
 * These only have to be unique within one brief, and they exist so React can
 * key a list that gets reordered and deleted from. crypto.randomUUID is there
 * in every browser this runs in; the counter is for the server render.
 */
let seq = 0;
export function rowId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  seq += 1;
  return `row-${seq}`;
}

/* -------------------------------------------------------------- defaults */

export function blankMember(): CrewMember {
  return { id: rowId(), name: "", reportingTime: "", email: "" };
}

export function defaultCrew(): CrewGroup[] {
  return [
    { id: rowId(), role: "Operations", members: [blankMember()] },
    { id: rowId(), role: "Content strategist", members: [blankMember()] },
    { id: rowId(), role: "Frame team", members: [blankMember()] },
  ];
}

export function defaultMeals(): ShootMeals {
  return { breakfast: false, lunch: false, dinner: false, snacks: false, notes: "" };
}

export function blankDoc(): ShootDoc {
  return {
    days: 1,
    callTime: "",
    locations: [],
    scripts: [],
    crew: defaultCrew(),
    actors: [],
    meals: defaultMeals(),
  };
}

/**
 * The run-up, in the order it actually happens.
 *
 * These are the studio's own three phases, kept as the starting point rather
 * than the law: every phase and item is editable, and "Restore the defaults"
 * puts them back.
 */
const DEFAULT_PHASES: { title: string; blurb: string; items: [string, string][] }[] = [
  {
    title: "Before the shoot — day before",
    blurb: "Locks the shoot the evening before, so the morning is execution, not scramble.",
    items: [
      ["Scripts & shot list final — printed / saved offline", "Content strategist"],
      ["Scripting briefing done with production team", "Content strategist"],
      ["Call sheet shared — time, address, contacts", "Operations"],
      ["Actors confirmed — call time, wardrobe, looks", "Operations"],
      ["Products packed — correct variants, clean, labels intact", "Operations"],
      ["Props checklist complete", "Operations"],
    ],
  },
  {
    title: "On shoot day — setup",
    blurb: "Before the first take rolls.",
    items: [
      ["Lights & camera set up", "Frame team"],
      ["Actor briefs delivered", "Content strategist"],
      ["Shoot underway", "Frame team"],
    ],
  },
  {
    title: "During the shoot — run per script",
    blurb: "Ticked live, script by script — the phase that prevents a missed deliverable.",
    items: [
      ["Every scene on the shot list captured & ticked", "Content strategist"],
      ["Shot list 100% ticked against every script", "Content strategist"],
      ["Products & props collected and packed", "Operations"],
      ["Footage uploaded to the project drive folder", "Frame team"],
    ],
  },
];

export const PHASE_BLURB: Record<string, string> = Object.fromEntries(
  DEFAULT_PHASES.map((phase) => [phase.title, phase.blurb]),
);

export function defaultChecklist(): ChecklistPhase[] {
  return DEFAULT_PHASES.map((phase) => ({
    id: rowId(),
    title: phase.title,
    items: phase.items.map(([text, owner]) => ({
      id: rowId(),
      text,
      owner,
      note: "",
      done: false,
    })),
  }));
}

/* ----------------------------------------------------------------- maths */

/** Everyone on the crew with a name against them. Blank rows don't eat lunch. */
export function crewCount(crew: CrewGroup[]): number {
  return crew.reduce(
    (total, group) => total + group.members.filter((member) => member.name.trim()).length,
    0,
  );
}

export function mealsSelected(meals: ShootMeals): number {
  return [meals.breakfast, meals.lunch, meals.dinner, meals.snacks].filter(Boolean).length;
}

/** Everyone named on the crew, for the checklist's owner dropdown. */
export function crewNames(crew: CrewGroup[]): string[] {
  const seen = new Set<string>();
  for (const group of crew) {
    for (const member of group.members) {
      const name = member.name.trim();
      if (name) seen.add(name);
    }
    const role = group.role.trim();
    if (role) seen.add(role);
  }
  return [...seen];
}

/* ------------------------------------------------------------ recipients */

/**
 * Who at the studio is on every call sheet, by role.
 *
 * Admins and operators — the two roles accountable for the day running, and
 * the two who get asked where somebody is at 7am. Deliberately not everyone
 * with a Neuroid address: a designer who isn't on the shoot doesn't need the
 * crew's phone numbers, and a call sheet that lands on people it doesn't
 * concern is a call sheet everyone filters.
 *
 * A strategist who is running the shoot still sees it — they wrote it, and
 * they're on the crew list if they're going.
 */
export const SHEET_ROLES = ["admin", "operator"] as const;

/**
 * Deliberately loose. This is not a validator — a call sheet held up because
 * somebody typed a perfectly good address a regex disliked is worse than a
 * bounce. It only has to catch the blanks and the obvious typos.
 */
export function looksLikeEmail(value: string): boolean {
  const trimmed = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed);
}

export interface Recipient {
  email: string;
  /** For the confirmation list, so nobody has to guess why an address is there. */
  name: string;
  from: "studio" | "crew";
}

/**
 * Who a call sheet goes to.
 *
 * The admins and operators, plus whichever crew have an address on the sheet —
 * the freelancers, actors and client-side people who don't have an account
 * here. The crew list is the sheet's own answer to "who is coming", so it is
 * the only list worth mailing.
 *
 * Deduped on the address rather than the person: someone on staff who is also
 * typed into the crew is one recipient, and getting the same call sheet twice
 * is how people start ignoring it.
 */
export function callSheetRecipients(
  crew: CrewGroup[],
  staff: { email: string; full_name: string; is_active: boolean; role: string }[],
): Recipient[] {
  const seen = new Map<string, Recipient>();

  const add = (email: string, name: string, from: Recipient["from"]) => {
    const clean = email.trim().toLowerCase();
    if (!looksLikeEmail(clean) || seen.has(clean)) return;
    seen.set(clean, { email: clean, name: name.trim() || clean, from });
  };

  for (const person of staff) {
    if (!person.is_active) continue;
    if (!(SHEET_ROLES as readonly string[]).includes(person.role)) continue;
    add(person.email, person.full_name, "studio");
  }

  for (const group of crew) {
    for (const member of group.members) {
      add(member.email, member.name, "crew");
    }
  }

  return [...seen.values()];
}

/** How far through the run-up this shoot is. */
export function checklistProgress(phases: ChecklistPhase[]): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const phase of phases) {
    for (const item of phase.items) {
      total += 1;
      if (item.done) done += 1;
    }
  }
  return { done, total };
}

/* ----------------------------------------------------------- normalising */

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function bool(value: unknown): boolean {
  return value === true;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function row(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/**
 * Turn whatever came back from jsonb into a document the form can render.
 *
 * Missing fields become empty ones, never undefined: a call sheet that throws
 * because somebody's brief predates a field is a call sheet nobody trusts.
 */
export function normaliseDoc(input: unknown): ShootDoc {
  const raw = row(input);
  const days = Number(raw.days);

  const crew = list(raw.crew).map((entry) => {
    const group = row(entry);
    return {
      id: str(group.id) || rowId(),
      role: str(group.role, "Other"),
      members: list(group.members).map((member) => {
        const person = row(member);
        return {
          id: str(person.id) || rowId(),
          name: str(person.name),
          reportingTime: str(person.reportingTime),
          email: str(person.email),
        };
      }),
    };
  });

  const meals = row(raw.meals);

  return {
    days: Number.isFinite(days) && days > 0 ? Math.min(30, Math.round(days)) : 1,
    callTime: str(raw.callTime),
    locations: list(raw.locations).map((entry) => {
      const place = row(entry);
      return {
        id: str(place.id) || rowId(),
        name: str(place.name),
        mapUrl: str(place.mapUrl),
        address: str(place.address),
      };
    }),
    scripts: list(raw.scripts).map((entry) => {
      const script = row(entry);
      const day = Number(script.day);
      return {
        id: str(script.id) || rowId(),
        name: str(script.name),
        day: Number.isFinite(day) && day > 0 ? Math.round(day) : 1,
        hours: str(script.hours),
        versions: str(script.versions, "Vertical"),
        link: str(script.link),
      };
    }),
    crew: crew.length > 0 ? crew : defaultCrew(),
    actors: list(raw.actors).map((entry) => {
      const actor = row(entry);
      return {
        id: str(actor.id) || rowId(),
        name: str(actor.name),
        age: str(actor.age),
        requirement: str(actor.requirement),
        timeIn: str(actor.timeIn),
        timeOut: str(actor.timeOut),
      };
    }),
    meals: {
      breakfast: bool(meals.breakfast),
      lunch: bool(meals.lunch),
      dinner: bool(meals.dinner),
      snacks: bool(meals.snacks),
      notes: str(meals.notes),
    },
  };
}

export function normaliseChecklist(input: unknown): ChecklistPhase[] {
  const phases = list(input).map((entry) => {
    const phase = row(entry);
    return {
      id: str(phase.id) || rowId(),
      title: str(phase.title, "Phase"),
      items: list(phase.items).map(
        (candidate): ChecklistItem => {
          const item = row(candidate);
          return {
            id: str(item.id) || rowId(),
            text: str(item.text),
            owner: str(item.owner),
            note: str(item.note),
            done: bool(item.done),
          };
        },
      ),
    };
  });
  // An empty checklist is almost always a brief that has never been opened,
  // not a deliberately empty one — seed it rather than showing nothing.
  return phases.length > 0 ? phases : defaultChecklist();
}

export function normaliseShoot(input: Record<string, unknown>): Shoot {
  return {
    id: str(input.id),
    title: str(input.title),
    brand: str(input.brand),
    shoot_date: typeof input.shoot_date === "string" ? input.shoot_date : null,
    doc: normaliseDoc(input.doc),
    checklist: normaliseChecklist(input.checklist),
    created_by: typeof input.created_by === "string" ? input.created_by : null,
    updated_by: typeof input.updated_by === "string" ? input.updated_by : null,
    created_at: str(input.created_at),
    updated_at: str(input.updated_at),
    archived_at: typeof input.archived_at === "string" ? input.archived_at : null,
    sent_at: typeof input.sent_at === "string" ? input.sent_at : null,
    sent_by: typeof input.sent_by === "string" ? input.sent_by : null,
    sent_to: Array.isArray(input.sent_to) ? (input.sent_to as string[]).map(String) : [],
  };
}

/* ------------------------------------------------------------ the banner */

export interface ShootWindow {
  /** When the block itself starts, in the viewer's clock. */
  start: Date;
  end: Date;
  /** When the studio should start being told: a day before it starts. */
  warnFrom: Date;
}

/** 24 hours of notice is the whole point — enough to move a brief, not a shrug. */
export const NOTICE_MS = 24 * 60 * 60 * 1000;

/**
 * The window a block is worth shouting about.
 *
 * A whole-day block runs midnight to midnight, so the banner for it clears at
 * the end of that day rather than at some invented "end of shoot".
 */
export function shootWindow(block: {
  day: string;
  start_time: string | null;
  end_time: string | null;
}): ShootWindow {
  const start = new Date(`${block.day}T${(block.start_time ?? "00:00:00").slice(0, 8)}`);
  const end = block.end_time
    ? new Date(`${block.day}T${block.end_time.slice(0, 8)}`)
    : new Date(`${block.day}T23:59:59`);
  return { start, end, warnFrom: new Date(start.getTime() - NOTICE_MS) };
}

export function isBannerLive(window: ShootWindow, now: Date): boolean {
  return now >= window.warnFrom && now <= window.end;
}

/** "10:00am", or "" for a whole-day block that has no clock of its own. */
export function clockLabel(time: string | null): string {
  if (!time) return "";
  const [rawHours, minutes] = time.split(":");
  const hours = Number(rawHours);
  if (!Number.isFinite(hours)) return "";
  const suffix = hours >= 12 ? "pm" : "am";
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelve}${minutes && minutes !== "00" ? `:${minutes}` : ""}${suffix}`;
}
