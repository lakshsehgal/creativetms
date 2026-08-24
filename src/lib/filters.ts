import type { Profile, TicketWithRefs } from "@/lib/types";

/**
 * One filter object drives the board, the list and the saved views, and it
 * round-trips through the URL so a filtered screen can be pasted to a
 * colleague and land the same way.
 *
 * The five picker filters take a set, not a value.
 *
 * An empty set means no constraint — "all" — and several values are read as
 * OR, which is what a list of checkboxes means to anybody who has used one:
 * "SuperBottoms or Mokobara", "urgent or high", "Abhay or nobody". Asking for
 * two brands at once was the thing people were doing by opening the board
 * twice.
 */
export type FilterSet = string[];

export interface TicketFilters {
  q: string;
  brand: FilterSet; // brand ids
  format: FilterSet; // formats
  status: FilterSet; // statuses, plus the pseudo-value "open"
  designer: FilterSet; // profile ids, plus "me" and "unassigned"
  strategist: FilterSet; // profile ids (who raised it), plus "me"
  /** Which date the period applies to. */
  dateField: "created" | "due" | "approved";
  period: "all" | "today" | "7d" | "30d" | "90d" | "custom";
  from: string; // yyyy-mm-dd, only for period="custom"
  to: string;
}

/** The five that hold a set. Everything else is a single value. */
export const SET_KEYS = ["brand", "format", "status", "designer", "strategist"] as const;
export type SetKey = (typeof SET_KEYS)[number];

export const EMPTY_FILTERS: TicketFilters = {
  q: "",
  brand: [],
  format: [],
  status: [],
  designer: [],
  strategist: [],
  dateField: "created",
  period: "all",
  from: "",
  to: "",
};

/** Add or remove one value, keeping the given order stable. */
export function toggleValue(current: FilterSet, value: string): FilterSet {
  return current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
}

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
  // One picker with three brands ticked is still one filter to clear.
  SET_KEYS.forEach((key) => {
    if (filters[key].length > 0) count++;
  });
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
    // Within a picker the ticked values are OR'd; across pickers they are
    // AND'd. "SuperBottoms or Mokobara, and only the videos."
    if (filters.brand.length && !filters.brand.includes(ticket.brand_id ?? "")) return false;
    if (filters.format.length && !filters.format.includes(ticket.format)) return false;

    if (filters.status.length) {
      const matched = filters.status.some((value) =>
        // "Anything open" is a shorthand for a group of statuses, and it sits
        // in the same list as the statuses themselves, so it ORs with them.
        value === "open" ? ticket.status !== "approved" : ticket.status === value,
      );
      if (!matched) return false;
    }

    if (filters.designer.length) {
      const matched = filters.designer.some((value) =>
        value === "me"
          ? ticket.assigned_to === viewer.id
          : value === "unassigned"
            ? !ticket.assigned_to
            : ticket.assigned_to === value,
      );
      if (!matched) return false;
    }

    if (filters.strategist.length) {
      const matched = filters.strategist.some((value) =>
        value === "me" ? ticket.created_by === viewer.id : ticket.created_by === value,
      );
      if (!matched) return false;
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

const SET = new Set<string>(SET_KEYS);

/**
 * Only non-default values go in the URL, so a clean board has a clean address.
 *
 * A set is written comma-separated — `brand=b1,b2` — which keeps a one-value
 * filter looking exactly as it did before. That is what lets every link and
 * saved view anybody has already made carry on working.
 */
export function filtersToParams(filters: TicketFilters): URLSearchParams {
  const params = new URLSearchParams();
  (Object.keys(EMPTY_FILTERS) as (keyof TicketFilters)[]).forEach((key) => {
    const value = filters[key];
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(","));
    } else if (value && value !== EMPTY_FILTERS[key]) {
      params.set(key, value);
    }
  });
  return params;
}

export function filtersFromParams(params: URLSearchParams | null): TicketFilters {
  const filters: TicketFilters = { ...EMPTY_FILTERS, brand: [], format: [], status: [], designer: [], strategist: [] };
  if (!params) return filters;

  (Object.keys(EMPTY_FILTERS) as (keyof TicketFilters)[]).forEach((key) => {
    const raw = params.get(key);
    if (!raw) return;

    if (SET.has(key)) {
      // "all" was how a link used to say "no constraint" — an empty set now.
      // Reading it as a value would filter every ticket out.
      (filters[key] as FilterSet) = raw
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value && value !== "all");
    } else {
      (filters[key] as string) = raw;
    }
  });

  return filters;
}

/**
 * A saved view, read back into filters.
 *
 * Views saved before the pickers took sets hold one string per key, and one of
 * those strings is the literal "all". Views saved since hold an array. Both
 * land here, because a saved view is somebody's shortcut and quietly breaking
 * it on an upgrade is how people stop trusting the feature.
 */
export function filtersFromStored(stored: unknown): TicketFilters {
  const source = (stored ?? {}) as Record<string, unknown>;
  const filters: TicketFilters = { ...EMPTY_FILTERS, brand: [], format: [], status: [], designer: [], strategist: [] };

  (Object.keys(EMPTY_FILTERS) as (keyof TicketFilters)[]).forEach((key) => {
    const raw = source[key];
    if (raw == null) return;

    if (SET.has(key)) {
      const values = Array.isArray(raw) ? raw : String(raw).split(",");
      (filters[key] as FilterSet) = values
        .map((value) => String(value).trim())
        .filter((value) => value && value !== "all");
    } else if (typeof raw === "string") {
      (filters[key] as string) = raw;
    }
  });

  return filters;
}
