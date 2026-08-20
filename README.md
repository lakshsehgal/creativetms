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

## Roles

| | Admin | Strategist | Designer |
|---|---|---|---|
| Raise / edit tickets | ✅ | ✅ | — |
| Approve, request revisions, deliver | ✅ | ✅ | — |
| Work tickets, submit for review | ✅ | ✅ | ✅ |
| Team analytics (volume, on-time, first-pass) | ✅ | ✅ | — |
| Per-designer timing and scorecards | ✅ | — | own only |
| Invite people, set roles and benchmarks | ✅ | — | — |

Enforced by Postgres row-level security and by triggers on the tickets table —
a designer can't edit a brief or approve their own work even with a direct
database connection.

---

## Setup

### 1. Create the Supabase project

At [supabase.com](https://supabase.com), create a project and note the URL and
keys from **Project Settings → API**.

### 2. Run the migration

Paste `supabase/migrations/0001_init.sql` into the **SQL Editor** and run it. It
creates every table, the RLS policies, the time-tracking triggers, the reporting
functions and the storage bucket. Optionally run `supabase/seed.sql` for a few
starter brands.

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
backlog → assigned → in_progress → in_review → approved → delivered
                         ↑              ↓
                         └─ revisions ──┘
```

`in_progress` is the only state where the clock runs. `revisions` increments the
round counter and clears any prior sign-off, which is what makes first-pass
approval rate a number worth reading.
