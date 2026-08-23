import type { Profile, UserRole } from "./types";
import { canRunShoots } from "./types";

/**
 * The guided walkthrough, as data.
 *
 * Two things this deliberately isn't.
 *
 * It isn't a slideshow of screenshots. A screenshot of a tool that changes
 * every week is wrong within the month, and the worst kind of wrong: it looks
 * authoritative while describing a screen that no longer exists. Every step
 * here points at the live product — the tour navigates, switches tabs and
 * opens dialogs exactly as a person would, and puts a spotlight on the real
 * element. If a button moves, the tour moves with it. If a button is deleted,
 * the test in scratch/tour.test.ts fails rather than the walkthrough quietly
 * pointing at nothing.
 *
 * And it isn't one tour with role checks sprinkled through it. A designer and
 * a strategist use opposite halves of this tool: one picks work up and is
 * measured on it, the other hands work out and waits on it. Two tracks, each
 * written for the person taking it, in the order their day actually happens.
 *
 * Admins and operators don't get one. They set the studio up, they already
 * know what everything is, and a tour that explains their own tool to them is
 * the sort of thing people click Skip on and never trust again.
 */

/* ------------------------------------------------------------------ types */

/**
 * The bits of the product a step can point at.
 *
 * Every value here has to appear as a `data-tour` attribute somewhere in the
 * app — that's what the test checks, in both directions, so an anchor can't be
 * renamed out from under the tour and a step can't reference one that was
 * never added.
 */
export type Anchor =
  // shell
  | "nav-board"
  | "nav-my-day"
  | "nav-scorecards"
  | "nav-analytics"
  | "nav-shoot"
  | "nav-guide"
  | "bell"
  | "break"
  | "profile-link"
  // work
  | "layouts"
  | "view-list"
  | "view-board"
  | "view-today"
  | "view-workload"
  | "view-timeline"
  | "new-ticket"
  | "filters"
  | "saved-views"
  | "col-new_request"
  | "col-in_progress"
  | "col-ready_for_approval"
  | "col-needs_edit"
  // the brief dialog
  | "brief-format"
  | "brief-designer"
  | "brief-due"
  | "brief-rush"
  | "brief-close"
  // my day
  | "day-plan"
  | "eta-asks"
  // shoot
  | "shoot-tabs";

/** A drawn explanation, for the few things the live screen can't be pointed at. */
export type Illustration = "clock" | "rush" | "noon" | "eta";

export interface TourStep {
  id: string;
  /** Go here first. Omitted means "wherever we already are". */
  path?: string;
  /**
   * Press this before showing the step — a layout tab, the New ticket button.
   * The tour drives the product rather than deep-linking into it, so what you
   * are shown is a screen you know how to get back to.
   */
  click?: Anchor;
  /** What to put the spotlight on. Without one the step is a card in the middle. */
  target?: Anchor;
  /**
   * Skip the step entirely when the target isn't there. For the things that
   * only exist sometimes — the escalation switch, which the brief form only
   * offers after midday. Without this a step whose target is missing still
   * shows, as a card in the middle, because the words are usually worth having
   * even when the thing they describe is off screen.
   */
  onlyIfPresent?: boolean;
  title: string;
  body: string;
  art?: Illustration;
}

export interface Track {
  role: "designer" | "strategist";
  /** Bumped when the content changes enough that a returning person should see it again. */
  version: number;
  steps: TourStep[];
}

/* ------------------------------------------------------------- designers */

