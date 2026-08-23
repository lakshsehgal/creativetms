import type { MetadataRoute } from "next";

/**
 * The web app manifest — mostly here for what it does to notifications.
 *
 * A desktop notification from an ordinary website is captioned with the
 * origin, so every handoff arrived under "creativetms.vercel.app". There is no
 * API to change that: the browser puts it there, deliberately, so people can
 * see who is notifying them. The one thing that does change it is installing
 * the app, at which point the caption becomes this `name` instead.
 *
 * Installing also gets it its own window and a dock icon, which for a tool
 * people keep open all day is worth having on its own.
 *
 * The other half of the fix is a real domain. An installed app shows this
 * name; a browser tab will always show wherever it's actually served from.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Neuroid Creative Studio",
    // The label under the icon on a home screen or dock, where the full name
    // would be truncated to something unrecognisable.
    short_name: "Neuroid Studio",
    description:
      "Briefs, rounds and delivery for the Neuroid creative studio — one place for every brand and every round.",
    start_url: "/tickets",
    scope: "/",
    display: "standalone",
    background_color: "#f6f7fb",
    // The title bar of the installed window. Black, like the mark sits on.
    theme_color: "#111111",
    orientation: "portrait-primary",
    categories: ["productivity", "business"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Cropped to a circle on Android, so the mark is inset to survive it.
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
