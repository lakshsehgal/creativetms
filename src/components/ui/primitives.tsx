import type { CreativeFormat, TicketPriority, TicketStatus } from "@/lib/types";
import { FORMATS, PRIORITIES, STATUSES, formatMeta, statusMeta } from "@/lib/types";
import { avatarTint, initials } from "@/lib/format";

/* ---------------------------------------------------------------- Avatar */

export function Avatar({
  id,
  name,
  email,
  size = 24,
  title,
  src,
}: {
  id: string;
  name: string;
  email?: string;
  size?: number;
  title?: string;
  src?: string | null;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        title={title ?? name ?? email}
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      title={title ?? name ?? email}
      className="grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{
        background: avatarTint(id),
        width: size,
        height: size,
        fontSize: Math.max(9, Math.round(size * 0.4)),
      }}
    >
      {initials(name, email)}
    </span>
  );
}

export function AvatarStack({
  people,
  max = 4,
  size = 22,
}: {
  people: { id: string; full_name: string; email?: string }[];
  max?: number;
  size?: number;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((person, index) => (
        <span
          key={person.id}
          style={{ marginLeft: index === 0 ? 0 : -6, zIndex: shown.length - index }}
          className="rounded-full ring-2 ring-[var(--color-surface)]"
        >
          <Avatar id={person.id} name={person.full_name} email={person.email} size={size} />
        </span>
      ))}
      {rest > 0 && (
        <span
          className="ml-[-6px] grid place-items-center rounded-full bg-[var(--color-surface-3)] text-[10px] font-medium text-[var(--color-ink-2)] ring-2 ring-[var(--color-surface)]"
          style={{ width: size, height: size }}
        >
          +{rest}
        </span>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- Badges */

export function FormatBadge({
  format,
  quantity,
  size = "sm",
}: {
  format: CreativeFormat;
  quantity?: number;
  size?: "sm" | "md";
}) {
  const meta = formatMeta(format);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[var(--radius-xs)] font-medium ${
        size === "sm" ? "px-1.5 py-0.5 text-[10.5px]" : "px-2 py-1 text-[12px]"
      }`}
      style={{
        background: `color-mix(in srgb, ${meta.series} 16%, transparent)`,
        color: meta.series,
      }}
    >
      <span aria-hidden style={{ fontSize: size === "sm" ? 8 : 10 }}>
        {meta.icon}
      </span>
      {meta.label}
      {quantity && quantity > 1 ? <span className="tabular opacity-80">×{quantity}</span> : null}
    </span>
  );
}

export function StatusPill({
  status,
  size = "sm",
}: {
  status: TicketStatus;
  size?: "sm" | "md";
}) {
  const meta = statusMeta(status);
  return (
    <span
      title={meta.hint}
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold text-white ${
        size === "sm" ? "px-2.5 py-[3px] text-[11px]" : "px-3 py-1 text-[12.5px]"
      }`}
      style={{ background: meta.fill }}
    >
      {meta.clockRuns && (
        <span className="breathe h-1.5 w-1.5 rounded-full bg-white/90" aria-hidden />
      )}
      {meta.label}
    </span>
  );
}

/**
 * The full-bleed coloured cell the list view uses — the thing that makes a
 * Monday-style table readable at a glance.
 */
export function StatusCell({ status }: { status: TicketStatus }) {
  const meta = STATUSES[status];
  return (
    <span
      title={meta.hint}
      className="flex h-full min-h-[30px] w-full items-center justify-center gap-1.5 px-2 text-[11.5px] font-semibold text-white"
      style={{ background: meta.fill }}
    >
      {meta.clockRuns && (
        <span className="breathe h-1.5 w-1.5 rounded-full bg-white/90" aria-hidden />
      )}
      {meta.label}
    </span>
  );
}

export function PriorityFlag({ priority }: { priority: TicketPriority }) {
  if (priority === "normal" || priority === "low") return null;
  const meta = PRIORITIES[priority];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-[var(--radius-xs)] px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide"
      style={{ background: `color-mix(in srgb, ${meta.tone} 16%, transparent)`, color: meta.tone }}
    >
      {meta.label}
    </span>
  );
}

/* ---------------------------------------------------------------- Layout */

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-[var(--color-line)] bg-[var(--color-surface)] px-5">
      <div className="min-w-0">
        <h1 className="truncate text-[15.5px] font-semibold">{title}</h1>
        {subtitle && (
          <p className="truncate text-[11.5px] leading-tight text-[var(--color-ink-3)]">{subtitle}</p>
        )}
      </div>
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </header>
  );
}

export function Card({
  children,
  className = "",
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={`rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] ${
        padded ? "p-4" : ""
      } ${className}`}
    >
      {children}
    </section>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="grid place-items-center px-6 py-14 text-center">
      {icon && <div className="mb-3 text-[var(--color-ink-3)]">{icon}</div>}
      <p className="text-[14px] font-medium">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-[12.5px] leading-relaxed text-[var(--color-ink-3)]">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- Stats */

/**
 * A single headline number. `delta` is the change; `deltaGood` says which
 * direction is the good one, because for minutes-per-static, down is up.
 */
export function StatTile({
  label,
  value,
  unit,
  delta,
  deltaGood,
  hint,
  accent,
  swatch,
}: {
  label: string;
  value: string | number;
  unit?: string;
  delta?: number | null;
  deltaGood?: "up" | "down";
  hint?: string;
  accent?: string;
  /**
   * A series colour shown as a chip beside the label.
   *
   * Use this rather than `accent` when the tile belongs to a chart series:
   * the chip carries the identity and the figure stays in ink, which reads
   * better at 26px and keeps colour doing one job.
   */
  swatch?: string;
}) {
  const showDelta = delta != null && Number.isFinite(delta) && delta !== 0;
  const positive = showDelta && (deltaGood === "down" ? delta! < 0 : delta! > 0);

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.07em] text-[var(--color-ink-3)]">
        {swatch && (
          <span
            aria-hidden
            className="h-[7px] w-[12px] shrink-0 rounded-full"
            style={{ background: swatch }}
          />
        )}
        {label}
      </p>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span
          className="text-[26px] font-semibold leading-none tracking-tight"
          style={accent ? { color: accent } : undefined}
        >
          {value}
        </span>
        {unit && <span className="text-[12px] text-[var(--color-ink-3)]">{unit}</span>}
      </p>
      {showDelta && (
        <p
          className="tabular mt-2 text-[11.5px] font-medium"
          style={{ color: positive ? "var(--color-good)" : "var(--color-serious)" }}
        >
          {delta! > 0 ? "▲" : "▼"} {Math.abs(delta!)}% vs previous
        </p>
      )}
      {hint && !showDelta && <p className="mt-2 text-[11.5px] text-[var(--color-ink-3)]">{hint}</p>}
    </div>
  );
}
