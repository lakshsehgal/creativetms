# Neuroid UI Kit

**A drop-in design system.** Copy this one file into a new project, and tell your
coding agent: *"Read `NEUROID-UI-KIT.md` and build the UI to it."* Everything
needed is in here — tokens, base CSS, primitive components, the shell, the
sign-in page, and the rules that make new screens look like they belong.

Lifted from Neuroid Creative Studio, where it was built and stress-tested
across a kanban board, four other data views, print output and email.

---

## 0 · What to hand your agent

> Read `NEUROID-UI-KIT.md`. Use §2 as `src/app/globals.css` verbatim, §4 as the
> component primitives, and §7 as the law. Build every screen out of the
> primitives in §4 — do not invent a second button, a second card, or a
> one-off colour. When you need something that isn't in §4, build it out of the
> tokens in §2 and add it to the primitives file so it exists once.

That paragraph is the whole handover.

---

## 1 · Stack and setup

Built for **Next.js 15 (App Router) + React 19 + Tailwind CSS v4**. The tokens
are plain CSS custom properties, so the CSS and the rules port to Vite, Remix
or Astro unchanged; only the `next/font` bit in §3 is Next-specific.

```bash
npm i lucide-react sonner
# Tailwind v4 — no tailwind.config.js needed; §2 is the config.
```

| Thing | Why it's here |
|---|---|
| **lucide-react** | One icon set, drawn on the same grid. Never mix in a second. |
| **sonner** | Toasts. Styled in §3 to use the tokens. |

### Fonts you must supply

- **DM Sans** — free, via `next/font/google`. Wired up in §3.
- **PP Editorial New (Italic)** — *commercial licence required.* Buy it from
  Pangram Pangram and drop `PPEditorialNew-Italic.otf` in `public/fonts/`.
  It is used for headline moments only. **Without it the kit still works** —
  the `--font-display` stack falls back to Georgia, which is a decent stand-in.
  Do not ship someone else's font file.

### Logo files

Three SVGs in `public/`, so swapping artwork never touches code:

```
neuroid-mark.svg        the mark alone — rail, favicon
neuroid-logo-light.svg  full lockup, dark wordmark, for light grounds
neuroid-logo-dark.svg   full lockup, light wordmark, for dark grounds
```

---

## 2 · `src/app/globals.css` — copy verbatim

This is the entire design system. Everything else in this document is built
from it.

