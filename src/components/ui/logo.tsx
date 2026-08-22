/**
 * The Neuroid lockup.
 *
 * Three files in /public do all the work, so swapping the artwork never
 * touches code:
 *
 *   neuroid-mark.svg        the N cube alone — sidebar rail, favicon
 *   neuroid-logo-light.svg  full lockup, black wordmark, for light grounds
 *   neuroid-logo-dark.svg   full lockup, white wordmark, for dark grounds
 *
 * `tone` picks which lockup to use: "auto" follows the app theme, and the two
 * explicit values are for surfaces that are always one or the other — the
 * login panel is black regardless of theme, for instance.
 */
export function Logo({
  size = 28,
  showWord = true,
  tone = "auto",
}: {
  size?: number;
  showWord?: boolean;
  tone?: "auto" | "light" | "dark";
}) {
  if (!showWord) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/neuroid-mark.svg"
        alt="Neuroid"
        width={size}
        height={size}
        className="shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }

  const height = Math.round(size * 0.86);

  if (tone === "auto") {
    // Both are rendered and CSS shows the right one, so there's no flash
    // while a theme preference resolves on the client.
    return (
      <span className="flex items-center" style={{ height }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/neuroid-logo-light.svg"
          alt="Neuroid"
          className="block h-full w-auto dark-hidden"
          style={{ height }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/neuroid-logo-dark.svg"
          alt=""
          aria-hidden
          className="hidden h-full w-auto dark-shown"
          style={{ height }}
        />
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={tone === "dark" ? "/neuroid-logo-dark.svg" : "/neuroid-logo-light.svg"}
      alt="Neuroid"
      className="block w-auto"
      style={{ height }}
    />
  );
}
