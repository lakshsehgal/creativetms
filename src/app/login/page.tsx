import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Left: the pitch. Hidden on small screens where it would just be scroll. */}
      <section className="relative hidden overflow-hidden border-r border-[var(--color-line)] bg-[var(--color-surface)] p-12 lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full opacity-25 blur-3xl"
          style={{
            background:
              "radial-gradient(circle at center, var(--color-accent), transparent 65%)",
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-2.5">
            <Mark />
            <span className="text-[15px] font-semibold tracking-tight">Creative TMS</span>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-[2.1rem] font-semibold leading-[1.15] tracking-tight">
            Every brief, every designer, every minute — in one board.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-[var(--color-ink-2)]">
            Strategists raise tickets. Designers pick them up. The clock runs on
            its own, so nobody has to remember a stopwatch and nobody has to
            chase a status update.
          </p>

          <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-6">
            {[
              ["Formats tracked", "Video · Static · Carousel · GIF"],
              ["Timing", "Automatic, from the board"],
              ["Scorecards", "Every designer, every evening"],
              ["Access", "Admin · Strategist · Designer"],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] font-medium uppercase tracking-[0.09em] text-[var(--color-ink-3)]">
                  {label}
                </dt>
                <dd className="mt-1 text-[13px] text-[var(--color-ink)]">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="relative text-[12px] text-[var(--color-ink-3)]">
          Time is measured from work that already happens on the board — not
          from anything a designer has to fill in.
        </p>
      </section>

      {/* Right: the actual door. */}
      <section className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-[22rem]">
          <div className="mb-9 flex items-center gap-2.5 lg:hidden">
            <Mark />
            <span className="text-[15px] font-semibold tracking-tight">Creative TMS</span>
          </div>
          {/* useSearchParams needs a boundary so this page can prerender. */}
          <Suspense fallback={<div className="skeleton h-52" />}>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}

function Mark() {
  return (
    <span
      className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-[13px] font-bold text-white"
      style={{ background: "var(--color-accent)" }}
    >
      C
    </span>
  );
}
