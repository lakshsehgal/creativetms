"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import type { Brand, Profile } from "@/lib/types";
import { FORMAT_ORDER, FORMATS, STATUSES, STATUS_ORDER } from "@/lib/types";
import {
  DATE_FIELD_LABELS,
  EMPTY_FILTERS,
  PERIOD_LABELS,
  activeFilterCount,
  type TicketFilters,
} from "@/lib/filters";
import { Select, TextInput } from "@/components/ui/form";
import { MultiSelect } from "@/components/ui/multi-select";

export function FilterBar({
  filters,
  onChange,
  brands,
  designers,
  strategists,
  viewer,
}: {
  filters: TicketFilters;
  onChange: (next: TicketFilters) => void;
  brands: Brand[];
  designers: Profile[];
  strategists: Profile[];
  viewer: Profile;
}) {
  const set = <K extends keyof TicketFilters>(key: K, value: TicketFilters[K]) =>
    onChange({ ...filters, [key]: value });

  const active = activeFilterCount(filters);

  return (
    <div
      data-tour="filters"
      className="flex flex-wrap items-center gap-2 border-b border-[var(--color-line)] bg-[var(--color-surface)] px-5 py-2.5"
    >
      <div className="relative">
        <Search
          size={13}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)]"
        />
        <TextInput
          value={filters.q}
          onChange={(event) => set("q", event.target.value)}
          placeholder="Search tickets"
          aria-label="Search tickets"
          className="!w-52 !py-1.5 !pl-7 !text-[12.5px]"
        />
      </div>

      <SlidersHorizontal size={13} className="ml-1 shrink-0 text-[var(--color-ink-3)]" />

      <MultiSelect
        label="Status"
        value={filters.status}
        onChange={(next) => set("status", next)}
        options={[
          { value: "open", label: "Anything open" },
          ...STATUS_ORDER.map((status) => ({
            value: status,
            label: STATUSES[status].label,
            tone: STATUSES[status].fill,
            group: "Or pick statuses",
          })),
        ]}
      />

      <MultiSelect
        label="Brand"
        value={filters.brand}
        onChange={(next) => set("brand", next)}
        options={brands.map((brand) => ({
          value: brand.id,
          label: brand.name,
          tone: brand.color,
        }))}
      />

      <MultiSelect
        label="Format"
        value={filters.format}
        onChange={(next) => set("format", next)}
        options={FORMAT_ORDER.map((format) => ({
          value: format,
          label: FORMATS[format].label,
          tone: FORMATS[format].series,
        }))}
      />

      <MultiSelect
        label="Designer"
        value={filters.designer}
        onChange={(next) => set("designer", next)}
        allLabel="Everyone"
        options={[
          ...(viewer.role === "designer"
            ? [{ value: "me", label: "Just mine" }]
            : []),
          { value: "unassigned", label: "Unassigned" },
          ...designers.map((person) => ({
            value: person.id,
            label: person.full_name || person.email,
            group: "The team",
          })),
        ]}
      />

      <MultiSelect
        label="Raised by"
        value={filters.strategist}
        onChange={(next) => set("strategist", next)}
        allLabel="Anyone"
        options={[
          ...(viewer.role !== "designer" ? [{ value: "me", label: "Me" }] : []),
          ...strategists.map((person) => ({
            value: person.id,
            label: person.full_name || person.email,
            group: "The team",
          })),
        ]}
      />

      {/* Period, plus which date it applies to — "due in the next week" and
          "raised in the last week" are different questions. */}
      <Chip label="Date">
        <Select
          value={filters.dateField}
          onChange={(event) => set("dateField", event.target.value as TicketFilters["dateField"])}
          aria-label="Which date to filter on"
          className="!w-auto !border-0 !bg-transparent !py-1 !pl-1 !text-[12.5px]"
        >
          {(Object.keys(DATE_FIELD_LABELS) as TicketFilters["dateField"][]).map((key) => (
            <option key={key} value={key}>
              {DATE_FIELD_LABELS[key]}
            </option>
          ))}
        </Select>
        <Select
          value={filters.period}
          onChange={(event) => set("period", event.target.value as TicketFilters["period"])}
          aria-label="Period"
          className="!w-auto !border-0 !bg-transparent !py-1 !pl-1 !text-[12.5px]"
        >
          {(Object.keys(PERIOD_LABELS) as TicketFilters["period"][]).map((key) => (
            <option key={key} value={key}>
              {PERIOD_LABELS[key]}
            </option>
          ))}
        </Select>
      </Chip>

      {filters.period === "custom" && (
        <span className="flex items-center gap-1.5">
          <input
            type="date"
            value={filters.from}
            onChange={(event) => set("from", event.target.value)}
            aria-label="From date"
            className="rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-2 py-1 text-[12px] outline-none focus:border-[var(--color-accent)]"
          />
          <span className="text-[11.5px] text-[var(--color-ink-3)]">to</span>
          <input
            type="date"
            value={filters.to}
            onChange={(event) => set("to", event.target.value)}
            aria-label="To date"
            className="rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-2 py-1 text-[12px] outline-none focus:border-[var(--color-accent)]"
          />
        </span>
      )}

      {active > 0 && (
        <button
          onClick={() => onChange({ ...EMPTY_FILTERS })}
          className="ml-auto inline-flex items-center gap-1 rounded-[var(--radius-md)] px-2 py-1 text-[12px] text-[var(--color-ink-2)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-ink)]"
        >
          <X size={12} /> Clear {active}
        </button>
      )}
    </div>
  );
}

function Chip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface-2)] pl-2">
      <span className="text-[11px] font-medium text-[var(--color-ink-3)]">{label}</span>
      {children}
    </span>
  );
}