const DESIGNER: Track = {
  role: "designer",
  version: 1,
  steps: [
    {
      id: "hello",
      path: "/board",
      title: "Two minutes, then you're set",
      body:
        "This is where the studio's work lives. Before anything else, the one promise the tool makes to you: you will never be asked to log time, fill a timesheet, or account for your day. Not once. The rest of this explains how that works.",
    },
    {
      id: "clock",
      art: "clock",
      title: "The clock runs itself",
      body:
        "Moving a card to In Progress starts it. Moving it out stops it. That's the whole mechanism — there is no timer to remember, no button to forget, and nothing to fill in at 7pm. If you take a break, it pauses. If you forget a card overnight, it's swept rather than left running against you.",
    },
    {
      id: "work",
      target: "nav-board",
      title: "Work",
      body:
        "Everything the studio has on, in one place. Yours and everyone else's — nothing here is hidden from you.",
    },
    {
      id: "board",
      click: "view-board",
      target: "layouts",
      title: "Five ways to look at it",
      body:
        "The same work, arranged differently. Board is the one most designers live in. List is faster for scanning, and the other three are mostly for whoever is planning.",
    },
    {
      id: "new-request",
      target: "col-new_request",
      title: "This is where work arrives",
      body:
        "A strategist raises a brief and it lands here, usually unassigned. Nobody hands it to you — you take it. Read the brief, check the due date, and if it's yours, pick it up.",
    },
    {
      id: "start",
      target: "col-in_progress",
      title: "Picking something up",
      body:
        "Drag a card into In Progress, or press the play button on it. That single move assigns it to you and starts the clock. When you're done, move it to Ready for Approval — and that's the entire ritual.",
    },
    {
      id: "rush",
      art: "rush",
      title: "A brief with a flame on it",
      body:
        "A same-day escalation. A strategist asked for it after midday, and an operator or admin agreed before it reached you — so it has already cost somebody a decision. Until that approval lands, it can't be picked up at all: the board won't let you, on purpose.",
    },
    {
      id: "review",
      target: "col-ready_for_approval",
      title: "Handing it back",
      body:
        "Moving a card here asks you for the Frame.io link, and the clock stops. Every round gets its own link — v1, v2, v3 — so when somebody asks what changed between two versions, the answer is on the ticket rather than in a chat.",
    },
    {
      id: "edits",
      target: "col-needs_edit",
      title: "When it comes back",
      body:
        "Notes from the strategist or the client land here. Pick it up the same way and the clock starts again — but as a revision round, counted separately from the original build. That split is why nobody has to argue about whether a brand is expensive.",
    },
    {
      id: "my-day",
      path: "/my-day",
      target: "nav-my-day",
      title: "My Day",
      body: "Your own screen. What you picked for today, what's waiting on review, and what's coming.",
    },
    {
      id: "plan",
      target: "day-plan",
      title: "Say what today looks like",
      body:
        "Drag your work into the order you'll actually do it. This isn't a report — it's what a strategist sees when they're deciding whether to ask you for one more thing before lunch.",
    },
    {
      id: "eta",
      target: "eta-asks",
      art: "eta",
      // No onlyIfPresent: the panel is empty most days, and this is one of the
      // few things a designer has to be told rather than shown.
      title: "When somebody asks how long",
      body:
        "Sometimes a strategist needs a date on a specific piece. It appears here. Give a rough answer — it can change later, and changing it tells them automatically. Answer once and the chasing stops.",
    },
    {
      id: "break",
      target: "break",
      title: "Stepping away",
      body:
        "Lunch, a call, a cigarette. Press this and everything stops; press it again when you're back. It exists so the numbers stay honest without you having to think about them.",
    },
    {
      id: "bell",
      target: "bell",
      title: "What needs you",
      body:
        "Revisions, questions, and anything raised for you. Turn on desktop alerts in your profile if you'd rather they reach you outside the tab.",
    },
    {
      id: "scorecards",
      path: "/scorecards",
      target: "nav-scorecards",
      title: "Yesterday, in your own words",
      body:
        "What you shipped and how long it took, worked out from the cards you moved. It's a mirror, not a league table — nobody is ranked against anybody here.",
    },
    {
      id: "done",
      title: "That's the whole tool",
      body:
        "Move cards, add review links, keep My Day roughly honest. Everything else — the timing, the reporting, the chasing — happens because of those three things rather than in addition to them. The guide is in the sidebar whenever you want it again.",
    },
  ],
};

/* ------------------------------------------------------------ strategists */

