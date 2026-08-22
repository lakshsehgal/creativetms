/**
 * The Neuroid mark.
 *
 * The artwork lives in /public/neuroid-mark.svg — replacing that one file
 * swaps the logo everywhere, no code change. The wordmark is set in the UI
 * face using currentColor, so it inverts correctly on dark grounds without a
 * second asset.
 */
export function Logo({
  size = 28,
  showWord = true,
  word = "Neuroid",
}: {
  size?: number;
  showWord?: boolean;
  word?: string;
}) {
  return (
    <span className="flex items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/neuroid-mark.svg"
        alt="Neuroid"
        width={size}
        height={size}
        className="shrink-0"
        style={{ width: size, height: size }}
      />
      {showWord && (
        <span
          className="truncate font-semibold tracking-[-0.02em]"
          style={{ fontSize: size * 0.58 }}
        >
          {word}
        </span>
      )}
    </span>
  );
}
