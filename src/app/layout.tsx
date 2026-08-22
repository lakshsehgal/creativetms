import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import { Toaster } from "sonner";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Creative TMS", template: "%s · Creative TMS" },
  description: "Creative ticketing and productivity tracking for post-production teams.",
};

/**
 * Self-hosted at build time by next/font, so there's no render-blocking
 * request to Google and no layout shift when the face swaps in.
 */
const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm-sans",
  // Only the weights the UI actually uses.
  weight: ["400", "500", "600", "700"],
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
        {/* Resolve the theme before first paint so nobody eats a white flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('ctms-theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
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
