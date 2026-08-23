import type { DailyScorecard, FormatBenchmark } from "@/lib/types";
import { FORMAT_ORDER, FORMATS } from "@/lib/types";

type CardWithDesigner = DailyScorecard & {
  designer?: { full_name: string; email: string } | null;
};

function minutes(seconds: number): string {
  if (!seconds) return "—";
  const total = Math.round(seconds / 60);
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return hours ? `${hours}h ${rest}m` : `${rest}m`;
}

/**
 * The daily digest for admins and operators.
 *
 * Deliberately plain HTML with inline styles — email clients strip everything
 * else, and a table that renders identically in Gmail and Outlook is worth
 * more here than anything clever.
 */
export function buildScorecardEmail({
  day,
  cards,
  benchmarks,
}: {
  day: string;
  cards: CardWithDesigner[];
  benchmarks: FormatBenchmark[];
}): string {
  const rows = [...cards].sort((a, b) => b.active_seconds - a.active_seconds);

  const totals = rows.reduce(
    (acc, card) => ({
      seconds: acc.seconds + card.active_seconds,
      units: acc.units + card.units_completed,
      tickets: acc.tickets + card.tickets_completed,
      firstPass: acc.firstPass + card.first_pass_count,
    }),
    { seconds: 0, units: 0, tickets: 0, firstPass: 0 },
  );

  const benchmarkLine = FORMAT_ORDER.map((format) => {
    const target = benchmarks.find((row) => row.format === format)?.target_minutes_per_unit;
    return `${FORMATS[format].label} ${target ? `${target}m` : "—"}`;
  }).join(" &middot; ");

  const body =
    rows.length === 0
      ? `<tr><td colspan="6" style="padding:18px;text-align:center;color:#6b7280;font-size:13px">
           Nothing tracked on this day.
         </td></tr>`
      : rows
          .map((card) => {
            const perFormat = FORMAT_ORDER.map((format) => {
              const units = card.units_by_format?.[format] ?? 0;
              const seconds = card.seconds_by_format?.[format] ?? 0;
              if (!units || !seconds) return null;
              return `${FORMATS[format].label} ${minutes(Math.round(seconds / units))}/unit`;
            })
              .filter(Boolean)
              .join(" &middot; ");

            const pace = card.efficiency_pct;
            const paceColour = pace == null ? "#9ca3af" : pace >= 100 ? "#2f9e44" : "#e8590c";

            return `<tr style="border-top:1px solid #e5e7eb">
              <td style="padding:10px 12px;font-size:13px;color:#111827">
                <strong>${card.designer?.full_name || card.designer?.email || "Unknown"}</strong>
                ${perFormat ? `<div style="color:#6b7280;font-size:11.5px;margin-top:3px">${perFormat}</div>` : ""}
              </td>
              <td style="padding:10px 12px;font-size:13px;text-align:right;color:#111827">${minutes(card.active_seconds)}</td>
              <td style="padding:10px 12px;font-size:13px;text-align:right;color:#111827">${card.units_completed}</td>
              <td style="padding:10px 12px;font-size:13px;text-align:right;color:#111827">${card.tickets_completed}</td>
              <td style="padding:10px 12px;font-size:13px;text-align:right;color:#111827">
                ${card.tickets_completed ? `${Math.round((card.first_pass_count / card.tickets_completed) * 100)}%` : "—"}
              </td>
              <td style="padding:10px 12px;font-size:13px;text-align:right;font-weight:600;color:${paceColour}">
                ${pace ?? "—"}
              </td>
            </tr>`;
          })
          .join("");

  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
  <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
    <div style="background:#111111;padding:20px 24px">
      <span style="display:inline-block;width:22px;height:22px;background:#fcef24;border-radius:5px;color:#111;font-weight:700;text-align:center;line-height:22px;font-size:13px">N</span>
      <span style="color:#ffffff;font-size:15px;font-weight:600;margin-left:10px">Neuroid Creative Studio</span>
      <div style="color:rgba(255,255,255,0.55);font-size:12.5px;margin-top:6px">Daily scorecard · ${day}</div>
    </div>

    <div style="padding:18px 24px;border-bottom:1px solid #e5e7eb">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        ${[
          ["Tracked", minutes(totals.seconds)],
          ["Units", String(totals.units)],
          ["Tickets", String(totals.tickets)],
          ["First pass", totals.tickets ? `${Math.round((totals.firstPass / totals.tickets) * 100)}%` : "—"],
        ]
          .map(
            ([label, value]) => `<td style="text-align:center">
              <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.07em;color:#6b7280">${label}</div>
              <div style="font-size:22px;font-weight:600;color:#111827;margin-top:4px">${value}</div>
            </td>`,
          )
          .join("")}
      </tr></table>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0">
      <tr style="background:#f9fafb">
        <th align="left"  style="padding:8px 12px;font-size:10.5px;text-transform:uppercase;letter-spacing:0.06em;color:#6b7280">Designer</th>
        <th align="right" style="padding:8px 12px;font-size:10.5px;text-transform:uppercase;letter-spacing:0.06em;color:#6b7280">Tracked</th>
        <th align="right" style="padding:8px 12px;font-size:10.5px;text-transform:uppercase;letter-spacing:0.06em;color:#6b7280">Units</th>
        <th align="right" style="padding:8px 12px;font-size:10.5px;text-transform:uppercase;letter-spacing:0.06em;color:#6b7280">Tickets</th>
        <th align="right" style="padding:8px 12px;font-size:10.5px;text-transform:uppercase;letter-spacing:0.06em;color:#6b7280">1st pass</th>
        <th align="right" style="padding:8px 12px;font-size:10.5px;text-transform:uppercase;letter-spacing:0.06em;color:#6b7280">Pace</th>
      </tr>
      ${body}
    </table>

    <div style="padding:14px 24px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:11.5px;line-height:1.6">
      Pace compares benchmark minutes earned against minutes tracked; 100 is on the bar.
      <br/>Benchmarks: ${benchmarkLine}
      <br/>Breaks are excluded — time only accrues while a ticket is In Progress.
    </div>
  </div>
</body></html>`;
}

/**
 * Sends through Resend, which is already set up for auth email. Missing key
 * is not an error: the roll-up itself is the important part, and the digest
 * should degrade rather than fail the whole cron.
 */
export async function sendScorecardEmail({
  to,
  subject,
  html,
}: {
  to: string[];
  subject: string;
  html: string;
}): Promise<string> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return "skipped — RESEND_API_KEY not set";

  const from = process.env.SCORECARD_FROM_EMAIL ?? "no-reply@neuroidmedia.com";

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: `Neuroid Creative Studio <${from}>`, to, subject, html }),
    });

    if (!response.ok) {
      return `failed — ${response.status} ${await response.text()}`;
    }
    return `sent to ${to.length}`;
  } catch (error) {
    return `failed — ${error instanceof Error ? error.message : "unknown"}`;
  }
}