```css
@import "tailwindcss";

/* The display face. Headline moments only — a sign-in hero, a big empty
   state — never UI labels, where an italic serif wrecks scanning. */
@font-face {
  font-family: "PP Editorial New";
  src: url("/fonts/PPEditorialNew-Italic.otf") format("opentype");
  font-weight: 200 400;
  font-style: italic;
  font-display: swap;
}

/* ---------------------------------------------------------------------------
   Design tokens.

   Light is the default: this is a tool people scan all day beside a browser
   full of white tabs. Dark is a deliberate second set of steps, not an
   inverted filter — note that the accent flips, because the brand yellow can
   carry interaction on dark and cannot on white.
--------------------------------------------------------------------------- */
@theme {
  --font-sans: var(--font-dm-sans), ui-sans-serif, system-ui, -apple-system,
    "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-display: "PP Editorial New", Georgia, "Times New Roman", serif;
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;

  --color-canvas: #f6f7fb;      /* the page behind everything */
  --color-surface: #ffffff;      /* cards, headers, inputs */
  --color-surface-2: #f7f8fa;    /* hover, insets, quiet blocks */
  --color-surface-3: #eceef3;    /* pressed, selected, skeletons */
  --color-line: #e4e7ee;         /* every ordinary border */
  --color-line-strong: #cfd4de;  /* input borders, things you can grab */

  --color-ink: #14181f;          /* primary text */
  --color-ink-2: #4d5563;        /* secondary text, labels */
  --color-ink-3: #8892a2;        /* hints, metadata, placeholders */

  /* Brand. Yellow is a SURFACE, never a text colour on white. */
  --color-brand: #fcef24;
  --color-brand-hover: #f2e400;
  --color-brand-ink: #111111;

  /* Interactive ink stays near-black — the only thing that reads cleanly as
     a link on a light ground. */
  --color-accent: #111111;
  --color-accent-hover: #000000;
  --color-accent-ink: #ffffff;
  --color-accent-soft: #fdf9c9;  /* focus ring */

  /* Status — fixed roles, never reused as a series colour. */
  --color-good: #2f9e44;
  --color-warning: #f0a202;
  --color-serious: #e8590c;
  --color-critical: #d03b3b;

  /* Categorical chart slots. CVD-validated order; assign by fixed slot,
     never cycle, so a category keeps one colour everywhere. */
  --color-series-1: #2a78d6;
  --color-series-2: #eb6834;
  --color-series-3: #1baf7a;
  --color-series-4: #eda100;
  --color-series-5: #e87ba4;
  --color-series-6: #008300;

  --color-grid: #e1e0d9;
  --color-axis: #c3c2b7;

  --radius-xs: 4px;   /* chips, swatches */
  --radius-sm: 6px;   /* small controls */
  --radius-md: 8px;   /* buttons, inputs */
  --radius-lg: 12px;  /* cards, dialogs */
  --radius-xl: 18px;

  --shadow-pop: 0 1px 3px rgb(16 24 40 / 0.1), 0 12px 32px -8px rgb(16 24 40 / 0.18);
  --shadow-drag: 0 18px 40px -12px rgb(16 24 40 / 0.28);

  --ease-out-quick: cubic-bezier(0.22, 1, 0.36, 1);
}

:root[data-theme="dark"] {
  --color-canvas: #0b0c0e;
  --color-surface: #131519;
  --color-surface-2: #191c21;
  --color-surface-3: #21252c;
  --color-line: #262b33;
  --color-line-strong: #333a45;

  --color-ink: #f2f4f7;
  --color-ink-2: #a5adba;
  --color-ink-3: #6f7885;

  --color-brand: #fcef24;
  --color-brand-hover: #ffff5a;
  --color-brand-ink: #111111;

  /* On dark the brand yellow can carry interaction directly. */
  --color-accent: #fcef24;
  --color-accent-hover: #ffff5a;
  --color-accent-ink: #111111;
  --color-accent-soft: #2b2708;

  --color-series-1: #3987e5;
  --color-series-2: #d95926;
  --color-series-3: #199e70;
  --color-series-4: #c98500;
  --color-series-5: #d55181;
  --color-series-6: #008300;

  --color-grid: #2c2c2a;
  --color-axis: #383835;

  --shadow-pop: 0 1px 2px rgb(0 0 0 / 0.4), 0 12px 32px -8px rgb(0 0 0 / 0.55);
  --shadow-drag: 0 18px 40px -12px rgb(0 0 0 / 0.7);
}

/* ------------------------------------------------------------------ base */

* { border-color: var(--color-line); }

html {
  color-scheme: light;
  background: var(--color-canvas);
}
:root[data-theme="dark"] { color-scheme: dark; }

body {
  background: var(--color-canvas);
  color: var(--color-ink);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  overscroll-behavior: none;
  /* DM Sans sets wide by default; pulling it in keeps dense views dense. */
  letter-spacing: -0.006em;
}

h1, h2, h3 { letter-spacing: -0.02em; }

/* Numbers line up in every table and clock without opting in each time. */
.tabular, table, input[type="number"] { font-variant-numeric: tabular-nums; }

/* Scrollbars that don't shove the layout around mid-drag. */
* {
  scrollbar-width: thin;
  scrollbar-color: var(--color-line-strong) transparent;
}
*::-webkit-scrollbar { width: 10px; height: 10px; }
*::-webkit-scrollbar-thumb {
  background: var(--color-line-strong);
  border-radius: 999px;
  border: 3px solid transparent;
  background-clip: content-box;
}
*::-webkit-scrollbar-thumb:hover {
  background: var(--color-ink-3);
  background-clip: content-box;
}

::selection {
  background: var(--color-accent);
  color: var(--color-accent-ink);
}

:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
  border-radius: var(--radius-xs);
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}

/* -------------------------------------------------------------- utilities */

@utility tabular { font-variant-numeric: tabular-nums; }

@keyframes ui-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
@utility skeleton {
  background: var(--color-surface-3);
  border-radius: var(--radius-sm);
  animation: ui-pulse 1.4s var(--ease-out-quick) infinite;
}

@keyframes ui-rise {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
}
@utility rise { animation: ui-rise 0.18s var(--ease-out-quick) both; }

@keyframes ui-breathe {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(0.82); }
}
/* A live/running indicator. Use sparingly — one per screen at most. */
@utility breathe { animation: ui-breathe 2.2s ease-in-out infinite; }

@utility display {
  font-family: var(--font-display);
  font-style: italic;
  font-weight: 300;
  letter-spacing: -0.015em;
}

/* Swap light/dark logo lockups without a client-side theme check. */
:root[data-theme="dark"] .dark-hidden { display: none; }
:root[data-theme="dark"] .dark-shown  { display: block; }
```

