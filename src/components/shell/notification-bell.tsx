"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check } from "lucide-react";
import type { AppNotification } from "@/lib/types";
import { relativeTime } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * The handoff inbox.
 *
 * Rows are written by database triggers rather than by the client, so a ping
 * can't be lost to a dropped request or a tab that was closed at the moment
 * somebody hit Approve. Realtime just delivers what's already durable.
 */
export function NotificationBell({ collapsed }: { collapsed: boolean }) {
  const supabase = supabaseBrowser();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const notifications = useQuery({
    queryKey: ["notifications"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as AppNotification[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, supabase]);

  // Close on outside click without a library.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    // Deferred so the click that opened it doesn't immediately close it.
    const id = setTimeout(() => document.addEventListener("click", close), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("click", close);
    };
  }, [open]);

  const rows = notifications.data ?? [];
  const unread = rows.filter((row) => !row.read_at);

  async function markAllRead() {
    if (unread.length === 0) return;
    // Optimistic: the badge should clear the instant you look at the list.
    queryClient.setQueryData<AppNotification[]>(["notifications"], (current) =>
      (current ?? []).map((row) => ({ ...row, read_at: row.read_at ?? new Date().toISOString() })),
    );
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null);
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  return (
    <div
      data-tour="bell"
      className="relative"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        onClick={() => setOpen((value) => !value)}
        title="Notifications"
        aria-label={unread.length ? `${unread.length} unread notifications` : "Notifications"}
        className={`relative grid place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-ink)] ${
          collapsed ? "h-7 w-full" : "h-7 w-7"
        }`}
      >
        <Bell size={14} />
        {unread.length > 0 && (
          <span
            className="tabular absolute -right-0.5 -top-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full px-1 text-[9px] font-bold text-white"
            style={{ background: "var(--color-critical)" }}
          >
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="rise absolute bottom-full left-0 z-50 mb-2 w-[300px] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] shadow-[var(--shadow-pop)]">
          <div className="flex items-center gap-2 border-b border-[var(--color-line)] px-3 py-2">
            <span className="text-[12px] font-semibold">Notifications</span>
            {unread.length > 0 && (
              <button
                onClick={() => void markAllRead()}
                className="ml-auto inline-flex items-center gap-1 text-[11.5px] text-[var(--color-accent)] hover:underline"
              >
                <Check size={11} /> Mark all read
              </button>
            )}
          </div>

          {rows.length === 0 ? (
            <p className="px-3 py-6 text-center text-[12px] text-[var(--color-ink-3)]">
              Nothing yet. You&apos;ll hear when work lands on you or comes back.
            </p>
          ) : (
            <ul className="max-h-[340px] overflow-y-auto">
              {rows.map((row) => (
                <li key={row.id}>
                  <Link
                    href={
                      row.ticket_id
                        ? `/tickets/${row.ticket_id}`
                        : row.kind === "shoot_block"
                          ? "/shoot"
                          : "/board"
                    }
                    onClick={() => setOpen(false)}
                    className={`block border-b border-[var(--color-line)] px-3 py-2 transition-colors last:border-0 hover:bg-[var(--color-surface-2)] ${
                      row.read_at ? "" : "bg-[var(--color-accent-soft)]"
                    }`}
                  >
                    <p className="flex items-baseline gap-2">
                      <span className="text-[12.5px] font-medium">{row.title}</span>
                      <span className="ml-auto shrink-0 text-[10.5px] text-[var(--color-ink-3)]">
                        {relativeTime(row.created_at)}
                      </span>
                    </p>
                    <p className="truncate text-[11.5px] text-[var(--color-ink-2)]">{row.body}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
