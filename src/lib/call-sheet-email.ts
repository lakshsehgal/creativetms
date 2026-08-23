import type { Shoot, ShootScript } from "@/lib/types";
import { crewCount, mealsSelected } from "@/lib/shoot";

/**
 * The call sheet, as an email.
 *
 * A crew member standing at a gate at 6am is not going to open an app. So the
 * whole sheet goes in the body — locations, scripts, who's on it, what time
 * they're wanted, whether lunch is coming — rather than a summary and a link
 * to something half of them can't sign into.
 *
 * Inline styles throughout: Gmail drops <style> blocks and Outlook renders
 * through Word, so a stylesheet arrives as unstyled text for a good share of
 * any crew. And no webfonts — the display face can't load in an inbox, so the
 * title is set in the best serif each client actually has. The brand carries
 * on the colour, the mark and the voice instead of the typeface.
 */

const INK = "#0c0c0c";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";
const BRAND = "#feef24";
const GREY = "#333333";
const RED = "#ff2600";

const SANS =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',Times,serif";
/* The letterhead's address and footer voice. No webfonts in email, so this is
   the nearest thing every client already has. */
const MONO = "Menlo,Consolas,'Courier New',monospace";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function section(title: string, body: string): string {
  if (!body) return "";
  return `
    <tr><td style="padding:18px 24px 0">
      <div style="font:600 9.5px ${SANS};letter-spacing:0.18em;text-transform:uppercase;color:${MUTED};border-bottom:1px solid ${LINE};padding-bottom:6px">${esc(title)}</div>
      <div style="font:13px/1.6 ${SANS};color:${INK};padding-top:8px">${body}</div>
    </td></tr>`;
}

function link(url: string, label: string): string {
  if (!url) return "";
  return ` <a href="${esc(url)}" style="color:${INK}">${esc(label)}</a>`;
}

/** The date line — the thing people scan for first. */
export function callSheetWhen(shoot: Shoot): string {
  const parts: string[] = [];
  if (shoot.shoot_date) {
    parts.push(
      new Date(`${shoot.shoot_date}T00:00:00`).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    );
  }
  if (shoot.doc.callTime) parts.push(`call ${shoot.doc.callTime}`);
  parts.push(`${shoot.doc.days} ${shoot.doc.days === 1 ? "day" : "days"}`);
  return parts.join("  ·  ");
}

