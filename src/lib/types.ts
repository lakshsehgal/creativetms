/** Domain vocabulary. Mirrors the enums in supabase/migrations/0001_init.sql. */

export type UserRole = "admin" | "operator" | "strategist" | "designer";
export type CreativeFormat =
  | "video"
  | "static"
  | "carousel"
  | "gif"
  /** The one-minute UGC cut. The stored value stays "ugc" — see migration 0009. */
  | "ugc"
  | "ugc_30s";
export type TicketStatus =
  | "new_request"
  | "in_progress"
  | "size_changes"
  | "ready_for_approval"
  | "sent_to_client"
  | "needs_edit"
  | "approved"
  | "awaiting_assets"
  | "on_hold";
export type TicketPriority = "low" | "normal" | "high" | "urgent";

/**
 * What kind of work a session was. Original build, a revision round, or a
 * resize — three different questions that used to share one number.
 */
export type WorkPhase = "initial" | "revision" | "size_change";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  avatar_url: string | null;
  is_active: boolean;
  daily_capacity_minutes: number;
  timezone: string;
  created_at: string;
  /** Set while this person is on a break; the clock is stopped. */
  break_started_at: string | null;
  break_ticket_id: string | null;
  /**
   * Shoot ops. An admin can hand this to a strategist who effectively runs
   * production, so they get the Shoot section and can block bandwidth without
   * being handed the whole floor.
   */
  has_shoot_ops: boolean;
}

export interface Brand {
  id: string;
  name: string;
  color: string;
  is_active: boolean;
}

export interface Ticket {
  id: string;
  number: number;
  title: string;
  brief: string;
  reference_urls: string[];
  /** Frame.io review link — where the deliverable is actually watched. */
  review_url: string | null;
  format: CreativeFormat;
  quantity: number;
  status: TicketStatus;
  priority: TicketPriority;
  brand_id: string | null;
  created_by: string;
  assigned_to: string | null;
  due_at: string | null;
  estimated_minutes: number | null;
  started_at: string | null;
  submitted_at: string | null;
  sent_at: string | null;
  approved_at: string | null;
  delivered_at: string | null;
  /** The designer's pledge that this is today's work. */
  planned_for: string | null;
  /**
   * Where it sits in that day's running order. Meaningless — and cleared —
   * once the ticket leaves the plan.
   */
  plan_position: number | null;
  /** Which kind of work the ticket is currently in. */
  work_phase: WorkPhase;
  revision_count: number;
  position: number;
  created_at: string;
  updated_at: string;
  /** Set when the ticket was removed. The row is kept so it can come back. */
  deleted_at: string | null;
  deleted_by: string | null;
}

type PersonRef = Pick<Profile, "id" | "full_name" | "email" | "avatar_url">;

export interface TicketWithRefs extends Ticket {
  brand: Pick<Brand, "id" | "name" | "color"> | null;
  assignee: PersonRef | null;
  author: PersonRef | null;
  /** Merged in from the `ticket_time` view. */
  total_seconds?: number;
  is_running?: boolean;
}