---

## 3 · `src/app/layout.tsx` — the root

Two things here are load-bearing: the font is self-hosted at build time (no
render-blocking request, no layout shift), and the theme resolves **before**
first paint so nobody eats a white flash on a dark setup.

```tsx
import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Your App", template: "%s · Your App" },
  description: "…",
};

const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm-sans",
  weight: ["400", "500", "600", "700"], // only what the UI uses
});

export const viewport: Viewport = {
  themeColor: "#f6f7fb",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={dmSans.variable} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('app-theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "var(--color-surface-2)",
              border: "1px solid var(--color-line)",
              color: "var(--color-ink)",
            },
          }}
        />
      </body>
    </html>
  );
}
```

The matching toggle, anywhere in the shell:

```tsx
function toggleTheme() {
  setTheme((value) => {
    const next = value === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("app-theme", next);
    return next;
  });
}
```

---

## 4 · The primitives

Everything below goes in two files. **Build every screen out of these.** If a
screen needs something new, add it here so it exists once.

### `src/components/ui/form.tsx`

```tsx
"use client";

import { Loader2 } from "lucide-react";

const inputBase =
  "w-full rounded-[var(--radius-md)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-2 text-[13.5px] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--color-ink-3)] focus:border-[var(--color-accent)] focus:shadow-[0_0_0_3px_var(--color-accent-soft)] disabled:opacity-60";

export function Field({
  label, hint, htmlFor, children, className = "",
}: {
  label: string; hint?: string; htmlFor?: string;
  children: React.ReactNode; className?: string;
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
        // Inline caret — no extra network request for an icon.
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
  variant = "secondary", size = "md", loading,
  children, className = "", disabled, ...rest
}: ButtonProps) {
  const variants: Record<string, string> = {
    // Black on brand yellow: 17.5:1. Yellow text on white is 1.2:1 and would
    // be invisible, so the brand colour only ever appears as a surface.
    primary:
      "bg-[var(--color-brand)] text-[var(--color-brand-ink)] hover:bg-[var(--color-brand-hover)] border border-transparent shadow-[0_1px_2px_rgb(16_24_40/0.10)] font-semibold",
    secondary:
      "bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)] shadow-[0_1px_2px_rgb(16_24_40/0.04)]",
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
```

**One primary button per screen region.** If two things are yellow, neither is
the answer.

### `src/components/ui/dialog.tsx`

Native `<dialog>`, so the browser handles focus trapping, Esc and the top
layer — less code and better behaviour than a hand-rolled modal.