const STRATEGIST: Track = {
  role: "strategist",
  version: 1,
  steps: [
    {
      id: "hello",
      path: "/board",
      title: "Two minutes, then you're set",
      body:
        "This is where you hand work to the studio and watch it come back. The short version: you raise briefs, you can see who has room before you do, and you find out when things land without asking anybody.",
    },
    {
      id: "work",
      target: "nav-board",
      title: "Work",
      body: "Every brief in the studio, whoever raised it. Start here for anything.",
    },
    {
      id: "layouts",
      target: "layouts",
      title: "Five ways to look at it",
      body:
        "The same briefs, arranged for five different questions: what's the state of everything, where is it in the flow, what got picked up today, who has room this week, and when does it all land.",
    },
    {
      id: "new",
      click: "new-ticket",
      target: "brief-format",
      title: "Raising a brief",
      body:
        "Format and quantity are the two fields that matter most — together they're how the tool works out what this will cost somebody in hours, which is what makes the workload view mean anything.",
    },
    {
      id: "assign",
      target: "brief-designer",
      title: "You don't have to pick anybody",
      body:
        "Leave the designer blank and it goes to the board for whoever is free to take. Naming someone is for when it genuinely has to be them — and if they're on a shoot that day, you'll be told before you can.",
    },
    {
      id: "due",
      target: "brief-due",
      art: "noon",
      title: "The midday rule",
      body:
        "Before noon, you can ask for today. After noon, the earliest is tomorrow. A brief raised at 4pm can't realistically ship tonight — the day was planned this morning — and pretending otherwise is how a studio ends up working evenings by default.",
    },
    {
      id: "rush",
      target: "brief-rush",
      onlyIfPresent: true,
      title: "When it really can't wait",
      body:
        "This is the way through, and it costs a decision rather than a click: an operator or an admin has to agree before the brief reaches anybody. Until they do, no designer can pick it up. Use it for a genuine escalation and it works; use it daily and it stops meaning anything.",
    },
    {
      id: "close",
      click: "brief-close",
      target: "new-ticket",
      title: "That's the brief",
      body: "Raise one whenever you need to — it's the only way work enters the studio.",
    },
    {
      id: "workload",
      click: "view-workload",
      target: "layouts",
      title: "Who has room",
      body:
        "Hours already promised against hours each person actually has, day by day. Shoot days and time off are already taken out, so a full bar means full. Check this before you promise a client a date.",
    },
    {
      id: "timeline",
      click: "view-timeline",
      target: "layouts",
      title: "When it lands",
      body: "Everything against the calendar. The fastest way to see two deadlines colliding while there's still time to move one.",
    },
    {
      id: "today",
      click: "view-today",
      target: "layouts",
      title: "What's actually happening today",
      body:
        "What each designer picked for today, in their own order. This is the screen that replaces the 10am standup and the \"any update?\" message.",
    },
    {
      id: "list",
      click: "view-list",
      target: "filters",
      title: "Narrowing it down",
      body: "Filter by brand, designer, status or date. Everything you type here stays in the address bar, so a filtered screen is a link you can send.",
    },
    {
      id: "saved",
      target: "saved-views",
      title: "Keep the ones you use",
      body:
        "Save a filter you keep re-typing — \"my brands, in review\" — and it becomes one click. Share it and the rest of the team gets it too.",
    },
    {
      id: "eta",
      art: "eta",
      title: "Asking when something will land",
      body:
        "On any ticket you can ask the designer for an expected delivery. They answer once, in the tool, and you get told when it changes. It's there for the pieces that are genuinely taking longer than usual — asking on everything turns it back into chasing.",
    },
    {
      id: "shoot",
      path: "/shoot",
      target: "nav-shoot",
      onlyIfPresent: true,
      title: "Shoot",
      body:
        "You've been given shoot ops. Block designers out for shoot days so nobody briefs them for it, and write the call sheet here — the whole studio's admins and operators plus the crew get it by email on Neuroid paper.",
    },
    {
      id: "analytics",
      path: "/analytics",
      target: "nav-analytics",
      title: "How it's going",
      body:
        "Throughput, turnaround and where time actually goes — initial builds against revision rounds against resizes. Useful for the conversation about why a brand costs more than it looks like it should.",
    },
    {
      id: "bell",
      target: "bell",
      title: "What needs you",
      body: "Submissions, answers to your questions, and anything raised for you. Desktop alerts are in your profile.",
    },
    {
      id: "done",
      title: "That's the whole tool",
      body:
        "Raise briefs, check workload before you promise, ask for an ETA when it matters. Everything else the tool does — the timing, the reporting, the notifying — falls out of that. The guide is in the sidebar whenever you want it again.",
    },
  ],
};

/* ---------------------------------------------------------------- lookup */

export const TRACKS: Track[] = [DESIGNER, STRATEGIST];

/** Who gets a walkthrough. Admins and operators set the studio up; they don't need one. */
export function hasTour(role: UserRole): role is "designer" | "strategist" {
  return role === "designer" || role === "strategist";
}

/**
 * The track this person should see, with the steps they can't reach removed.
 *
 * A strategist without shoot ops has no Shoot section, so pointing at it would
 * send them to a page that redirects. Better to drop the step than to explain
 * something they can't open.
 */
export function trackFor(profile: Profile): Track | null {
  if (!hasTour(profile.role)) return null;
  const track = TRACKS.find((candidate) => candidate.role === profile.role);
  if (!track) return null;

  const reachable = track.steps.filter((step) => {
    if (step.path === "/shoot" || step.target === "nav-shoot") return canRunShoots(profile);
    return true;
  });

  return { ...track, steps: reachable };
}

/* --------------------------------------------------------------- storage */

/**
 * Per browser rather than per account, on purpose.
 *
 * "Have I been shown this" is a fact about a screen, not about a person: the
 * useful behaviour is that a new machine offers it again and a machine that
 * has seen it doesn't. It also means the walkthrough needed no migration and
 * no write path, so nothing about it can fail in a way that costs somebody
 * their work.
 */
export function tourKey(role: string): string {
  return `ctms-tour-${role}`;
}

export function tourSeen(track: Track): boolean {
  try {
    return Number(localStorage.getItem(tourKey(track.role))) >= track.version;
  } catch {
    // A locked-down browser refusing storage shouldn't mean no walkthrough —
    // it should mean the walkthrough is offered every time, which is the safe
    // side of this particular error.
    return false;
  }
}

export function markTourSeen(track: Track): void {
  try {
    localStorage.setItem(tourKey(track.role), String(track.version));
  } catch {
    /* nothing to do — see above */
  }
}
