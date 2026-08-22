"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, Maximize2, RotateCcw, X } from "lucide-react";
import type { Brand, FormatBenchmark, Profile, TicketWithRefs } from "@/lib/types";
import { FORMATS, PRIORITIES, STATUSES, canSeeAllTime, canSeeOwnTime } from "@/lib/types";
import { dueLabel, dueState, relativeTime } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { fetchTeam, queryKeys } from "@/lib/queries";
import { useHeartbeat } from "@/hooks/use-heartbeat";
import { Avatar, FormatBadge, StatusPill } from "@/components/ui/primitives";
import { Select } from "@/components/ui/form";
import { useTicketData } from "./use-ticket-data";
import { TicketActions } from "./ticket-actions";
import { TimePanel } from "./time-panel";
import { Activity } from "./activity";
import { AttachmentsPanel } from "./attachments-panel";
import { ReviewLink } from "./review-link";

export function TicketDetail({
  profile,
  initialTicket,
  benchmarks,
  designers,
  brands,
  variant = "page",
  onClose,
}: {
  profile: Profile;
  initialTicket: TicketWithRefs;
  benchmarks: FormatBenchmark[];
  designers: Profile[];
  brands: Brand[];
  /** "modal" drops the page chrome and offers expand/close instead. */
  variant?: "page" | "modal";
  onClose?: () => void;
}) {
  const supabase = supabaseBrowser();
  const queryClient = useQueryClient();
  const { ticket, comments, events, revisions, attachments, sessions, deliverables } = useTicketData(
    initialTicket.id,
    initialTicket,
  );

  const data = ticket.data;
  const isStaff = profile.role === "admin" || profile.role === "strategist";
  const isOwner = data.assigned_to === profile.id;

  // Only the person whose clock is running needs to send beats.
  useHeartbeat(data.id, data.status === "in_progress" && isOwner);

  const team = useQuery({
    queryKey: queryKeys.team,
    queryFn: () => fetchTeam(supabase),
    staleTime: 5 * 60_000,
  });

  async function patch(fields: Record<string, unknown>, label: string) {
    const { error } = await supabase.from("tickets").update(fields).eq("id", data.id);
    if (error) {
      toast.error(error.message.replace(/^.*?:\s*/, ""));
      return;
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.ticket(data.id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.tickets });
    toast.success(label);
  }

  const latestRevision = revisions.data?.[0];
  const showRevisionBanner = data.status === "needs_edit" && latestRevision?.notes;

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--color-line)] bg-[var(--color-surface)] px-5">
        {variant === "modal" ? (
          <button
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
            aria-label="Back"
            title="Back"
          >
            <ArrowLeft size={15} />
          </button>
        ) : (
          <Link
            href="/board"
            className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
            aria-label="Back to the list"
          >
            <ArrowLeft size={15} />
          </Link>
        )}
        <span className="tabular text-[12px] font-medium text-[var(--color-ink-3)]">
          #{data.number}
        </span>
        <StatusPill status={data.status} />
        <div className="ml-auto flex items-center gap-2">
          <TicketActions ticket={data} profile={profile} />

          {variant === "modal" && (
            <>
              <span className="h-5 w-px bg-[var(--color-line)]" />
              <Link
                href={`/tickets/${data.id}`}
                title="Open full screen"
                aria-label="Open full screen"
                className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
              >
                <Maximize2 size={14} />
              </Link>
              <button
                onClick={onClose}
                title="Close"
                aria-label="Close"
                className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
              >
                <X size={15} />
              </button>
            </>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_308px]">
          {/* -------------------------------------------------- main column */}
          <div className="min-w-0 space-y-6">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <FormatBadge format={data.format} quantity={data.quantity} size="md" />
                {data.brand && (
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--color-ink-2)]">
                    <span
                      className="h-2.5 w-2.5 rounded-[3px]"
                      style={{ background: data.brand.color }}
                    />
                    {data.brand.name}
                  </span>
                )}
                {data.revision_count > 0 && (
                  <span
                    className="inline-flex items-center gap-1 text-[11.5px]"
                    style={{ color: "var(--color-serious)" }}
                  >
                    <RotateCcw size={11} /> {data.revision_count} revision
                    {data.revision_count > 1 ? "s" : ""}
                  </span>
                )}
              </div>

              <h1 className="mt-3 text-[24px] font-semibold leading-tight tracking-tight">
                {data.title}
              </h1>
              <p suppressHydrationWarning className="mt-1.5 text-[12px] text-[var(--color-ink-3)]">
                Raised by {data.author?.full_name || data.author?.email || "—"} ·{" "}
                {relativeTime(data.created_at)}
              </p>
            </div>

            <ReviewLink ticket={data} profile={profile} versions={deliverables.data ?? []} />

            {showRevisionBanner && (
              <div
                className="rounded-[var(--radius-lg)] border p-4"
                style={{
                  borderColor: "color-mix(in srgb, var(--color-serious) 35%, transparent)",
                  background: "color-mix(in srgb, var(--color-serious) 8%, transparent)",
                }}
              >
                <p
                  className="text-[11px] font-semibold uppercase tracking-[0.07em]"
                  style={{ color: "var(--color-serious)" }}
                >
                  Round {latestRevision.round} notes
                </p>
                <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed">
                  {latestRevision.notes}
                </p>
                <p className="mt-2 text-[11px] text-[var(--color-ink-3)]">
                  {latestRevision.requester?.full_name} · {relativeTime(latestRevision.created_at)}
                </p>
              </div>
            )}

            <section>
              <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.07em] text-[var(--color-ink-3)]">
                Brief
              </h3>
              {data.brief ? (
                <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-[var(--color-ink)]">
                  {data.brief}
                </p>
              ) : (
                <p className="text-[13px] text-[var(--color-ink-3)]">No brief written.</p>
              )}

              {data.reference_urls.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {data.reference_urls.map((url) => (
                    <li key={url}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex max-w-full items-center gap-1.5 truncate text-[12.5px] text-[var(--color-accent)] hover:underline"
                      >
                        <ExternalLink size={12} className="shrink-0" />
                        <span className="truncate">{url}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <AttachmentsPanel
              ticketId={data.id}
              round={data.revision_count}
              profile={profile}
              attachments={attachments.data ?? []}
            />

            {revisions.data && revisions.data.length > 0 && (
              <section>
                <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.07em] text-[var(--color-ink-3)]">
                  Revision history
                </h3>
                <ol className="space-y-2">
                  {revisions.data.map((revision) => (
                    <li
                      key={revision.id}
                      className="rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2.5"
                    >
                      <p className="flex items-baseline gap-2 text-[11.5px] text-[var(--color-ink-3)]">
                        <span className="font-semibold text-[var(--color-ink-2)]">
                          Round {revision.round}
                        </span>
                        {revision.requester?.full_name} · {relativeTime(revision.created_at)}
                      </p>
                      {revision.notes && (
                        <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed">
                          {revision.notes}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            )}

            <Activity
              ticketId={data.id}
              profile={profile}
              comments={comments.data ?? []}
              events={events.data ?? []}
              team={(team.data ?? []) as Profile[]}
            />
          </div>

          {/* ----------------------------------------------------- sidebar */}
          <aside className="space-y-4">
            {/* A strategist gets delivery status, never the clock. */}
            {canSeeOwnTime(profile.role) && (
              <TimePanel
                ticket={data}
                sessions={sessions.data ?? []}
                benchmarks={benchmarks}
                canSeeDetail={isOwner || canSeeAllTime(profile.role)}
                viewerRole={profile.role}
              />
            )}

            <section className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3.5">
              <dl className="space-y-3">
                <Row label="Designer">
                  {isStaff ? (
                    <Select
                      value={data.assigned_to ?? ""}
                      onChange={(event) =>
                        void patch(
                          {
                            assigned_to: event.target.value || null,
                            // Assigning alone doesn't start anything; the
                            // designer still has to pick it up.
                          },
                          "Reassigned",
                        )
                      }
                      className="!py-1 !text-[12.5px]"
                    >
                      <option value="">Unassigned</option>
                      {designers.map((designer) => (
                        <option key={designer.id} value={designer.id}>
                          {designer.full_name || designer.email}
                        </option>
                      ))}
                    </Select>
                  ) : data.assignee ? (
                    <span className="flex items-center gap-1.5">
                      <Avatar
                        id={data.assignee.id}
                        name={data.assignee.full_name}
                        email={data.assignee.email}
                        src={data.assignee.avatar_url}
                        size={18}
                      />
                      {data.assignee.full_name || data.assignee.email}
                    </span>
                  ) : (
                    <span className="text-[var(--color-ink-3)]">Unassigned</span>
                  )}
                </Row>

                <Row label="Due">
                  {isStaff ? (
                    <input
                      type="datetime-local"
                      value={toLocalInput(data.due_at)}
                      onChange={(event) =>
                        void patch(
                          {
                            due_at: event.target.value
                              ? new Date(event.target.value).toISOString()
                              : null,
                          },
                          "Deadline updated",
                        )
                      }
                      className="w-full rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface-2)] px-2 py-1 text-[12.5px] outline-none focus:border-[var(--color-accent)]"
                    />
                  ) : (
                    <span
                      style={{
                        color:
                          dueState(data) === "overdue"
                            ? "var(--color-critical)"
                            : dueState(data) === "today"
                              ? "var(--color-warning)"
                              : undefined,
                      }}
                    >
                      {dueLabel(data.due_at)}
                    </span>
                  )}
                </Row>

                <Row label="Priority">
                  {isStaff ? (
                    <Select
                      value={data.priority}
                      onChange={(event) =>
                        void patch({ priority: event.target.value }, "Priority updated")
                      }
                      className="!py-1 !text-[12.5px]"
                    >
                      {Object.entries(PRIORITIES).map(([key, meta]) => (
                        <option key={key} value={key}>
                          {meta.label}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <span style={{ color: PRIORITIES[data.priority].tone }}>
                      {PRIORITIES[data.priority].label}
                    </span>
                  )}
                </Row>

                <Row label="Brand">
                  {isStaff ? (
                    <Select
                      value={data.brand_id ?? ""}
                      onChange={(event) =>
                        void patch({ brand_id: event.target.value || null }, "Brand updated")
                      }
                      className="!py-1 !text-[12.5px]"
                    >
                      <option value="">No brand</option>
                      {brands.map((brand) => (
                        <option key={brand.id} value={brand.id}>
                          {brand.name}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <span>{data.brand?.name ?? "—"}</span>
                  )}
                </Row>

                <Row label="Format">
                  <span>
                    {FORMATS[data.format].label}
                    {data.quantity > 1 && ` ×${data.quantity}`}
                  </span>
                </Row>

                <Row label="Stage">
                  <span style={{ color: STATUSES[data.status].fill }}>
                    {STATUSES[data.status].hint}
                  </span>
                </Row>
              </dl>
            </section>
          </aside>
        </div>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[74px_minmax(0,1fr)] items-center gap-2">
      <dt className="text-[11.5px] text-[var(--color-ink-3)]">{label}</dt>
      <dd className="min-w-0 text-[12.5px]">{children}</dd>
    </div>
  );
}

/** <input type="datetime-local"> wants local wall-clock time, not an ISO string. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}