export interface Deliverable {
  id: string;
  ticket_id: string;
  version: number;
  url: string;
  phase: WorkPhase;
  submitted_by: string | null;
  created_at: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  ticket_id: string | null;
  kind: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

export interface PhaseTime {
  ticket_id: string;
  phase: WorkPhase;
  total_seconds: number;
  sessions: number;
}

export interface WorkSession {
  id: string;
  ticket_id: string;
  designer_id: string;
  started_at: string;
  last_heartbeat_at: string;
  ended_at: string | null;
  end_reason: string | null;
  duration_seconds: number | null;
  phase: WorkPhase;
}

export interface TicketComment {
  id: string;
  ticket_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author: PersonRef | null;
}

export interface TicketRevision {
  id: string;
  ticket_id: string;
  round: number;
  requested_by: string;
  notes: string;
  created_at: string;
  requester: PersonRef | null;
}

export interface Attachment {
  id: string;
  ticket_id: string;
  uploaded_by: string;
  /** Set only on files uploaded before working files became links. */
  storage_path: string | null;
  /** Where the working file actually lives. Set on everything added since. */
  url: string | null;
  /** What the person called it; falls back to the host, then the file name. */
  label: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  round: number;
  created_at: string;
}

export interface TicketEvent {
  id: string;
  ticket_id: string;
  actor_id: string | null;
  kind: string;
  from_value: string | null;
  to_value: string | null;
  created_at: string;
  actor: PersonRef | null;
}

export interface FormatBenchmark {
  format: CreativeFormat;
  /** null = not measured yet. Pace comparisons sit out until it's set. */
  target_minutes_per_unit: number | null;
  updated_at: string;
}

export interface DailyScorecard {
  id: string;
  designer_id: string;
  day: string;
  active_seconds: number;
  tickets_touched: number;
  tickets_completed: number;
  units_completed: number;
  units_by_format: Partial<Record<CreativeFormat, number>>;
  seconds_by_format: Partial<Record<CreativeFormat, number>>;
  first_pass_count: number;
  revision_rounds: number;
  on_time_count: number;
  late_count: number;
  efficiency_pct: number | null;
  generated_at: string;
}

/* ------------------------------------------------------------------ *
 * Presentation metadata
 * ------------------------------------------------------------------ */

/**
 * Formats own a fixed chart slot each — assigned once, never cycled, so a
 * filter that hides GIFs can't repaint Video.
 */
export const FORMATS: Record<
  CreativeFormat,
  { label: string; short: string; series: string; icon: string }
> = {
  video: { label: "Video", short: "VID", series: "var(--color-series-1)", icon: "▶" },
  static: { label: "Static", short: "STA", series: "var(--color-series-2)", icon: "■" },
  carousel: { label: "Carousel", short: "CAR", series: "var(--color-series-3)", icon: "▤" },
  gif: { label: "GIF", short: "GIF", series: "var(--color-series-4)", icon: "◐" },
  ugc: { label: "UGC — 1 min", short: "UGC60", series: "var(--color-series-5)", icon: "◉" },
  ugc_30s: { label: "UGC — 30s", short: "UGC30", series: "var(--color-series-6)", icon: "◎" },
};

export const FORMAT_ORDER: CreativeFormat[] = [
  "video",
  "static",
  "carousel",
  "gif",
  "ugc",
  "ugc_30s",
];

export const STATUSES: Record<
  TicketStatus,
  {
    label: string;
    hint: string;
    /** Solid fill for the status cell — Monday-style, readable on white. */
    fill: string;
    /** Whether the clock runs here. Exactly one status says yes. */
    clockRuns: boolean;
    /** Counts as work still owed to the client. */
    open: boolean;
  }
> = {
  new_request: {
    label: "New Request",
    hint: "Raised, nobody has started",
    fill: "#7b8794",
    clockRuns: false,
    open: true,
  },
  in_progress: {
    label: "In Progress",
    hint: "Being worked on — the clock is running",
    fill: "#0f7fd4",
    clockRuns: true,
    open: true,
  },
  size_changes: {
    label: "Size Changes",
    hint: "Resizes requested, waiting to be picked up",
    fill: "#a259d9",
    clockRuns: false,
    open: true,
  },
  ready_for_approval: {
    label: "Ready for Approval",
    hint: "Submitted, with the strategist",
    fill: "#f0a202",
    clockRuns: false,
    open: true,
  },
  sent_to_client: {
    label: "Sent to Client",
    hint: "Out for client review",
    fill: "#0b9d78",
    clockRuns: false,
    open: true,
  },
  needs_edit: {
    label: "Needs Edit",
    hint: "Came back with notes",
    fill: "#e8590c",
    clockRuns: false,
    open: true,
  },
  approved: {
    label: "Approved",
    hint: "Signed off",
    fill: "#2f9e44",
    clockRuns: false,
    open: false,
  },
  awaiting_assets: {
    label: "Awaiting Assets",
    hint: "Blocked on someone else",
    fill: "#c2255c",
    clockRuns: false,
    open: true,
  },
  on_hold: {
    label: "On Hold",
    hint: "Parked deliberately",
    fill: "#5c6270",
    clockRuns: false,
    open: true,
  },
};

export const STATUS_ORDER: TicketStatus[] = [
  "new_request",
  "in_progress",
  "size_changes",
  "ready_for_approval",
  "sent_to_client",
  "needs_edit",
  "approved",
  "awaiting_assets",
  "on_hold",
];

export const BOARD_COLUMNS: TicketStatus[] = STATUS_ORDER;

export const PRIORITIES: Record<TicketPriority, { label: string; tone: string; rank: number }> = {
  low: { label: "Low", tone: "var(--color-ink-3)", rank: 0 },
  normal: { label: "Normal", tone: "var(--color-ink-2)", rank: 1 },
  high: { label: "High", tone: "var(--color-warning)", rank: 2 },
  urgent: { label: "Urgent", tone: "var(--color-critical)", rank: 3 },
};

/**
 * Which lanes each role may move work into. Designers drive their own side of
 * the handoff; sign-off and anything client-facing stays with the strategist.
 */
export const ALLOWED_TARGETS: Record<UserRole, TicketStatus[]> = {
  admin: STATUS_ORDER,
  // Operators read the numbers; they don't move work through the pipeline.
  operator: [],
  strategist: STATUS_ORDER,
  designer: ["in_progress", "ready_for_approval", "awaiting_assets", "on_hold"],
};

/**
 * The three kinds of work.
 *
 * These are chart series, not status colours, so they take validated
 * categorical slots. Purple was the obvious pick for size changes — it
 * matches the Size Changes status pill — but blue against purple collapses
 * to dE 3.7 under protanopia, which is exactly the comparison this chart is
 * for. Blue / orange / green clears every check in both modes.
 */
export const PHASES: Record<WorkPhase, { label: string; short: string; tone: string }> = {
  initial: { label: "Original build", short: "Build", tone: "var(--color-series-1)" },
  revision: { label: "Revisions", short: "Revisions", tone: "var(--color-series-2)" },
  size_change: { label: "Size changes", short: "Resizes", tone: "var(--color-series-3)" },
};

/** Everything that isn't the first attempt. The number this studio watches. */
export const REWORK_PHASES: WorkPhase[] = ["revision", "size_change"];

export const PHASE_ORDER: WorkPhase[] = ["initial", "revision", "size_change"];

/**
 * Never index these maps directly with a value that came from the database.
 * An enum added in SQL but not yet in this file would otherwise take the
 * whole screen down instead of rendering one odd-looking chip.
 */
export function phaseMeta(phase: string | null | undefined) {
  return (
    PHASES[phase as WorkPhase] ?? {
      label: phase ?? "Unknown",
      short: phase ?? "Unknown",
      tone: "var(--color-ink-3)",
    }
  );
}

/** Rows returned by designer_phase_breakdown(). */
export interface DesignerPhaseRow {
  designer_id: string;
  designer_name: string;
  phase: WorkPhase;
  total_seconds: number;
  sessions: number;
  tickets: number;
}

/** Rows returned by designer_format_phase(). */
export interface FormatPhaseRow {
  designer_id: string;
  format: CreativeFormat;
  phase: WorkPhase;
  total_seconds: number;
  tickets: number;
  units: number;
}

/** Rows returned by studio_phase_daily(). */
export interface PhaseDayRow {
  day: string;
  phase: WorkPhase;
  total_seconds: number;
}

export function statusMeta(status: string | null | undefined) {
  return (
    STATUSES[status as TicketStatus] ?? {
      label: status ?? "Unknown",
      hint: "",
      fill: "#7b8794",
      clockRuns: false,
      open: true,
    }
  );
}

export function formatMeta(format: string | null | undefined) {
  return (
    FORMATS[format as CreativeFormat] ?? {
      label: format ?? "Unknown",
      short: "—",
      series: "var(--color-ink-3)",
      icon: "●",
    }
  );
}

/**
 * Timing data is management information, not a scoreboard.
 *   - admin & operator: everything, including live clocks
 *   - designer: their own finished totals, never a ticking timer
 *   - strategist: nothing — they get delivery status
 */
export function canSeeAllTime(role: UserRole): boolean {
  return role === "admin" || role === "operator";
}

export function canSeeOwnTime(role: UserRole): boolean {
  return role === "designer" || canSeeAllTime(role);
}

/** Only admins and operators watch a clock move. */
export function canSeeLiveTimer(role: UserRole): boolean {
  return canSeeAllTime(role);
}

export type BlockKind = "shoot" | "leave" | "holiday" | "other";

export const BLOCK_KINDS: Record<BlockKind, { label: string; tone: string }> = {
  shoot: { label: "On a shoot", tone: "var(--color-series-5)" },
  leave: { label: "On leave", tone: "var(--color-ink-3)" },
  holiday: { label: "Holiday", tone: "var(--color-ink-3)" },
  other: { label: "Unavailable", tone: "var(--color-ink-3)" },
};

/**
 * Who may open the Shoot section and block someone's day.
 *
 * Mirrors can_run_shoots() in the database exactly. The database is the one
 * that decides — this is only here so the sidebar doesn't offer a door that
 * won't open.
 */
export function canRunShoots(profile: Pick<Profile, "role" | "has_shoot_ops">): boolean {
  if (profile.role === "admin" || profile.role === "operator") return true;
  return profile.role === "strategist" && Boolean(profile.has_shoot_ops);
}

export function blockKindMeta(kind: string | null | undefined) {
  return BLOCK_KINDS[kind as BlockKind] ?? { label: kind ?? "Unavailable", tone: "var(--color-ink-3)" };
}

/** A slice of somebody's day that isn't available for briefs. */
export interface AvailabilityBlock {
  id: string;
  designer_id: string;
  day: string;
  /** Null on both means the whole day. */
  start_time: string | null;
  end_time: string | null;
  /** Null means the whole day, whatever that person's day is worth. */
  minutes: number | null;
  kind: BlockKind;
  note: string;
  created_by: string | null;
  created_at: string;
}

/** One designer-day, rolled up. Returned by blocked_minutes(). */
export interface BlockedDay {
  designer_id: string;
  day: string;
  minutes: number;
  whole_day: boolean;
  kinds: string[];
  notes: string[];
}

/* --------------------------------------------------------------- shoots */

/**
 * A shoot brief — the call sheet.
 *
 * The body is jsonb rather than fifteen columns on purpose: every shoot has a
 * field the last one didn't, and none of this is ever aggregated across
 * shoots. What is pulled out beside it is what the list screen sorts on.
 */
export interface Shoot {
  id: string;
  title: string;
  brand: string;
  shoot_date: string | null;
  doc: ShootDoc;
  checklist: ChecklistPhase[];
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface ShootDoc {
  days: number;
  callTime: string;
  locations: ShootLocation[];
  scripts: ShootScript[];
  crew: CrewGroup[];
  actors: ShootActor[];
  meals: ShootMeals;
}

export interface ShootLocation {
  id: string;
  name: string;
  mapUrl: string;
  address: string;
}

export interface ShootScript {
  id: string;
  name: string;
  day: number;
  hours: string;
  versions: string;
  link: string;
}

export interface CrewGroup {
  id: string;
  role: string;
  members: CrewMember[];
}

export interface CrewMember {
  id: string;
  name: string;
  reportingTime: string;
}

export interface ShootActor {
  id: string;
  name: string;
  age: string;
  requirement: string;
  timeIn: string;
  timeOut: string;
}

export interface ShootMeals {
  breakfast: boolean;
  lunch: boolean;
  dinner: boolean;
  snacks: boolean;
  costPerMeal: string;
  notes: string;
}

export interface ChecklistPhase {
  id: string;
  title: string;
  items: ChecklistItem[];
}

export interface ChecklistItem {
  id: string;
  text: string;
  owner: string;
  note: string;
  done: boolean;
}

export const CREW_ROLES = [
  "Operations",
  "Content strategist",
  "Videographer",
  "Frame team",
  "Photographer",
  "Editor",
  "Director",
  "Assistant",
  "Other",
] as const;

export const SCRIPT_VERSIONS = ["Vertical", "Horizontal", "Both", "Square", "Story / Reel"] as const;

export interface SavedView {
  id: string;
  owner_id: string;
  name: string;
  filters: Record<string, string>;
  layout: "board" | "list" | "workload" | "timeline";
  is_shared: boolean;
  created_at: string;
}
