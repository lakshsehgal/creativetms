# Creative TMS

Creative ticketing and productivity tracking for a post-production team.
Strategists raise tickets, designers work them on a board, and the time each
piece takes is measured from that work rather than from anything anyone has to
fill in.

Formats tracked: **Video · Static · Carousel · GIF**.

---

## The idea behind the time tracking

Designers push back on time tracking when it feels like surveillance, and
they're usually right to — a stopwatch you have to remember is both annoying and
inaccurate. So there isn't one.

- Moving a ticket into **In Progress** opens a work session. Moving it out
  closes one. That's the whole mechanism.
- A designer can only have **one clock running at a time**. Starting a second
  ticket parks the first back into *Assigned* automatically, so the board and
  the timesheet can never disagree.
- The open tab sends a heartbeat every 45 seconds. If it goes quiet — laptop
  shut, tab buried — a sweep ends the session and **rewinds it to the last
  heartbeat**, so lunch never gets billed as work.
- Designers see their own numbers first, on **My Day** and their own scorecard.
  Raw session logs are visible to the designer they belong to and to admins.
  Strategists get delivery status and team-level planning figures, never an
  individual's minute-by-minute log — that split is enforced in the database,
  not just hidden in the UI.
- Every pace figure is measured against a **format benchmark** the admin sets,
  not against other designers. "This static took 40 minutes, the bar is 35" is a
  conversation you can have. A leaderboard isn't.

---

## Where the files live

Deliverables live in **Frame.io**, not in this tool. Each ticket carries a
review link instead of the files themselves — the designer pastes it when they
submit, and it's the first thing on the ticket for both sides. Submitting for
review prompts for the link if it isn't set yet, so the strategist gets a
ticket they can act on rather than one they have to chase.

The small **Working files** panel further down is for the odd source file, font
or reference that should sit with the ticket. It isn't where finished work goes.

---

## Roles

| | Admin | Operator | Strategist | Designer |
|---|---|---|---|---|
| Raise / edit tickets | ✅ | — | ✅ | — |
| Approve, request revisions, send to client | ✅ | — | ✅ | — |
| Work tickets, submit for review | ✅ | — | ✅ | ✅ |
| Team analytics (volume, on-time, first-pass) | ✅ | ✅ | ✅ | — |
| Per-designer timing and scorecards | ✅ | ✅ | — | own only |
| Nightly scorecard email | ✅ | ✅ | — | — |
| Invite people, set roles and benchmarks | ✅ | — | — | — |
| Block bandwidth, write call sheets | ✅ | ✅ | with shoot ops | — |

**Operator** reads the numbers without running the board — analytics,
scorecards and timing, plus the nightly digest, but no ability to move work
through the pipeline. They also keep Brands and Team tidy, with one line they
can't cross: an admin's role, an admin's access, and handing out shoot ops all
stay with admins, enforced in the database rather than by a hidden button.

**Shoot ops** is a flag, not a role. An admin can give it to a strategist who
effectively runs production, and it unlocks exactly two things — the Shoot
section, and the ability to block a designer's day.

## Who sees time, and how

Timing is management information, not a scoreboard, and the visibility rules
say so:

- **Admins and operators** see everything, including clocks running live.
- **Designers** see what a piece of work took, never a stopwatch ticking while
  they do it. Watching your own seconds is pressure, not information — and the
  final number is identical either way.
- **Strategists** see no timing at all. They get delivery status.

Enforced in row-level security as well as in the UI, so it holds over a direct
database connection too.

## Breaks

A **Break** button sits in the sidebar for every designer. Taking one stops the
clock, blanks the screen, and returns them to the same ticket where they left
off — the total continues rather than restarting. The heartbeat is refused
server-side while a break is open, so a tab left running in the background
can't quietly restart it either.

Lunch simply isn't in the numbers. Nobody should have to choose between taking
a proper break and looking slow.

Enforced by Postgres row-level security and by triggers on the tickets table —
a designer can't edit a brief or approve their own work even with a direct
database connection.

---

## Setup

### 1. Create the Supabase project

