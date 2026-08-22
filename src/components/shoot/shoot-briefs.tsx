"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ClipboardList,
  Cloud,
  CloudOff,
  FileText,
  Plus,
  Printer,
  Trash2,
} from "lucide-react";
import type { ChecklistPhase, Profile, Shoot, ShootDoc } from "@/lib/types";
import {
  blankDoc,
  checklistProgress,
  defaultChecklist,
  normaliseShoot,
} from "@/lib/shoot";
import { isoDay } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { reportWriteFailure, withRetry } from "@/lib/write";
import { Card, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/form";
import { CallSheet } from "./call-sheet";
import { BriefChecklist } from "./brief-checklist";

/**
 * Shoot briefs — the call sheet and the run-up checklist.
 *
 * This started life as an HTML file that saved to one person's localStorage.
 * Everything about it was right except where it lived: a call sheet only its
 * author can open is the WhatsApp forward it was meant to replace. Here it is
 * a row in the database, so the videographer, the strategist and whoever ends
 * up doing the pickup shoot are all reading the same one.
 *
 * It saves as you type — there is no Save button, on purpose. The one thing
 * that must never happen to a call sheet at 11pm the night before is losing it.
 */

const AUTOSAVE_MS = 900;

type Pane = "sheet" | "checklist";

export function ShootBriefs({ profile }: { profile: Profile }) {
  const supabase = supabaseBrowser();
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);

  const shoots = useQuery<Shoot[]>({
    queryKey: ["shoots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shoots")
        .select("*")
        .is("archived_at", null)
        .order("shoot_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as Record<string, unknown>[];
      return rows.map(normaliseShoot);
    },
  });

  const rows = useMemo(() => shoots.data ?? [], [shoots.data]);
  const open = rows.find((row) => row.id === openId) ?? null;

  async function create() {
    const { data, error } = await withRetry(() =>
      supabase
        .from("shoots")
        .insert({
          title: "Untitled shoot",
          brand: "",
          shoot_date: isoDay(),
          doc: blankDoc() as unknown as Record<string, unknown>,
          checklist: defaultChecklist() as unknown as Record<string, unknown>[],
          created_by: profile.id,
        })
        .select("*")
        .single(),
    );

    if (error || !data) {
      reportWriteFailure(error?.message ?? "Couldn't start it", "the new call sheet", () =>
        void create(),
      );
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["shoots"] });
    setOpenId((data as { id: string }).id);
  }

  async function remove(shoot: Shoot) {
    if (!window.confirm(`Delete the call sheet for ${shoot.title || "this shoot"}?`)) return;

    // Archived, not deleted. A call sheet somebody binned by accident the
    // morning of the shoot is the worst possible thing to actually destroy.
    const { error } = await withRetry(() =>
      supabase
        .from("shoots")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", shoot.id),
    );
    if (error) {
      reportWriteFailure(error.message, "that call sheet", () => void remove(shoot));
      return;
    }
    if (openId === shoot.id) setOpenId(null);
    queryClient.invalidateQueries({ queryKey: ["shoots"] });
    toast.success("Call sheet removed");
  }

  if (open) {
    return (
      <BriefEditor
        shoot={open}
        onBack={() => setOpenId(null)}
        onDelete={() => void remove(open)}
      />
    );
  }

  return (
    <div className="mx-auto max-w-[980px] space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-[13px] font-semibold tracking-tight">Call sheets</h2>
        <span className="text-[11.5px] text-[var(--color-ink-3)]">
          shared with everyone — brief once, not once per WhatsApp group
        </span>
        <span className="ml-auto">
          <Button size="sm" variant="primary" onClick={() => void create()}>
            <Plus size={13} /> New call sheet
          </Button>
        </span>
      </div>

      {shoots.isLoading ? (
        <div className="skeleton h-32" />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileText size={22} />}
            title="No call sheets yet"
            hint="Start one and it fills in as you go — locations, scripts, crew, actors, meals, and the checklist that gets ticked on the day."
          />
        </Card>
      ) : (
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {rows.map((shoot) => {
            const progress = checklistProgress(shoot.checklist);
            return (
              <li key={shoot.id}>
                <Card padded={false}>
                  <button
                    onClick={() => setOpenId(shoot.id)}
                    className="block w-full px-3.5 py-3 text-left"
                  >
                    <p className="truncate text-[13px] font-semibold">
                      {shoot.title || "Untitled shoot"}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-[var(--color-ink-3)]">
                      <CalendarDays size={12} />
                      {shoot.shoot_date
                        ? new Date(`${shoot.shoot_date}T00:00:00`).toLocaleDateString(undefined, {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })
                        : "No date yet"}
                      {shoot.brand && <span>· {shoot.brand}</span>}
                    </p>
                    <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--color-ink-3)]">
                      <ClipboardList size={12} />
                      {progress.done} of {progress.total} ticked
                    </p>
                  </button>
                  <div className="flex items-center gap-2 border-t border-[var(--color-line)] px-3.5 py-1.5">
                    <span className="text-[11px] text-[var(--color-ink-3)]">
                      updated {new Date(shoot.updated_at).toLocaleDateString()}
                    </span>
                    <button
                      onClick={() => void remove(shoot)}
                      aria-label={`Delete ${shoot.title || "this call sheet"}`}
                      className="ml-auto text-[var(--color-ink-3)] transition-colors hover:text-[var(--color-critical)]"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- editor */

type SaveState = "clean" | "saving" | "saved" | "failed";

function BriefEditor({
  shoot,
  onBack,
  onDelete,
}: {
  shoot: Shoot;
  onBack: () => void;
  onDelete: () => void;
}) {
  const supabase = supabaseBrowser();
  const queryClient = useQueryClient();
  const [pane, setPane] = useState<Pane>("sheet");
  const [local, setLocal] = useState<Shoot>(shoot);
  const [state, setState] = useState<SaveState>("clean");

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Partial<Shoot> | null>(null);

  const flush = useCallback(async () => {
    const patch = pending.current;
    if (!patch) return;
    pending.current = null;
    setState("saving");

    const { error } = await withRetry(() =>
      supabase
        .from("shoots")
        .update({
          title: patch.title,
          brand: patch.brand,
          shoot_date: patch.shoot_date,
          doc: patch.doc as unknown as Record<string, unknown>,
          checklist: patch.checklist as unknown as Record<string, unknown>[],
        })
        .eq("id", shoot.id),
    );

    if (error) {
      // Put it back so the next edit — or leaving the page — tries again
      // rather than quietly dropping what was typed.
      pending.current = patch;
      setState("failed");
      return;
    }

    setState("saved");
    queryClient.invalidateQueries({ queryKey: ["shoots"] });
  }, [supabase, shoot.id, queryClient]);

  const change = useCallback(
    (next: Partial<Shoot>) => {
      setLocal((current) => {
        const merged = { ...current, ...next };
        pending.current = merged;
        return merged;
      });
      setState("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
    },
    [flush],
  );

  // Leaving the editor is exactly when a debounced write is still in flight,
  // so the unmount flushes rather than cancels. Clearing the timer here would
  // guarantee the loss this whole arrangement exists to prevent.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      void flush();
    };
  }, [flush]);

  const setDoc = useCallback((doc: ShootDoc) => change({ doc }), [change]);
  const setChecklist = useCallback(
    (checklist: ChecklistPhase[]) => change({ checklist }),
    [change],
  );

  return (
    <div className="mx-auto max-w-[980px] space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft size={13} /> All call sheets
        </Button>

        <div
          role="tablist"
          aria-label="Call sheet"
          className="flex items-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--color-line)] p-0.5"
        >
          {(
            [
              { key: "sheet" as const, label: "Call sheet", icon: FileText },
              { key: "checklist" as const, label: "Checklist", icon: ClipboardList },
            ]
          ).map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.key}
                role="tab"
                aria-selected={pane === option.key}
                onClick={() => setPane(option.key)}
                className={`flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 py-1 text-[12px] transition-colors ${
                  pane === option.key
                    ? "bg-[var(--color-surface-3)] font-medium text-[var(--color-ink)]"
                    : "text-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
                }`}
              >
                <Icon size={12} />
                {option.label}
              </button>
            );
          })}
        </div>

        <SaveBadge state={state} onRetry={() => void flush()} />

        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => window.print()}>
            <Printer size={13} /> Print
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete}>
            <Trash2 size={13} />
          </Button>
        </div>
      </div>

      {pane === "sheet" ? (
        <CallSheet
          title={local.title}
          brand={local.brand}
          shootDate={local.shoot_date}
          doc={local.doc}
          onMeta={(meta) => change(meta)}
          onDoc={setDoc}
        />
      ) : (
        <BriefChecklist
          phases={local.checklist}
          crew={local.doc.crew}
          onChange={setChecklist}
        />
      )}
    </div>
  );
}

/**
 * Whether what you typed is actually somewhere other than this tab.
 *
 * A silent autosave is only trustworthy if it tells you when it isn't working
 * — otherwise the first sign of trouble is an empty call sheet on shoot day.
 */
function SaveBadge({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state === "clean") return null;

  if (state === "failed") {
    return (
      <button
        onClick={onRetry}
        className="flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-[11.5px] font-medium"
        style={{
          background: "color-mix(in srgb, var(--color-critical) 12%, transparent)",
          color: "var(--color-critical)",
        }}
      >
        <CloudOff size={12} /> Not saved — retry
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1.5 px-1 text-[11.5px] text-[var(--color-ink-3)]">
      {state === "saving" ? (
        <>
          <Cloud size={12} /> Saving…
        </>
      ) : (
        <>
          <Check size={12} /> Saved
        </>
      )}
    </span>
  );
}