```tsx
"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export function Dialog({
  open, onClose, title, description, children, width = 520,
}: {
  open: boolean; onClose: () => void; title: string;
  description?: string; children: React.ReactNode; width?: number;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        // Clicking the backdrop lands on the dialog element itself.
        if (event.target === ref.current) onClose();
      }}
      aria-labelledby="dialog-title"
      className="rise m-auto w-[calc(100vw-2rem)] rounded-[var(--radius-lg)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] p-0 text-[var(--color-ink)] shadow-[var(--shadow-pop)] backdrop:bg-black/55 backdrop:backdrop-blur-[2px]"
      style={{ maxWidth: width }}
    >
      <div className="flex items-start gap-4 border-b border-[var(--color-line)] px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 id="dialog-title" className="text-[15px] font-semibold tracking-tight">{title}</h2>
          {description && (
            <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">{description}</p>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-ink)]"
        >
          <X size={15} />
        </button>
      </div>
      <div className="px-5 py-4">{children}</div>
    </dialog>
  );
}

export function DialogFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-5 -mb-4 mt-5 flex items-center justify-end gap-2 border-t border-[var(--color-line)] px-5 py-3.5">
      {children}
    </div>
  );
}
```

> **Gotcha, learned the hard way:** `showModal()` puts a dialog in the browser's
> **top layer**, above every `z-index` there is. Anything that must sit over a
> dialog (a product tour, a spotlight overlay) must be a modal dialog too — a
> `popover` will *not* win in Chromium, whichever was promoted last.

### `src/components/ui/primitives.tsx`

```tsx
/* ---------------------------------------------------------------- Layout */

export function PageHeader({
  title, subtitle, children,
}: {
  title: string; subtitle?: string; children?: React.ReactNode;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-[var(--color-line)] bg-[var(--color-surface)] px-5 print:hidden">
      <div className="min-w-0">
        <h1 className="truncate text-[15.5px] font-semibold">{title}</h1>
        {subtitle && (
          <p className="truncate text-[11.5px] leading-tight text-[var(--color-ink-3)]">{subtitle}</p>
        )}
      </div>
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </header>
  );
}

export function Card({
  children, className = "", padded = true,
}: {
  children: React.ReactNode; className?: string; padded?: boolean;
}) {
  return (
    <section
      className={`rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] ${
        padded ? "p-4" : ""
      } ${className}`}
    >
      {children}
    </section>
  );
}

export function EmptyState({
  icon, title, hint, action,
}: {
  icon?: React.ReactNode; title: string; hint?: string; action?: React.ReactNode;
}) {
  return (
    <div className="grid place-items-center px-6 py-14 text-center">
      {icon && <div className="mb-3 text-[var(--color-ink-3)]">{icon}</div>}
      <p className="text-[14px] font-medium">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-[12.5px] leading-relaxed text-[var(--color-ink-3)]">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- People */

/** Deterministic tint so a person keeps one colour everywhere in the app. */
export function avatarTint(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const slots = [
    "var(--color-series-1)", "var(--color-series-2)", "var(--color-series-3)",
    "var(--color-series-5)", "var(--color-series-6)",
  ];
  return slots[hash % slots.length];
}

export function initials(name: string, email?: string): string {
  const source = name?.trim() || email?.split("@")[0] || "?";
  const parts = source.replace(/[^\p{L}\s.]/gu, " ").split(/[\s.]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  id, name, email, size = 24, title, src,
}: {
  id: string; name: string; email?: string;
  size?: number; title?: string; src?: string | null;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src} alt="" title={title ?? name ?? email}
        width={size} height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      title={title ?? name ?? email}
      className="grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{
        background: avatarTint(id),
        width: size, height: size,
        fontSize: Math.max(9, Math.round(size * 0.4)),
      }}
    >
      {initials(name, email)}
    </span>
  );
}

export function AvatarStack({
  people, max = 4, size = 22,
}: {
  people: { id: string; full_name: string; email?: string }[];
  max?: number; size?: number;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((person, index) => (
        <span
          key={person.id}
          style={{ marginLeft: index === 0 ? 0 : -6, zIndex: shown.length - index }}
          className="rounded-full ring-2 ring-[var(--color-surface)]"
        >
          <Avatar id={person.id} name={person.full_name} email={person.email} size={size} />
        </span>
      ))}
      {rest > 0 && (
        <span
          className="ml-[-6px] grid place-items-center rounded-full bg-[var(--color-surface-3)] text-[10px] font-medium text-[var(--color-ink-2)] ring-2 ring-[var(--color-surface)]"
          style={{ width: size, height: size }}
        >
          +{rest}
        </span>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- Chips */

/**
 * A tinted chip. `tone` is any token — a series colour for a category, a
 * status colour for a state. 16% of the tone as a background against the
 * tone as text is the ratio that stays legible in both themes.
 */
export function Chip({
  tone, children, size = "sm", title,
}: {
  tone: string; children: React.ReactNode; size?: "sm" | "md"; title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-xs)] font-medium ${
        size === "sm" ? "px-1.5 py-0.5 text-[10.5px]" : "px-2 py-1 text-[12px]"
      }`}
      style={{ background: `color-mix(in srgb, ${tone} 16%, transparent)`, color: tone }}
    >
      {children}
    </span>
  );
}