At [supabase.com](https://supabase.com), create a project and note the URL and
keys from **Project Settings → API**.

### 2. Run the migration

Paste the files in `supabase/migrations/` into the **SQL Editor** and run them
**in filename order**, one at a time. `0001_init.sql` creates every table, the
RLS policies, the time-tracking triggers and the reporting functions; each later
file adds what its name says. All of them are safe to run more than once, so
re-running one you're unsure about costs nothing. Optionally run
`supabase/seed.sql` for a few starter brands.

Two notes on the order:

- `0002_review_links.sql` is only needed if you ran an earlier copy of `0001`
  before review links existed. A fresh project gets everything from `0001`
  alone, and it's safe either way.
- `0009` is split into `STEP-1` and `STEP-2` because Postgres won't let a new
  enum value be *used* in the same transaction that adds it. Run STEP-1, then
  STEP-2, as two separate statements.

### 3. Point the first admin at your email

In the SQL Editor:

```sql
alter database postgres set app.bootstrap_admin_email = 'you@yourcompany.com';
```

That address becomes an admin on first sign-in. (If the instance is completely
empty, whoever signs in first becomes the admin anyway — the setting just makes
it deterministic.) Everyone after that is invited from the **Team** page and
lands on the role you picked for them.

### 4. Turn on email sign-in

**Authentication → Providers → Email**: enable it, and turn **Confirm email**
on so the six-digit code gets sent. Under **Authentication → URL Configuration**
add your deployed domain to the redirect allow-list.

### 5. Environment

Copy `.env.example` to `.env.local` and fill it in:

```bash
cp .env.example .env.local
npm install
npm run dev
```

### 6. Deploy

Push to a Vercel project and set the same four variables in **Settings →
Environment Variables**. `vercel.json` already registers the two cron jobs:

| Job | Schedule | What it does |
|---|---|---|
| `/api/cron/sweep` | every 15 min | Ends sessions whose tab went quiet, rewound to the last heartbeat |
| `/api/cron/scorecards` | 19:30 UTC daily | Writes the previous day's scorecard for every designer |

Both are protected by `CRON_SECRET`. Move the scorecard schedule to whatever
lands after your team's working day — it rolls up each designer against *their*
local day, so a team spread across timezones still gets correct cards.

To regenerate a specific day by hand:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://your-app.vercel.app/api/cron/scorecards?day=2026-08-19"
```

Re-running a day overwrites rather than duplicates, so a retry is always safe.

---

## How it's built for speed

The complaint that started this was lag, so the architecture is shaped around
round trips:

- **Reads and writes go browser → Postgres directly** through Supabase, with no
  Next.js server hop in the middle. RLS is what makes that safe.
- **Server-rendered first paint.** The board arrives painted rather than as a
  spinner, then hydrates and takes over.
- **Optimistic drag and drop.** A card moves the instant you drop it; the
  database write happens behind it and rolls back with a toast if it's refused.
- **Realtime patches the cache in place** rather than refetching the board — one
  changed row costs one small query, not a whole reload.
- **No chart library.** The analytics views are hand-written SVG, which is most
  of why the whole app's shared bundle is ~103 kB.
- **Float positions for board ordering**, so re-ordering a column is one `UPDATE`
  with a midpoint instead of renumbering every card.
- **Indexes** on every hot path — status + position, assignee, due date, and the
  partial unique index that enforces one open session per designer.

---

## Layout

```
src/
  app/
    (app)/            board · my-day · tickets/[id] · analytics · scorecards · team · brands
    api/cron/         idle sweep + nightly scorecard roll-up
    login/            six-digit email code
  components/
    board/            kanban, cards, ticket composer
    ticket/           detail view, live clock, revisions, comments, attachments
    analytics/        team charts + per-designer table
    scorecards/       daily cards, live for today
    charts/           hand-built bar and trend charts
    ui/               primitives shared across the app
  lib/                types, formatting, query helpers, Supabase clients
supabase/migrations/  the whole schema, RLS and triggers in one file
```

## Ticket lifecycle

```
New Request → In Progress → Ready for Approval → Sent to Client → Approved
                   ↑                 │                  │
                   └── Needs Edit ───┴──────────────────┘
                   └── Size Changes ─┘

Side states, none of which run the clock:
   Awaiting Assets · On Hold
```

**In Progress is the only status where the clock runs.** Ready for Approval
stops it; Needs Edit sends the work back, and the next In Progress adds to the
same running total rather than starting a fresh one.

Needs Edit increments the revision counter and clears any sign-off — that's
what makes the first-pass approval rate worth reading. **Size Changes
deliberately does not**: a resize request isn't the designer missing the brief,
and folding it in would make that number meaningless.

A designer may hold several tickets In Progress at once — that's what a day's
plan looks like. Only one of them has a running clock; starting a second stops
the first's timer and leaves its status alone.

## Time, split by kind of work

Every work session is stamped with what kind of work it was, so a ticket's
total breaks down rather than sitting as one opaque number:

| Phase | When it applies |
|---|---|
| **Original build** | From New Request through the first submission |
| **Revisions** | Everything after a Needs Edit |
| **Size changes** | Everything after a Size Changes request |

The phase lives on the ticket rather than being inferred from the previous
status, so a designer who pauses mid-revision and resumes tomorrow is still
doing revision work.

This is what makes "how long does a static take us" answerable: the original
build is the number to benchmark, and revisions and resizes are separate
costs worth seeing on their own.

## Deliverables

Every submission creates a new version — V1, V2, V3 — rather than overwriting
one link. Marking a ticket Ready for Approval always asks for the Frame.io
link and records it against the round it belongs to, so a strategist can open
V1 next to V3 and see whether the notes landed.

## Notifications

Written by database triggers, not by the browser, so a ping can't be lost to a
dropped request or a tab closed at the wrong moment. Delivered live to the
bell in the sidebar.

| Event | Who hears |
|---|---|
| Ready for Approval | Whoever raised the brief |
| Needs Edit | The designer |
| Size Changes | The designer |
| Approved / Sent to Client | The designer |
| Assigned | The new assignee |
| Somebody booked out for a shoot | Every strategist and admin, and the person themselves |
| An estimate asked for | The designer on the ticket |
| An estimate given or moved | Whoever raised the brief, and whoever asked |

The shoot ping is written once per marking, not once per day blocked: a
three-day shoot is one fact, and three identical pings is how a bell gets
ignored.

Anything somebody is waiting on also arrives as a desktop notification, through
a service worker, so it reaches a tab that isn't in front. Turn them on in
Profile → Desktop alerts.

## Two dates, and why

Every brief carries a **due date**: the promise made when it was raised. It's
set by the strategist and it doesn't move.

Some briefs also carry an **estimate** — the designer's own read on when the
thing will actually be ready. It moves as often as reality does. The distance
between the two is the entire point: nobody needs a timesheet, they need to
know the Thursday promise became Monday while there's still time to tell the
client.

It is deliberately not a field on every ticket. A strategist chasing one
particular brief presses **Ask for an ETA** on it; the designer gets a
notification and a row at the top of My Day with four one-click answers — end
of today, end of tomorrow, in two days, end of the week — and can pick any
other date instead. Answering clears the question. Moving it later tells the
same people again, with a reason if the designer gave one.

The reason is offered and never required. Mandatory reasons train people to
type "busy"; optional ones get filled in when there's something real to say,
and "waiting on product shots" three briefs running is the sort of fact worth
having.

Every answer is kept. A date that has moved three times is its own warning,
and the reasons stack up over a quarter into a straight answer about where
the weeks actually go.

The estimate never touches the due date. Only the designer on the ticket (or
an admin) can set one; only staff can ask for one. Both halves are enforced in
the database.

## Shoots

Several of the designers shoot as well, and a day on set is a day gone. The
Shoot section holds both halves of that:

**Bandwidth.** Mark a whole day or a slice of one. Those hours come out of the
Workload grid immediately, and a strategist briefing that person for that day
gets warned before they raise it — a warning, not a wall, because shoots move
and a tool that refuses the brief outright just gets worked around in Slack.

**The bar at the top.** From 24 hours before a shoot starts until the moment it
ends, everyone who raises briefs sees a line naming who's out and when. A
notification is a moment; this is a state, and by the Tuesday it matters the
notification is four hundred rows down a bell nobody opens.

**Call sheets.** Locations, scripts by day, crew and reporting times, actors,
and a meal estimate that works itself out from the crew. Plus the run-up
checklist — the same three phases every time, ticked live on the day. It saves
as you type and prints to a clean A4 page with none of the app around it.

## The noon rule

A brief raised after midday can't be given the same day's due date. The
designer's day is planned in the morning, so a same-day deadline set at 3pm is
a promise the floor can't keep. The date picker won't offer today, and the
database refuses it as well.

## Views

| View | What it's for |
|---|---|
| **List** (default) | Grouped table with coloured status cells, edit status and assignee inline |
| **Board** | Kanban across all nine statuses, drag to move |
| **Today** | Who has picked up what today, grouped by designer — the answer to "what are you working on?" without asking |

Filters (search, status, brand, format, designer, who raised it, and a date
period over raised/due/approved) live in the URL, so a filtered screen can be
pasted to a colleague and open the same way. Save any combination as a named
view, private or shared with the team.
