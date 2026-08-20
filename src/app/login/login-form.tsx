"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, MailCheck } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Supabase's OTP length is a project setting (6–10 digits), so the form can't
 * assume one. It accepts anything in that range: a paste submits straight
 * away because it arrives complete, and typing is confirmed with the button
 * or Enter rather than guessing when the code is finished.
 */
const MIN_CODE_LENGTH = 6;
const MAX_CODE_LENGTH = 10;

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/board";

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  async function sendCode(address: string) {
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: address.trim().toLowerCase(),
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return false;
    }
    setResendIn(45);
    return true;
  }

  async function onEmailSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!email.includes("@")) {
      setError("That doesn't look like an email address.");
      return;
    }
    if (await sendCode(email)) setStep("code");
  }

  async function verify(token: string) {
    setBusy(true);
    setError(null);

    const supabase = supabaseBrowser();
    const address = email.trim().toLowerCase();

    // A brand-new account's very first code is a *signup* token; every code
    // after that is an *email* token. Supabase rejects the wrong type with
    // "Token has expired or is invalid", which reads like expiry but isn't —
    // so try the ordinary case first and fall back to the first-time one.
    let failure: { message: string; status?: number } | null = null;

    for (const type of ["email", "signup"] as const) {
      const { error } = await supabase.auth.verifyOtp({ email: address, token, type });

      if (!error) {
        // Full navigation so middleware and server components see the cookie.
        router.replace(next);
        router.refresh();
        return;
      }

      failure = { message: error.message, status: error.status };
      // Backing off matters more than guessing once we're being throttled.
      if (error.status === 429) break;
    }

    setBusy(false);
    setCode("");
    setError(describeFailure(failure));
    codeRef.current?.focus();
  }

  function onCodeChange(value: string, submitWhenComplete = false) {
    const digits = value.replace(/\D/g, "").slice(0, MAX_CODE_LENGTH);
    setCode(digits);
    setError(null);
    if (submitWhenComplete && digits.length >= MIN_CODE_LENGTH) void verify(digits);
  }

  if (step === "email") {
    return (
      <form onSubmit={onEmailSubmit} className="rise">
        <h2 className="text-[22px] font-semibold tracking-tight">Sign in</h2>
        <p className="mt-1.5 text-[13px] text-[var(--color-ink-2)]">
          We&apos;ll email you a six-digit code. No password to remember.
        </p>

        <label htmlFor="email" className="mt-8 block text-[12px] font-medium text-[var(--color-ink-2)]">
          Work email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          placeholder="you@studio.com"
          className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3.5 py-2.5 text-[14px] outline-none transition-colors placeholder:text-[var(--color-ink-3)] focus:border-[var(--color-accent)]"
        />

        {error && <Problem>{error}</Problem>}

        <button
          type="submit"
          disabled={busy}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : null}
          {busy ? "Sending" : "Send code"}
          {!busy && <ArrowRight size={15} />}
        </button>
      </form>
    );
  }

  return (
    <div className="rise">
      <button
        type="button"
        onClick={() => {
          setStep("email");
          setCode("");
          setError(null);
        }}
        className="mb-6 flex items-center gap-1.5 text-[12px] text-[var(--color-ink-2)] transition-colors hover:text-[var(--color-ink)]"
      >
        <ArrowLeft size={13} /> Use a different email
      </button>

      <div
        className="grid h-9 w-9 place-items-center rounded-[var(--radius-md)]"
        style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
      >
        <MailCheck size={17} />
      </div>

      <h2 className="mt-4 text-[22px] font-semibold tracking-tight">Check your inbox</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-ink-2)]">
        Code sent to <span className="text-[var(--color-ink)]">{email}</span>. It&apos;s good
        for an hour.
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (code.length >= MIN_CODE_LENGTH) void verify(code);
        }}
      >
        <label htmlFor="code" className="sr-only">
          Sign-in code from your email
        </label>
        <input
          ref={codeRef}
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          disabled={busy}
          onChange={(e) => onCodeChange(e.target.value)}
          onPaste={(e) => {
            e.preventDefault();
            // A paste arrives complete, so it's safe to submit immediately.
            onCodeChange(e.clipboardData.getData("text"), true);
          }}
          className="tabular mt-7 w-full rounded-[var(--radius-md)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3.5 py-3 text-center text-[26px] font-semibold tracking-[0.32em] outline-none transition-colors placeholder:text-[18px] placeholder:tracking-normal placeholder:text-[var(--color-ink-3)] focus:border-[var(--color-accent)] disabled:opacity-60"
          placeholder="Paste your code"
        />

        {error && <Problem>{error}</Problem>}

        <button
          type="submit"
          disabled={busy || code.length < MIN_CODE_LENGTH}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : null}
          {busy ? "Verifying" : "Sign in"}
        </button>
      </form>

      <div className="mt-4 flex h-5 items-center justify-center text-[12px] text-[var(--color-ink-3)]">
        {resendIn > 0 ? (
          <span>Resend available in {resendIn}s</span>
        ) : (
          <button
            type="button"
            onClick={() => void sendCode(email)}
            className="text-[var(--color-accent)] transition-opacity hover:opacity-80"
          >
            Send another code
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Supabase says "Token has expired or is invalid" for a wrong code, a used
 * code and a genuinely stale one alike, so the wording has to cover the case
 * people actually hit: requesting a second code silently kills the first.
 */
function describeFailure(failure: { message: string; status?: number } | null): string {
  if (!failure) return "That didn't work. Try again.";

  const text = failure.message.toLowerCase();

  if (failure.status === 429 || text.includes("rate limit") || text.includes("too many")) {
    return "Too many tries. Wait a minute, then request a new code.";
  }
  if (text.includes("expired") || text.includes("invalid")) {
    return "That code didn't work. If you asked for more than one, only the newest email works — request a fresh code and use that.";
  }
  return failure.message;
}

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="mt-3 rounded-[var(--radius-sm)] px-3 py-2 text-[12.5px]"
      style={{ background: "color-mix(in srgb, var(--color-critical) 12%, transparent)", color: "var(--color-critical)" }}
    >
      {children}
    </p>
  );
}
