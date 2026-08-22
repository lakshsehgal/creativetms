import { Suspense } from "react";
import type { Metadata } from "next";
import { Logo } from "@/components/ui/logo";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

/**
 * The first thing the team sees, so the framing matters.
 *
 * An earlier draft led with "every minute tracked", which reads as
 * surveillance and puts a designer on the defensive before they've even
 * signed in. The tool's actual value is that the studio stops running on
 * memory and Slack pings — briefs in one place, a clear queue, no chasing.
 * The timing is a by-product of work already happening on the board, so the
 * copy says that plainly rather than making it the headline.
 */
export default function LoginPage() {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-[#111111] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -top-32 h-[30rem] w-[30rem] rounded-full opacity-[0.18] blur-3xl"
          style={{ background: "var(--color-brand)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -left-24 h-[26rem] w-[26rem] rounded-full opacity-[0.10] blur-3xl"
          style={{ background: "var(--color-brand)" }}
        />

        <div className="relative">
          <Logo size={32} tone="dark" />
        </div>

        <div className="relative max-w-lg">
          <p
            className="text-[12px] font-medium uppercase tracking-[0.2em]"
            style={{ color: "var(--color-brand)" }}
          >
            Creative Operations
          </p>

          <h1 className="display mt-5 text-[2.7rem] leading-[1.08] text-white">
            Great work shouldn&apos;t wait on a status update.
          </h1>

          <p className="mt-6 text-[15px] leading-relaxed text-white/70">
            One place for every brief, every brand and every round. Strategists
            stop chasing, designers stop guessing what&apos;s next, and the
            studio can take on more without adding chaos.
          </p>

          <ul className="mt-10 space-y-3.5">
            {[
              ["Briefs land with everything attached", "No more half a brief in Slack and the rest in a DM."],
              ["Your day, decided by you", "Pick what you're taking on. Priorities are visible, not shouted."],
              ["Rounds that don't get lost", "V1, V2, V3 all stay put, with the notes that went with them."],
            ].map(([title, detail]) => (
              <li key={title} className="flex gap-3">
                <span
                  aria-hidden
                  className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: "var(--color-brand)" }}
                />
                <span>
                  <span className="block text-[14px] font-medium text-white">{title}</span>
                  <span className="block text-[13px] leading-relaxed text-white/55">{detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative max-w-md text-[12.5px] leading-relaxed text-white/40">
          Built so the studio scales on structure rather than on people
          remembering things.
        </p>
      </section>

      <section className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-[22rem]">
          <div className="mb-10 lg:hidden">
            <Logo size={30} tone="light" />
          </div>
          <Suspense fallback={<div className="skeleton h-52" />}>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
