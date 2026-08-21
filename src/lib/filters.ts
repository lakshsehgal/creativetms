import type { Profile, TicketWithRefs } from "@/lib/types";

/**
 * One filter object drives the board, the list and the saved views, and it
 * round-trips through the URL so a filtered screen can be pasted to a
 * colleague and land the same way.
 */
export interface TicketFilters {
  q: string;
  brand: string; // brand id | "all"
  format: string; // format | "all"
  status: string; // status | "all" | "open"
  designer: string; // profile id | "me" | "unassigned" | "all"
  strategist: string; // profile id (who raised it) | "me" | "all"
  /** Which date the period applies to. */
  dateField: "created" | "due" | "approved";
  period: "all" | "today" | "7d" | "30d" | "90d" | "custom";
  from: string; // yyyy-mm-dd, only for period="custom"
  to: string;
}

export const EMPTY_FILTERS: TicketFilters = {
  q: "",
  brand: "all",
  format: "all",
  status: "all",
  designer: "all",
  strategist: "all",
  dateField: "created",
  period: "all",
  from: "",
  to: "",
};

export const PERIOD_LABELS: Record<TicketFilters["period"], string> = {
  all: "Any time",
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  custom: "Custom range",
};

export const DATE_FIELD_LABELS: Record<TicketFilters["dateField"], string> = {
  created: "Raised",
  due: "Due",
  approved: "Approved",
};

/** How many filters are actually doing something — drives the "3" badge. */
export function activeFilterCount(filters: TicketFilters): number {
  let count = 0;
  if (filters.q.trim()) count++;
  if (filters.brand !== "all") count++;
  if (filters.format !== "all") count++;
  if (filters.status !== "all") count++;
  if (filters.designer !== "all") count++;
  if (filters.strategist !== "all") count++;
  if (filters.period !== "all") count++;
  return count;
}

function periodBounds(filters: TicketFilters): { start: number; end: number } | null {
  if (filters.period === "all") return null;

  if (filters.period === "custom") {
    if (!filters.from && !filters.to) return null;
    return {
      start: filters.from ? new Date(`${filters.from}T00:00:00`).getTime() : -Infinity,
      end: filters.to ? new Date(`${filters.to}T23:59:59.999`).getTime() : Infinity,
    };
  }

  const end = Date.now();
  if (filters.period === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return { start: start.getTime(), end };
  }

  const days = { "7d": 7, "30d": 30, "90d": 90 }[filters.period] ?? 30;
  return { start: end - days * 86_400_000, end };
}

export function applyFilters(
  tickets: TicketWithRefs[],
  filters: TicketFilters,
  viewer: Profile,
): TicketWithRefs[] {
  const needle = filters.q.trim().toLowerCase();
  const bounds = periodBounds(filters);

  return tickets.filter((ticket) => {
    if (filters.brand !== "all" && ticket.brand_id !== filters.brand) return false;
    if (filters.format !== "all" && ticket.format !== filters.format) return false;

    if (filters.status === "open") {
      if (ticket.status === "approved") return false;
    } else if (filters.status !== "all" && ticket.status !== filters.status) {
      return false;
    }

    if (filters.designer === "me") {
      if (ticket.assigned_to !== viewer.id) return false;
    } else if (filters.designer === "unassigned") {
      if (ticket.assigned_to) return false;
    } else if (filters.designer !== "all" && ticket.assigned_to !== filters.designer) {
      return false;
    }

    if (filters.strategist === "me") {
      if (ticket.created_by !== viewer.id) return false;
    } else if (filters.strategist !== "all" && ticket.created_by !== filters.strategist) {
      return false;
    }

    if (bounds) {
      const stamp =
        filters.dateField === "due"
          ? ticket.due_at
          : filters.dateField === "approved"
            ? ticket.approved_at
            : ticket.created_at;
      // A ticket with no date in the chosen field can't match a date window.
      if (!stamp) return false;
      const at = new Date(stamp).getTime();
      if (at < bounds.start || at > bounds.end) return false;
    }

    if (needle) {
      const haystack = `${ticket.number} ${ticket.title} ${ticket.brand?.name ?? ""} ${
        ticket.assignee?.full_name ?? ""
      } ${ticket.author?.full_name ?? ""}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }

    return true;
  });
}

/** Only non-default values go in the URL, so a clean board has a clean address. */
export function filtersToParams(filters: TicketFilters): URLSearchParams {
  const params = new URLSearchParams();
  (Object.keys(EMPTY_FILTERS) as (keyof TicketFilters)[]).forEach((key) => {
    const value = filters[key];
    if (value && value !== EMPTY_FILTERS[key]) params.set(key, value);
  });
  return params;
}

export function filtersFromParams(params: URLSearchParams | null): TicketFilters {
  const filters = { ...EMPTY_FILTERS };
  if (!params) return filters;
  (Object.keys(EMPTY_FILTERS) as (keyof TicketFilters)[]).forEach((key) => {
    const value = params.get(key);
    if (value) (filters[key] as string) = value;
  });
  return filters;
}
