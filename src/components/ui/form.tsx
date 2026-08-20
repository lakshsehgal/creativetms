"use client";

import { Loader2 } from "lucide-react";

const inputBase =
  "w-full rounded-[var(--radius-md)] border border-[var(--color-line-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-[13.5px] outline-none transition-colors placeholder:text-[var(--color-ink-3)] focus:border-[var(--color-accent)] disabled:opacity-60";

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[12px] font-medium text-[var(--color-ink-2)]">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11.5px] text-[var(--color-ink-3)]">{hint}</p>}
    </div>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputBase} ${props.className ?? ""}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea {...props} className={`${inputBase} resize-y leading-relaxed ${props.className ?? ""}`} />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`${inputBase} cursor-pointer appearance-none bg-[image:var(--chev)] bg-[length:14px] bg-[position:right_10px_center] bg-no-repeat pr-8 ${props.className ?? ""}`}
      style={{
        // Inline caret so there's no extra network request for an icon.
        ["--chev" as string]:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236f7885' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        ...props.style,
      }}
    />
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
};

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  children,
  className = "",
  disabled,
  ...rest
}: ButtonProps) {
  const variants: Record<string, string> = {
    primary:
      "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] border border-transparent",
    secondary:
      "bg-[var(--color-surface-2)] text-[var(--color-ink)] border border-[var(--color-line-strong)] hover:bg-[var(--color-surface-3)]",
    ghost:
      "bg-transparent text-[var(--color-ink-2)] border border-transparent hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]",
    danger:
      "bg-transparent text-[var(--color-critical)] border border-[color-mix(in_srgb,var(--color-critical)_35%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-critical)_12%,transparent)]",
  };

  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${
        size === "sm" ? "px-2.5 py-1.5 text-[12.5px]" : "px-3.5 py-2 text-[13px]"
      } ${variants[variant]} ${className}`}
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  );
}
