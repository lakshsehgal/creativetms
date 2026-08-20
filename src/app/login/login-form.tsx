"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, MailCheck } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";

const CODE_LENGTH = 6;

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
    const { error } = await supabaseBrowser().auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token,
      type: "email",
    });
    if (error) {
      setBusy(false);
      setCode("");
      setError(
        error.message.toLowerCase().includes("expired")
          ? "That code has expired. Send a fresh one."
          : "That code didn't match. Check it and try again.",
      );
      codeRef.current?.focus();
      return;
    }
    // Full navigation so middleware and server components see the new cookie.
    router.replace(next);
    router.refresh();
  }

  function onCodeChange(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, CODE_LENGTH);
    setCode(digits);
    setError(null);
    if (digits.length === CODE_LENGTH) void verify(digits);
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

      <label htmlFor="code" className="sr-only">
        Six-digit code
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
          onCodeChange(e.clipboardData.getData("text"));
        }}
        className="tabular mt-7 w-full rounded-[var(--radius-md)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3.5 py-3 text-center text-[26px] font-semibold tracking-[0.42em] outline-none transition-colors placeholder:tracking-[0.42em] placeholder:text-[var(--color-ink-3)] focus:border-[var(--color-accent)] disabled:opacity-60"
        placeholder="······"
      />

      {error && <Problem>{error}</Problem>}

      <div className="mt-5 flex h-5 items-center justify-center text-[12px] text-[var(--color-ink-3)]">
        {busy ? (
          <span className="flex items-center gap-2 text-[var(--color-ink-2)]">
            <Loader2 size={13} className="animate-spin" /> Verifying
          </span>
        ) : resendIn > 0 ? (
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
