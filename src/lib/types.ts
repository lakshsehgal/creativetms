/** Domain vocabulary. Mirrors the enums in supabase/migrations/0001_init.sql. */

export type UserRole = "admin" | "strategist" | "designer";
export type CreativeFormat = "video" | "static" | "carousel" | "gif" | "ugc";
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
  /** Which kind of work the ticket is currently in. */
  work_phase: WorkPhase;
  revision_count: number;
  position: number;
  created_at: string;
  updated_at: string;
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
  storage_path: string;
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
  ugc: { label: "UGC", short: "UGC", series: "var(--color-series-5)", icon: "◉" },
};

export const FORMAT_ORDER: CreativeFormat[] = ["video", "static", "carousel", "gif", "ugc"];

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
  strategist: STATUS_ORDER,
  designer: ["in_progress", "ready_for_approval", "awaiting_assets", "on_hold"],
};

export const PHASES: Record<WorkPhase, { label: string; tone: string }> = {
  initial: { label: "Original build", tone: "var(--color-accent)" },
  revision: { label: "Revisions", tone: "var(--color-serious)" },
  size_change: { label: "Size changes", tone: "#a259d9" },
};

export const PHASE_ORDER: WorkPhase[] = ["initial", "revision", "size_change"];

export interface SavedView {
  id: string;
  owner_id: string;
  name: string;
  filters: Record<string, string>;
  layout: "board" | "list";
  is_shared: boolean;
  created_at: string;
}
