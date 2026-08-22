"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Coffee, Play } from "lucide-react";
import type { Profile } from "@/lib/types";
import { stopwatch } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/queries";
import { secondsSince, useTicking } from "@/hooks/use-ticking";
import { Logo } from "@/components/ui/logo";

/**
 * Step away without it costing anyone anything.
 *
 * Going on a break closes the live work session; coming back re-opens one on
 * the same ticket, so the total continues rather than restarting. Lunch simply
 * isn't in the numbers — which is the point. Nobody should have to choose
 * between taking a proper break and looking slow.
 *
 * The heartbeat is refused server-side while a break is open, so a tab left
 * running in the background can't quietly restart the clock either.
 */
export function BreakMode({ profile }: { profile: Profile }) {
  const supabase = supabaseBrowser();
  const queryClient = useQueryClient();
  const router = useRouter();

  const [onBreak, setOnBreak] = useState(Boolean(profile.break_started_at));
  const [since, setSince] = useState<string | null>(profile.break_started_at);
  const [busy, setBusy] = useState(false);

  useTicking(onBreak);

  // Another tab (or another device) may have started or ended the break.
  useEffect(() => {
    setOnBreak(Boolean(profile.break_started_at));
    setSince(profile.break_started_at);
  }, [profile.break_started_at]);

  async function start() {
    setBusy(true);
    const { data, error } = await supabase.rpc("start_break");
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setOnBreak(true);
    setSince((data as string) ?? new Date().toISOString());
    queryClient.invalidateQueries({ queryKey: queryKeys.ticketTime });
  }

  async function end() {
    setBusy(true);
    const { error } = await supabase.rpc("end_break");
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setOnBreak(false);
    setSince(null);
    queryClient.invalidateQueries({ queryKey: queryKeys.tickets });
    queryClient.invalidateQueries({ queryKey: queryKeys.ticketTime });
    router.refresh();
    toast.success("Welcome back — picking up where you left off");
  }

  if (onBreak) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#111111] px-6 text-center">
        <Logo size={34} tone="dark" />

        <p className="mt-12 text-[13px] uppercase tracking-[0.18em] text-white/45">
          On a break
        </p>
        <p
          className="tabular mt-3 text-[64px] leading-none text-white"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {stopwatch(secondsSince(since))}
        </p>
        <p className="display mt-6 max-w-sm text-[22px] leading-snug text-white/80">
          Nothing is counting. Take as long as you need.
        </p>

        <button
          onClick={() => void end()}
          disabled={busy}
          className="mt-10 inline-flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-semibold transition-transform hover:scale-[1.02] disabled:opacity-60"
          style={{ background: "var(--color-brand)", color: "var(--color-brand-ink)" }}
        >
          <Play size={15} fill="currentColor" /> I&apos;m back
        </button>

        <p className="mt-5 text-[12px] text-white/35">
          Your ticket is waiting exactly where you left it.
        </p>
      </div>
    );
  }

  return (
    <button
      onClick={() => void start()}
      disabled={busy}
      title="Pause everything and step away"
      className="flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-2 py-1.5 text-[12px] font-medium transition-colors hover:bg-[var(--color-surface-2)] disabled:opacity-60"
    >
      <Coffee size={13} />
      Break
    </button>
  );
}
