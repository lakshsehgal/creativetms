"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, MailCheck } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * How long the emailed code is.
 *
 * Supabase will not go below six — `otp_length` is a project setting with a
 * documented range of 6 to 10 — so the shortest code this tool can ask anyone
 * to type is six digits. Set NEXT_PUBLIC_OTP_LENGTH to whatever the Supabase
 * dashboard says and the boxes below match it; leave it unset and we assume
 * six, which is both the Supabase default and the shortest allowed.
 */
const CODE_LENGTH = (() => {
  const configured = Number(process.env.NEXT_PUBLIC_OTP_LENGTH);
  if (!Number.isFinite(configured)) return 6;
  return Math.min(10, Math.max(6, Math.round(configured)));
})();

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/tickets";

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
    const digits = value.replace(/\D/g, "").slice(0, CODE_LENGTH);
    setCode(digits);
    setError(null);
    // A complete code needs no confirming click — pasting or typing the last
    // digit is unambiguous.
    if ((submitWhenComplete || digits.length === CODE_LENGTH) && digits.length === CODE_LENGTH) {
      void verify(digits);
    }
  }

  /** Google, when the studio is already signed into it all day anyway. */
  async function withGoogle() {
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: {
        // Back to our own callback, which trades the code for a session
        // cookie the middleware can see.
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        queryParams: { prompt: "select_account" },
      },
    });
    // On success the browser is already navigating to Google.
    if (error) {
      setBusy(false);
      setError(error.message);
    }
  }

  if (step === "email") {
    return (
      <form onSubmit={onEmailSubmit} className="rise">
        <h2 className="text-[24px] font-semibold tracking-[-0.02em]">Welcome back</h2>
        <p className="mt-1.5 text-[13px] text-[var(--color-ink-2)]">
          We&apos;ll email you a code. No password to remember.
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
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-brand)] px-4 py-2.5 text-[14px] font-semibold text-[var(--color-brand-ink)] transition-colors hover:bg-[var(--color-brand-hover)] disabled:opacity-60"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : null}
          {busy ? "Sending" : "Send code"}
          {!busy && <ArrowRight size={15} />}
        </button>

        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-[var(--color-line)]" />
          <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
            or
          </span>
          <span className="h-px flex-1 bg-[var(--color-line)]" />
        </div>

        <button
          type="button"
          onClick={() => void withGoogle()}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2.5 rounded-[var(--radius-md)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 py-2.5 text-[14px] font-medium transition-colors hover:bg-[var(--color-surface-2)] disabled:opacity-60"
        >
          <GoogleMark />
          Continue with Google
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
        style={{ background: "var(--color-brand)", color: "var(--color-brand-ink)" }}
      >
        <MailCheck size={17} />
      </div>

      <h2 className="mt-4 text-[24px] font-semibold tracking-[-0.02em]">Check your inbox</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-ink-2)]">
        {CODE_LENGTH}-digit code sent to{" "}
        <span className="text-[var(--color-ink)]">{email}</span>. It&apos;s good for an hour.
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (code.length === CODE_LENGTH) void verify(code);
        }}
      >
        <label htmlFor="code" className="sr-only">
          Sign-in code from your email
        </label>

        {/*
          One real input behind a row of boxes. A box-per-digit made of real
          inputs has to juggle focus, backspace across fields and paste, and
          gets all three subtly wrong; this keeps the browser's own
          one-time-code autofill working and just draws the digits.
        */}
        <div className="relative mt-7">
          <input
            ref={codeRef}
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={CODE_LENGTH}
            value={code}
            disabled={busy}
            onChange={(e) => onCodeChange(e.target.value)}
            onPaste={(e) => {
              e.preventDefault();
              onCodeChange(e.clipboardData.getData("text"), true);
            }}
            className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
          />
          <div className="pointer-events-none flex justify-between gap-2">
            {Array.from({ length: CODE_LENGTH }).map((_, index) => {
              const filled = index < code.length;
              const active = index === code.length && !busy;
              return (
                <span
                  key={index}
                  className={`tabular grid h-[52px] flex-1 place-items-center rounded-[var(--radius-md)] border text-[24px] font-semibold transition-colors ${
                    active
                      ? "border-[var(--color-accent)] bg-[var(--color-surface)]"
                      : filled
                        ? "border-[var(--color-line-strong)] bg-[var(--color-surface)]"
                        : "border-[var(--color-line)] bg-[var(--color-surface-2)]"
                  } ${busy ? "opacity-60" : ""}`}
                >
                  {code[index] ?? ""}
                </span>
              );
            })}
          </div>
        </div>

        {error && <Problem>{error}</Problem>}

        <button
          type="submit"
          disabled={busy || code.length < CODE_LENGTH}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-brand)] px-4 py-2.5 text-[14px] font-semibold text-[var(--color-brand-ink)] transition-colors hover:bg-[var(--color-brand-hover)] disabled:opacity-50"
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

/**
 * Google's mark, inline.
 *
 * Drawn rather than linked: the login page's CSP would have to allow another
 * host for a hotlinked logo, and an <img> that fails leaves a broken box on
 * the first screen anyone sees.
 */
function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
