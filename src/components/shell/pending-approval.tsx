import { Clock3 } from "lucide-react";
import { SignOutButton } from "./sign-out-button";

export function PendingApproval({ email }: { email: string }) {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-sm text-center">
        <div
          className="mx-auto grid h-11 w-11 place-items-center rounded-[var(--radius-lg)]"
          style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
        >
          <Clock3 size={20} />
        </div>
        <h1 className="mt-5 text-[20px] font-semibold tracking-tight">Waiting on approval</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
          <span className="text-[var(--color-ink)]">{email}</span> isn&apos;t on the team
          list yet. An admin needs to add you and pick your role before you can
          get in.
        </p>
        <div className="mt-6">
          <SignOutButton variant="ghost" />
        </div>
      </div>
    </main>
  );
}
