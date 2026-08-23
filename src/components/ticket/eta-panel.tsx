"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, Check, Clock, HelpCircle, X } from "lucide-react";
import type { EtaUpdate, Profile, TicketWithRefs } from "@/lib/types";
import {
  ETA_PRESETS,
  ETA_STATES,
  daysLate,
  etaLabel,
  etaState,
  fromLocalInput,
  moveLabel,
  toLocalInput,
} from "@/lib/eta";
import { relativeTime } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/queries";
import { reportWriteFailure, withRetry } from "@/lib/write";
import { Button, TextInput } from "@/components/ui/form";

/**
 * Expected delivery.
 *
 * Two dates that must never be confused. The due date is the promise made when
 * the brief was raised and it doesn't move. This is the designer's own read on
 * when the thing will really be ready, and it moves as often as reality does.
 * The gap between them is the whole point: the strategist doesn't need a
 * timesheet, they need to know the Thursday promise became Monday while
 * there's still time to tell the client.
 *
 * Deliberately not on every ticket. It appears when somebody asks, or when the
 * designer volunteers one — a field everybody has to fill on every brief is
 * the timesheet this tool exists to avoid.
 *
 * The reason is offered and never required. Mandatory reasons train people to
 * type "busy".
 */
export function EtaPanel({
  ticket,
  profile,
}: {
  ticket: TicketWithRefs;
  profile: Profile;
}) {
  const supabase = supabaseBrowser();
  const queryClient = useQueryClient();

  const isOwner = ticket.assigned_to === profile.id;
  const canAnswer = isOwner || profile.role === "admin";
  const canAsk = profile.role === "admin" || profile.role === "strategist";

  // The clock only starts after mount. Before that the server and the
  // browser's first paint have to agree, and "has the estimate passed?" is a
  // question whose answer changes between the two.
  const [live, setLive] = useState(false);
  useEffect(() => setLive(true), []);

  const state = etaState(ticket, live ? Date.now() : 0);
  const meta = ETA_STATES[state];
  const late = daysLate(ticket.due_at, ticket.eta_at);

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(toLocalInput(ticket.eta_at));
  const [reason, setReason] = useState(ticket.eta_reason ?? "");
  const [saving, setSaving] = useState(false);
  const [asking, setAsking] = useState(false);

  // Somebody else may have moved it while this page was open.
  useEffect(() => {
    if (!editing) {
      setValue(toLocalInput(ticket.eta_at));
      setReason(ticket.eta_reason ?? "");
    }
  }, [ticket.eta_at, ticket.eta_reason, editing]);

  const history = useQuery({
    queryKey: ["eta-updates", ticket.id],
    // Only worth fetching once there's something to have a history of.
    enabled: Boolean(ticket.eta_at) || Boolean(ticket.eta_requested_at),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("eta_updates")
        .select("*, setter:profiles!eta_updates_set_by_fkey(id,full_name,email)")
        .eq("ticket_id", ticket.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EtaUpdate[];
    },
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: queryKeys.ticket(ticket.id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.tickets });
    queryClient.invalidateQueries({ queryKey: ["eta-updates", ticket.id] });
  }

  async function ask() {
    setAsking(true);
    const { error } = await withRetry(() =>
      supabase
        .from("tickets")
        .update({ eta_requested_at: new Date().toISOString() })
        .eq("id", ticket.id),
    );
    setAsking(false);
    if (error) {
      reportWriteFailure(error.message, "that request", () => void ask());
      return;
    }
    refresh();
    toast.success(
      ticket.assignee?.full_name
        ? `Asked ${ticket.assignee.full_name.split(" ")[0]} for an estimate`
        : "Asked for an estimate",
    );
  }

  async function save(iso: string | null) {
    setSaving(true);
    const { error } = await withRetry(() =>
      supabase
        .from("tickets")
        .update({ eta_at: iso, eta_reason: iso ? reason.trim() : "" })
        .eq("id", ticket.id),
    );
    setSaving(false);
    if (error) {
      reportWriteFailure(error.message, "that estimate", () => void save(iso));
      return;
    }
    setEditing(false);
    refresh();
    toast.success(iso ? "Estimate updated — they've been told" : "Estimate withdrawn");
  }

  /* ------------------------------------------------------------ nothing yet */

  // No estimate, nobody has asked, and this person can't do either — say
  // nothing at all rather than adding an empty row to every ticket.
  if (state === "none" && !canAsk && !canAnswer) return null;
  if (state === "settled" && !ticket.eta_at) return null;

  const shell =
    "rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4";

  return (
    <section className={shell}>
      <div className="flex flex-wrap items-center gap-2">
        <CalendarClock size={14} className="text-[var(--color-ink-3)]" />
        <h2 className="text-[12.5px] font-semibold tracking-tight">Expected delivery</h2>

        {state !== "none" && (
          <span
            // Every one of these reads the clock, and the page is rendered on
            // the server first. Same guard the due-date labels already use.
            suppressHydrationWarning
            className="rounded-[var(--radius-xs)] px-1.5 py-0.5 text-[10.5px] font-medium"
            style={{
              background: `color-mix(in srgb, ${meta.tone} 14%, transparent)`,
              color: meta.tone,
            }}
          >
            {meta.label}
          </span>
        )}

        {!editing && canAnswer && state !== "settled" && (
          <span className="ml-auto">
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              {ticket.eta_at ? "Update it" : "Give an estimate"}
            </Button>
          </span>
        )}

        {/* Askable when there's no estimate, and again once the one there is
            has come and gone — a date that has passed is exactly when someone
            needs to ask for a new one. */}
        {!editing && !canAnswer && canAsk && (state === "none" || state === "waiting" || state === "missed") && (
          <span className="ml-auto">
            <Button
              size="sm"
              variant={state === "waiting" ? "ghost" : "secondary"}
              loading={asking}
              disabled={state === "waiting"}
              onClick={() => void ask()}
            >
              <HelpCircle size={13} />
              {state === "waiting"
                ? "Asked"
                : state === "missed"
                  ? "Ask for a new one"
                  : "Ask for an ETA"}
            </Button>
          </span>
        )}
      </div>

      {/* ------------------------------------------------------ the answer */}

      {!editing && (
        <>
          {ticket.eta_at ? (
            <>
              <p suppressHydrationWarning className="mt-2 text-[15px] font-semibold tracking-tight">
                {etaLabel(ticket.eta_at)}
              </p>
              <p suppressHydrationWarning className="mt-0.5 text-[11.5px] text-[var(--color-ink-3)]">
                {new Date(ticket.eta_at).toLocaleString(undefined, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  hour: "numeric",
                  minute: "2-digit",
                })}
                {ticket.assignee?.full_name && (
                  <>{` · ${ticket.assignee.full_name.split(" ")[0]}'s estimate`}</>
                )}
                {late > 0 && (
                  <span style={{ color: "var(--color-serious)" }}>
                    {" · "}
                    {late} day{late === 1 ? "" : "s"} past the due date
                  </span>
                )}
              </p>
              {ticket.eta_reason && (
                <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">
                  {ticket.eta_reason}
                </p>
              )}
            </>
          ) : state === "waiting" ? (
            <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">
              {canAnswer
                ? "Somebody's waiting on a date for this one. A rough one is worth more than none — you can move it later."
                : `Waiting on ${ticket.assignee?.full_name?.split(" ")[0] ?? "the designer"}. They've been notified.`}
            </p>
          ) : (
            <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--color-ink-3)]">
              {canAnswer
                ? "Nobody's asked. If this one is going to run long, say so here and whoever raised it finds out without having to chase."
                : "No estimate on this one yet."}
            </p>
          )}
        </>
      )}

      {/* -------------------------------------------------------- the form */}

      {editing && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-1.5">
            {ETA_PRESETS.map((preset) => (
              <button
                key={preset.key}
                onClick={() => setValue(toLocalInput(preset.at(new Date()).toISOString()))}
                className="rounded-[var(--radius-sm)] border border-[var(--color-line)] px-2 py-1 text-[11.5px] text-[var(--color-ink-2)] transition-colors hover:border-[var(--color-line-strong)] hover:text-[var(--color-ink)]"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
            <TextInput
              type="datetime-local"
              aria-label="Expected delivery"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
            <TextInput
              aria-label="What's holding it up"
              placeholder="What's holding it up? — optional"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              loading={saving}
              disabled={!value}
              onClick={() => void save(fromLocalInput(value))}
            >
              <Check size={13} /> Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            {ticket.eta_at && (
              <Button size="sm" variant="ghost" onClick={() => void save(null)}>
                <X size={13} /> Withdraw
              </Button>
            )}
            <span className="text-[11px] text-[var(--color-ink-3)]">
              Whoever raised this gets told. The due date doesn&apos;t change.
            </span>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------- the trail */}

      {(history.data?.length ?? 0) > 1 && (
        <details className="mt-3 border-t border-[var(--color-line)] pt-2.5">
          <summary className="cursor-pointer list-none text-[11.5px] text-[var(--color-ink-3)] hover:text-[var(--color-ink)]">
            Moved {history.data!.length - 1} time
            {history.data!.length === 2 ? "" : "s"} — see the history
          </summary>
          <ul className="mt-2 space-y-1.5">
            {history.data!.map((row) => (
              <li key={row.id} suppressHydrationWarning className="flex items-start gap-2 text-[11.5px]">
                <Clock size={11} className="mt-0.5 shrink-0 text-[var(--color-ink-3)]" />
                <span className="min-w-0">
                  <span className="font-medium">{moveLabel(row.previous_eta_at, row.eta_at)}</span>
                  {row.eta_at && (
                    <span className="text-[var(--color-ink-2)]"> to {etaLabel(row.eta_at)}</span>
                  )}
                  {row.reason && (
                    <span className="text-[var(--color-ink-2)]"> — {row.reason}</span>
                  )}
                  <span className="text-[var(--color-ink-3)]">
                    {" · "}
                    {row.setter?.full_name?.split(" ")[0] ?? "Someone"}, {relativeTime(row.created_at)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
