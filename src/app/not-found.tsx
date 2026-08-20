import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="text-center">
        <p className="text-[12px] font-medium uppercase tracking-[0.09em] text-[var(--color-ink-3)]">
          404
        </p>
        <h1 className="mt-2 text-[20px] font-semibold tracking-tight">Nothing here</h1>
        <p className="mt-2 max-w-xs text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
          This ticket either doesn&apos;t exist or isn&apos;t one you have access to.
        </p>
        <Link
          href="/board"
          className="mt-5 inline-block rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)]"
        >
          Back to the board
        </Link>
      </div>
    </main>
  );
}