/** A solid pill for the one state that should shout. Live = breathing dot. */
export function Pill({
  fill, children, live, size = "sm", title,
}: {
  fill: string; children: React.ReactNode; live?: boolean;
  size?: "sm" | "md"; title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold text-white ${
        size === "sm" ? "px-2.5 py-[3px] text-[11px]" : "px-3 py-1 text-[12.5px]"
      }`}
      style={{ background: fill }}
    >
      {live && <span className="breathe h-1.5 w-1.5 rounded-full bg-white/90" aria-hidden />}
      {children}
    </span>
  );
}

/* ----------------------------------------------------------------- Stats */

/**
 * A headline number. `deltaGood` says which direction is the good one —
 * for minutes-per-unit, down is up.
 */
export function StatTile({
  label, value, unit, delta, deltaGood, hint, accent, swatch,
}: {
  label: string; value: string | number; unit?: string;
  delta?: number | null; deltaGood?: "up" | "down";
  hint?: string; accent?: string; swatch?: string;
}) {
  const showDelta = delta != null && Number.isFinite(delta) && delta !== 0;
  const positive = showDelta && (deltaGood === "down" ? delta! < 0 : delta! > 0);

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.07em] text-[var(--color-ink-3)]">
        {swatch && (
          <span aria-hidden className="h-[7px] w-[12px] shrink-0 rounded-full" style={{ background: swatch }} />
        )}
        {label}
      </p>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span
          className="text-[26px] font-semibold leading-none tracking-tight"
          style={accent ? { color: accent } : undefined}
        >
          {value}
        </span>
        {unit && <span className="text-[12px] text-[var(--color-ink-3)]">{unit}</span>}
      </p>
      {showDelta && (
        <p className="tabular mt-2 text-[11.5px] font-medium"
           style={{ color: positive ? "var(--color-good)" : "var(--color-serious)" }}>
          {delta! > 0 ? "▲" : "▼"} {Math.abs(delta!)}% vs previous
        </p>
      )}
      {hint && !showDelta && <p className="mt-2 text-[11.5px] text-[var(--color-ink-3)]">{hint}</p>}
    </div>
  );
}
```

---

## 5 · The app shell

A fixed-height frame with exactly one scrolling pane. This is what stops the
page bouncing when a table grows, and it's why the header can stay put.

```tsx
<div className="flex h-dvh overflow-hidden">
  <Sidebar />                                    {/* w-[224px], w-[60px] collapsed */}
  <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
    {/* strips that push content down rather than covering it */}
    <ConnectionStatus />
    <PageHeader title="…" subtitle="…">{/* actions */}</PageHeader>
    <div className="min-h-0 flex-1 overflow-y-auto p-5">
      <div className="mx-auto max-w-[980px] space-y-4">{children}</div>
    </div>
  </main>
</div>
```

Sidebar anatomy, top to bottom: logo lockup (`h-14`, matching the header) →
nav list (`px-2.5`, items `rounded-md px-2.5 py-2 text-[13px]`, active item gets
`bg-surface-3 font-semibold` plus a 4px brand bar pinned left) → a `mt-auto`
footer with the user chip, then a row of icon buttons.

**Banners go above the header, never over it.** An alert that hides the thing
it's about is worse than no alert.

---

## 6 · The sign-in page

Split screen: a black panel that sells the tool, a white panel that gets out of
the way. The black side is `hidden lg:flex` — on a phone you get the form and a
small lockup, because nobody reads a value proposition on the way to a login.

```tsx
export default function LoginPage() {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-[#111111] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        {/* Two blurred brand-yellow orbs. The entire "designed" feeling of
            this page is these two divs — cheap, and they never load. */}
        <div aria-hidden
          className="pointer-events-none absolute -right-32 -top-32 h-[30rem] w-[30rem] rounded-full opacity-[0.18] blur-3xl"
          style={{ background: "var(--color-brand)" }} />
        <div aria-hidden
          className="pointer-events-none absolute -bottom-40 -left-24 h-[26rem] w-[26rem] rounded-full opacity-[0.10] blur-3xl"
          style={{ background: "var(--color-brand)" }} />

        <div className="relative"><Logo size={32} tone="dark" /></div>

        <div className="relative max-w-lg">
          <p className="text-[12px] font-medium uppercase tracking-[0.2em]"
             style={{ color: "var(--color-brand)" }}>
            Your Product Name
          </p>

          {/* The display face earns its keep exactly here. */}
          <h1 className="display mt-5 text-[2.7rem] leading-[1.08] text-white">
            One sentence about the problem, in the reader&apos;s words.
          </h1>

          <p className="mt-6 text-[15px] leading-relaxed text-white/70">
            Two sentences on what changes for them. Not features.
          </p>

          <ul className="mt-10 space-y-3.5">
            {[
              ["A promise", "The detail that makes it credible."],
              ["Another promise", "Ditto."],
              ["A third", "Three is the right number."],
            ].map(([title, detail]) => (
              <li key={title} className="flex gap-3">
                <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: "var(--color-brand)" }} />
                <span>
                  <span className="block text-[14px] font-medium text-white">{title}</span>
                  <span className="block text-[13px] leading-relaxed text-white/55">{detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative max-w-md text-[12.5px] leading-relaxed text-white/40">
          A closing line that says what the tool is for.
        </p>
      </section>

      <section className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-[22rem]">
          <div className="mb-10 lg:hidden"><Logo size={30} tone="light" /></div>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
```

**The copy rule that matters most.** An early draft of this page led with
*"every minute tracked"* — technically true, and it reads as surveillance. It
put the people who'd use it on the defensive before they'd signed in. Write the
hero as **what the reader stops having to do**, never as what the system
measures about them. Text at `white/70` for body, `white/55` for detail,
`white/40` for the footnote — the ladder is what keeps a dark panel from
looking flat.

---

## 7 · The rules

The tokens make it consistent. These make it *good*. Hand them to your agent
along with the code.

### Colour

1. **Yellow is a surface, never text.** Black on `--color-brand` is 17.5:1.
   Yellow text on white is 1.2:1 — invisible. Primary buttons and highlight
   blocks only.
2. **Status colours have fixed jobs** — good / warning / serious / critical.
   Never borrow one for a category.
3. **Series colours are assigned by slot, never cycled.** A category keeps the
   same colour on every screen or the colour means nothing.
4. **Never hard-code a hex outside `globals.css`.** For a tint, use
   `color-mix(in srgb, var(--token) 16%, transparent)`. That one habit is what
   makes dark mode work for free.
5. **Three ink levels, and they mean things.** `ink` = what you read,
   `ink-2` = labels and secondary, `ink-3` = metadata you skim past.

### Type

6. **One size scale, in px, at these steps:** `26` stat figures · `15.5` page
   title · `14` card title · `13.5` inputs · `13`/`12.5` body and buttons ·
   `12` labels · `11.5` hints · `10.5` chips.
7. **The display face is for headline moments only** — a hero, a big empty
   state. Never a UI label; an italic serif destroys scanning.
8. **`.tabular` on anything that lines up** — tables, clocks, counts. It's
   already global on `table` and `input[type=number]`.
9. **Uppercase + `tracking-[0.14em]` and up** is the section-label voice. Small,
   `ink-3`, sparing.

### Layout

10. **One scroll container per screen.** The shell is `h-dvh overflow-hidden`;
    exactly one child gets `min-h-0 flex-1 overflow-y-auto`.
11. **`min-w-0` on every flex child holding text**, or `truncate` silently
    stops working. This is the single most common bug in this kind of UI.
12. **Borders over shadows.** Shadows are for things that genuinely float —
    dialogs, drags, popovers. Cards get a border.
13. **Radii by size:** `xs` chips · `sm` small controls · `md` buttons and
    inputs · `lg` cards and dialogs. Don't freestyle.
14. **Wide content scrolls inside its own container**, never the page body.

### Behaviour

15. **Optimistic writes.** Patch the cache first, reconcile after. It's the
    difference between "instant" and "form submit".
16. **Every empty state does a job**: what this is, why it's empty, and the
    button that fixes it.
17. **Skeletons, not spinners**, for content that's arriving — `.skeleton` at
    roughly the height of the thing.
18. **Say when a save failed, and offer the retry.** A silent autosave is only
    trustworthy if it tells you when it isn't working.
19. **`.breathe` means live** — one thing per screen, at most.
20. **Never render a confident wrong number.** If a value can't be computed,
    show "—" and count the unknowns separately. A designer shown as free when
    they're booked is worse than a designer shown as unknown.

### Voice

21. **Labels are the words the team uses**, not the words the database uses.
22. **Hints say the consequence, not the mechanic.** "Their hours come out of
    the workload grid" beats "sets availability=false".
23. **Sentence case everywhere.** Title Case On Buttons Reads As A Brochure.

---

## 8 · Checklist for a new screen

- [ ] Built only from §4 primitives — no new button, card or input
- [ ] No hex outside `globals.css`
- [ ] Checked in **both** themes (toggle `data-theme="dark"` on `<html>`)
- [ ] Checked at 1280px and 390px
- [ ] `min-w-0` on flex children that truncate
- [ ] Empty state written, and it offers the action
- [ ] Loading state is a skeleton at the right height
- [ ] Failure state says what failed and how to retry
- [ ] Every icon from lucide, at 13/14/16px
- [ ] One primary button in view

---

## 9 · Known-good extras

Worth stealing when the new tool needs them.

**Print** — take the app chrome out and let the document be the page:

```css
@media print {
  html, body { height: auto; background: #fff; }
  .h-dvh, .overflow-hidden, .overflow-y-auto, .min-h-0 {
    height: auto !important; max-height: none !important; overflow: visible !important;
  }
  nav { display: none !important; }
  /* Chrome drops backgrounds to save ink — this keeps brand colour on paper. */
  .sheet, .sheet * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
@page { size: A4; margin: 0; }  /* margin:0 only if something must bleed */
```

For a repeating header/footer on multi-page print, use a `<table>` with
`<thead>`/`<tfoot>` — it's the only structure Chrome both repeats on every page
*and* reserves the space for. `position: fixed` repeats but reserves nothing.

**Email** — inline styles only (Gmail strips `<style>`), tables for layout, no
webfonts, and never depend on an image: most clients block them until asked, so
a masthead built from type beats one that renders as a broken-picture icon.

**Hydration** — anything time-dependent must render a zero clock until mounted:

```tsx
const [live, setLive] = useState(false);
useEffect(() => setLive(true), []);
const state = compute(data, live ? Date.now() : 0);
```

---

*Neuroid UI Kit — extracted from Neuroid Creative Studio. Tokens and components
are yours to reuse; the PP Editorial New font file and the Neuroid logo artwork
are licensed separately and are not part of this kit.*
