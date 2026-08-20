"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";

export function SignOutButton({ variant = "icon" }: { variant?: "icon" | "ghost" }) {
  const router = useRouter();

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (variant === "ghost") {
    return (
      <button
        onClick={signOut}
        className="rounded-[var(--radius-md)] border border-[var(--color-line-strong)] px-3.5 py-2 text-[13px] transition-colors hover:bg-[var(--color-surface-2)]"
      >
        Sign out
      </button>
    );
  }

  return (
    <button
      onClick={signOut}
      title="Sign out"
      aria-label="Sign out"
      className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-ink)]"
    >
      <LogOut size={14} />
    </button>
  );
}