export function buildCallSheetEmail(shoot: Shoot, sentBy: string): string {
  const doc = shoot.doc;

  const locations = doc.locations
    .map(
      (place) =>
        `<div style="margin-bottom:8px"><b>${esc(place.name || "Location")}</b>${
          place.address ? `<br/><span style="color:${MUTED}">${esc(place.address)}</span>` : ""
        }${link(place.mapUrl, "Open in Maps")}</div>`,
    )
    .join("");

  const byDay = new Map<number, ShootScript[]>();
  for (const script of doc.scripts) {
    const list = byDay.get(script.day) ?? [];
    list.push(script);
    byDay.set(script.day, list);
  }
  const scripts = [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(
      ([day, list]) => `
        <div style="margin-bottom:10px">
          <div style="font:600 9.5px ${SANS};letter-spacing:0.16em;text-transform:uppercase;color:${MUTED};margin-bottom:3px">Day ${day}</div>
          ${list
            .map(
              (script) =>
                `<div><b>${esc(script.name || "Script")}</b><span style="color:${MUTED}">${
                  script.versions ? ` · ${esc(script.versions)}` : ""
                }${script.hours ? ` · ${esc(script.hours)}h` : ""}</span>${link(script.link, "open")}</div>`,
            )
            .join("")}
        </div>`,
    )
    .join("");

  const crew = doc.crew
    .filter((group) => group.members.some((member) => member.name.trim()))
    .map(
      (group) => `
        <tr>
          <td style="padding:3px 12px 3px 0;color:${MUTED};vertical-align:top;width:34%">${esc(group.role)}</td>
          <td style="padding:3px 0;vertical-align:top">${group.members
            .filter((member) => member.name.trim())
            .map(
              (member) =>
                `${esc(member.name)}${member.reportingTime ? ` <span style="color:${MUTED}">(${esc(member.reportingTime)})</span>` : ""}`,
            )
            .join(", ")}</td>
        </tr>`,
    )
    .join("");

  const actors = doc.actors
    .map(
      (actor) => `
        <tr>
          <td style="padding:3px 12px 3px 0;vertical-align:top;width:34%"><b>${esc(actor.name || "Actor")}</b>${
            actor.age ? `<span style="color:${MUTED}"> · ${esc(actor.age)}</span>` : ""
          }</td>
          <td style="padding:3px 0;color:${MUTED};vertical-align:top">${
            actor.timeIn || actor.timeOut
              ? `${esc(actor.timeIn || "?")}–${esc(actor.timeOut || "?")}`
              : ""
          }${actor.requirement ? `${actor.timeIn || actor.timeOut ? " · " : ""}${esc(actor.requirement)}` : ""}</td>
        </tr>`,
    )
    .join("");

  const mealList = (["breakfast", "lunch", "dinner", "snacks"] as const)
    .filter((meal) => doc.meals[meal])
    .map((meal) => meal[0].toUpperCase() + meal.slice(1))
    .join(" · ");

  const table = (rows: string) =>
    rows ? `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="font:13px/1.6 ${SANS}">${rows}</table>` : "";

  return `<div style="margin:0;padding:24px 12px;background:#f6f7fb;font-family:${SANS}">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid ${LINE};border-radius:12px;overflow:hidden">

    <!-- The letterhead: the yellow band across the head, the wordmark and the
         address, and the heavy rule under both. The logo is set as type rather
         than fetched as an image on purpose — most clients block remote images
         until you ask them not to, and a call sheet whose masthead is a broken
         picture icon is worse than one set in bold. -->
    <tr><td style="height:8px;background:${BRAND};font-size:0;line-height:0">&nbsp;</td></tr>

    <tr><td style="padding:18px 24px 0">
      <table cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td style="vertical-align:top;font:700 21px/1 ${SANS};letter-spacing:-0.02em;color:${INK}">Neuroid</td>
          <td style="vertical-align:top;text-align:right;font:10px/1.7 ${MONO};color:${GREY}">
            <span style="font-weight:700;letter-spacing:0.3em;color:${INK}">NEUROID</span><br>
            3rd Floor, 315/274, Westend Marg<br>
            Saiyad Ul Ajaib Extension, Butterfly Park,<br>
            Saket, New Delhi, Delhi 110030
          </td>
        </tr>
      </table>
    </td></tr>

    <tr><td style="padding:16px 24px 0">
      <div style="height:2px;background:${INK};font-size:0;line-height:0">&nbsp;</div>
    </td></tr>

    <tr><td style="padding:18px 24px 0">
      <div style="font:10px ${MONO};letter-spacing:0.2em;text-transform:uppercase;color:${GREY}">Call sheet${
        shoot.brand ? ` · ${esc(shoot.brand)}` : ""
      }</div>
      <div style="font:italic 300 27px/1.1 ${SERIF};color:${INK};margin-top:8px">${esc(shoot.title || "Untitled shoot")}</div>
      <div style="font:10.5px ${MONO};color:${GREY};margin-top:8px">${esc(callSheetWhen(shoot))}</div>
    </td></tr>

    ${section("Locations", locations)}
    ${section("Scripts", scripts)}
    ${section("Crew", table(crew))}
    ${section("Actors", table(actors))}
    ${section(
      "Meals",
      mealsSelected(doc.meals) === 0
        ? ""
        : `${esc(mealList)}${doc.meals.notes ? `<div style="color:${MUTED}">${esc(doc.meals.notes)}</div>` : ""}`,
    )}

    <tr><td style="padding:20px 24px 22px">
      <div style="border-top:1px solid ${LINE};padding-top:12px;font:11.5px/1.6 ${SANS};color:${MUTED}">
        Sent by ${esc(sentBy)} · ${crewCount(doc.crew)} on the crew.
        Reply to this email if anything here is wrong — better now than at the gate.
      </div>
    </td></tr>

    <!-- And the foot of the letterhead: the rule, the tagline in its yellow
         block with the red full stop, and the credit line. -->
    <tr><td style="padding:0 24px">
      <div style="height:2px;background:${INK};font-size:0;line-height:0">&nbsp;</div>
    </td></tr>

    <tr><td style="padding:14px 24px 20px">
      <table cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <!-- The yellow is the cell's background rather than the text's, so a
               narrow phone that wraps the line still gets one solid block
               instead of two ragged highlighter strokes. -->
          <td width="1%" style="background:${BRAND};padding:4px 8px;white-space:nowrap;font:italic 300 15px/1.25 ${SERIF};color:${INK}">
            Rebuilding neural pathways<span style="color:${RED}">.</span>
          </td>
          <td style="vertical-align:middle;text-align:right;font:8.5px ${MONO};letter-spacing:0.1em;text-transform:uppercase;color:${GREY};white-space:nowrap">
            www.neuroidmedia.com
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</div>`;
}
