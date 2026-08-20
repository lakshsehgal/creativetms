/** Domain vocabulary. Mirrors the enums in supabase/migrations/0001_init.sql. */

export type UserRole = "admin" | "strategist" | "designer";
export type CreativeFormat = "video" | "static" | "carousel" | "gif";
export type TicketStatus =
  | "backlog"
  | "assigned"
  | "in_progress"
  | "in_review"
  | "revisions"
  | "approved"
  | "delivered";
export type TicketPriority = "low" | "normal" | "high" | "urgent";

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
  approved_at: string | null;
  delivered_at: string | null;
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

export interface WorkSession {
  id: string;
  ticket_id: string;
  designer_id: string;
  started_at: string;
  last_heartbeat_at: string;
  ended_at: string | null;
  end_reason: string | null;
  duration_seconds: number | null;
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
  target_minutes_per_unit: number;
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
};

export const FORMAT_ORDER: CreativeFormat[] = ["video", "static", "carousel", "gif"];

export const STATUSES: Record<
  TicketStatus,
  { label: string; hint: string; tone: string; countsAsWip: boolean }
> = {
  backlog: {
    label: "Backlog",
    hint: "Raised, waiting to be picked up",
    tone: "var(--color-ink-3)",
    countsAsWip: false,
  },
  assigned: {
    label: "Assigned",
    hint: "Claimed, clock not running",
    tone: "var(--color-series-5)",
    countsAsWip: true,
  },
  in_progress: {
    label: "In Progress",
    hint: "Clock is running",
    tone: "var(--color-accent)",
    countsAsWip: true,
  },
  in_review: {
    label: "In Review",
    hint: "With the strategist",
    tone: "var(--color-warning)",
    countsAsWip: true,
  },
  revisions: {
    label: "Revisions",
    hint: "Sent back with notes",
    tone: "var(--color-serious)",
    countsAsWip: true,
  },
  approved: {
    label: "Approved",
    hint: "Signed off",
    tone: "var(--color-good)",
    countsAsWip: false,
  },
  delivered: {
    label: "Delivered",
    hint: "Out the door",
    tone: "var(--color-series-6)",
    countsAsWip: false,
  },
};

export const BOARD_COLUMNS: TicketStatus[] = [
  "backlog",
  "assigned",
  "in_progress",
  "in_review",
  "revisions",
  "approved",
];

export const PRIORITIES: Record<TicketPriority, { label: string; tone: string; rank: number }> = {
  low: { label: "Low", tone: "var(--color-ink-3)", rank: 0 },
  normal: { label: "Normal", tone: "var(--color-ink-2)", rank: 1 },
  high: { label: "High", tone: "var(--color-warning)", rank: 2 },
  urgent: { label: "Urgent", tone: "var(--color-critical)", rank: 3 },
};

/** Which lanes each role is allowed to drag a card into. */
export const ALLOWED_TARGETS: Record<UserRole, TicketStatus[]> = {
  admin: ["backlog", "assigned", "in_progress", "in_review", "revisions", "approved", "delivered"],
  strategist: ["backlog", "assigned", "in_progress", "in_review", "revisions", "approved", "delivered"],
  designer: ["assigned", "in_progress", "in_review"],
};
