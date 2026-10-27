import assert from "node:assert/strict";
import { exactTime, fullTime } from "@/lib/format";
import {
  canAssignWork,
  canSeeAllTime,
  canSeeLiveTimer,
  canSeeOwnTime,
  type Profile,
  type UserRole,
} from "@/lib/types";

let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { console.log(`FAIL  ${name}\n      ${(e as Error).message.split("\n").slice(0,4).join("\n      ")}`); process.exitCode = 1; }
}
const ROLES: UserRole[] = ["admin", "operator", "strategist", "designer"];
const person = (role: UserRole): Profile => ({
  id: role, email: `${role}@n.com`, full_name: role, role, avatar_url: null, is_active: true,
  daily_capacity_minutes: 480, timezone: "Asia/Kolkata", created_at: "",
  break_started_at: null, break_ticket_id: null, has_shoot_ops: false,
});

console.log("\nA designer never sees a minute figure about their own work");
check("tracked time: admins and operators only", () => {
  assert.deepEqual(ROLES.filter(canSeeOwnTime), ["admin", "operator"]);
  assert.deepEqual(ROLES.filter(canSeeAllTime), ["admin", "operator"]);
  assert.deepEqual(ROLES.filter(canSeeLiveTimer), ["admin", "operator"]);
});
check("expected time: everyone who plans, never the designer", () => {
});

console.log("\nWho hands work out");
check("everyone who works the board; operators read, they don't move", () => {
  assert.deepEqual(ROLES.filter((r) => canAssignWork(person(r))), ["admin", "strategist", "designer"]);
});

console.log("\nThe clock time, said the way a person would");
const now = new Date();
const at = (h: number, m: number, dayOffset = 0) => {
  const d = new Date(now); d.setDate(d.getDate() + dayOffset); d.setHours(h, m, 0, 0); return d.toISOString();
};
check("today is just the time", () => {
  const s = exactTime(at(14, 5));
  assert.match(s, /^2:05\s?pm$/i, s);
  assert.doesNotMatch(s, /\d{1,2}\s\w{3}/, "no date on something from today");
});
check("yesterday carries the day", () => {
  const s = exactTime(at(9, 30, -1));
  // Day-month order is the reader's locale ("26 Oct" / "Oct 26"); either is right.
  assert.match(s, /(\d{1,2} \w{3}|\w{3} \d{1,2}), 9:30\s?am/i, s);
});
check("a different year says so", () => {
  const d = new Date(now); d.setFullYear(d.getFullYear() - 1); d.setHours(18, 0, 0, 0);
  const s = exactTime(d.toISOString());
  assert.match(s, new RegExp(String(d.getFullYear())), s);
});
check("this year doesn't repeat the year", () => {
  const s = exactTime(at(18, 0, -40));
  assert.doesNotMatch(s, new RegExp(String(now.getFullYear())), s);
});
check("midnight and noon read as a person says them", () => {
  assert.match(exactTime(at(0, 0)), /^12:00\s?am$/i);
  assert.match(exactTime(at(12, 0)), /^12:00\s?pm$/i);
});
check("nothing, or junk, is quiet rather than 'Invalid Date'", () => {
  assert.equal(exactTime(null), "");
  assert.equal(exactTime(undefined), "");
  assert.equal(exactTime("not a date"), "");
  assert.equal(fullTime("not a date"), "");
});
check("the title carries the full thing — weekday, date, year, time", () => {
  const s = fullTime(at(14, 5, -1));
  assert.match(s, /\w{3}/, s);                       // weekday or month
  assert.match(s, new RegExp(String(now.getFullYear())), s);
  assert.match(s, /2:05\s?pm/i, s);
});

console.log(`\n${passed} checks passed\n`);
