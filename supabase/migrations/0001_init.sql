-- ===========================================================================
-- Creative TMS — core schema
--
-- Design notes worth knowing before you read the DDL:
--
--  * Time tracking is DERIVED, never self-reported. Moving a ticket into
--    `in_progress` opens a work session; moving it out closes one. Designers
--    press nothing. See `sync_work_session()` below.
--
--  * A designer can only have ONE session open at a time. Starting work on a
--    second ticket closes the first automatically, which is how people
--    actually work and keeps the totals honest without policing.
--
--  * Idle time is trimmed, not guessed. The client sends a heartbeat while
--    the tab is alive; `close_stale_sessions()` retroactively ends any session
--    whose heartbeat went quiet, backdating the end to the last known beat.
--
--  * Raw session rows are visible to admins and to the designer they belong
--    to — strategists see delivery status, not somebody's minute-by-minute log.
-- ===========================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type user_role as enum ('admin', 'strategist', 'designer');

create type creative_format as enum ('video', 'static', 'carousel', 'gif');

create type ticket_status as enum (
  'backlog',      -- raised, not yet picked up
  'assigned',     -- has a designer, not started
  'in_progress',  -- clock is running
  'in_review',    -- submitted, waiting on the strategist
  'revisions',    -- sent back with notes
  'approved',     -- strategist signed off
  'delivered'     -- handed to the client
);

create type ticket_priority as enum ('low', 'normal', 'high', 'urgent');

create type session_end_reason as enum (
  'status_change',  -- moved out of in_progress
  'switched',       -- designer started a different ticket
  'idle',           -- heartbeat went quiet; end backdated
  'manual',         -- designer paused deliberately
  'day_close'       -- nightly sweep
);

-- ---------------------------------------------------------------------------
-- Profiles — one row per authenticated user
-- ---------------------------------------------------------------------------
create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text        not null unique,
  full_name   text        not null default '',
  role        user_role   not null default 'designer',
  avatar_url  text,
  -- Deactivated users keep their history but lose access.
  is_active   boolean     not null default true,
  -- Working hours drive the "capacity used" figure on the scorecard.
  daily_capacity_minutes int not null default 480 check (daily_capacity_minutes between 60 and 1440),
  timezone    text        not null default 'Asia/Kolkata',
  created_at  timestamptz not null default now()
);

create index profiles_role_idx on profiles (role) where is_active;

-- ---------------------------------------------------------------------------
-- Invites — an admin pre-authorises an email and the role it lands on
-- ---------------------------------------------------------------------------
create table invites (
  id          uuid primary key default gen_random_uuid(),
  email       text        not null unique,
  role        user_role   not null,
  full_name   text        not null default '',
  invited_by  uuid        references profiles (id) on delete set null,
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Brands / clients the work is for
-- ---------------------------------------------------------------------------
create table brands (
  id         uuid primary key default gen_random_uuid(),
  name       text        not null unique,
  color      text        not null default '#5b8def',
  is_active  boolean     not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tickets
-- ---------------------------------------------------------------------------
create sequence ticket_number_seq start 1000;

create table tickets (
  id              uuid primary key default gen_random_uuid(),
  number          int not null unique default nextval('ticket_number_seq'),
  title           text not null check (length(trim(title)) > 0),
  brief           text not null default '',
  reference_urls  text[] not null default '{}',

  format          creative_format not null,
  -- A ticket can ask for several units of one format ("5 statics"). Every
  -- per-unit metric divides by this, which is what makes minutes-per-static
  -- comparable across tickets of different sizes.
  quantity        int not null default 1 check (quantity between 1 and 200),

  status          ticket_status   not null default 'backlog',
  priority        ticket_priority not null default 'normal',

  brand_id        uuid references brands (id) on delete set null,
  created_by      uuid not null references profiles (id) on delete restrict,
  assigned_to     uuid references profiles (id) on delete set null,

  -- Where the work actually gets reviewed. Deliverables live in Frame.io, so
  -- the ticket carries the review link rather than the files themselves.
  review_url      text,

  due_at          timestamptz,
  -- Optional strategist estimate; benchmarks cover the rest.
  estimated_minutes int check (estimated_minutes > 0),

  -- Lifecycle stamps, all set by triggers so they can't drift from reality.
  started_at      timestamptz,
  submitted_at    timestamptz,
  approved_at     timestamptz,
  delivered_at    timestamptz,

  revision_count  int not null default 0,
  -- Board ordering. Float lets a card slot between two neighbours with a
  -- single UPDATE instead of renumbering the column.
  position        double precision not null default 0,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index tickets_status_position_idx on tickets (status, position);
create index tickets_assigned_idx        on tickets (assigned_to, status);
create index tickets_created_by_idx      on tickets (created_by);
create index tickets_brand_idx           on tickets (brand_id);
create index tickets_due_idx             on tickets (due_at) where status <> 'delivered';
create index tickets_delivered_at_idx    on tickets (delivered_at desc) where delivered_at is not null;

-- ---------------------------------------------------------------------------
-- Work sessions — the productivity substrate
-- ---------------------------------------------------------------------------
create table work_sessions (
  id                uuid primary key default gen_random_uuid(),
  ticket_id         uuid not null references tickets (id) on delete cascade,
  designer_id       uuid not null references profiles (id) on delete cascade,
  started_at        timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  ended_at          timestamptz,
  end_reason        session_end_reason,
  duration_seconds  int generated always as (
    case
      when ended_at is null then null
      else greatest(0, extract(epoch from (ended_at - started_at))::int)
    end
  ) stored,
  created_at        timestamptz not null default now(),
  constraint work_sessions_span_valid check (ended_at is null or ended_at >= started_at)
);

-- At most one live session per designer. This is the invariant that makes
-- "sum of sessions" equal "time actually worked" instead of double-counting.
create unique index work_sessions_one_open_per_designer
  on work_sessions (designer_id) where ended_at is null;

create index work_sessions_ticket_idx on work_sessions (ticket_id);
create index work_sessions_designer_day_idx on work_sessions (designer_id, started_at desc);
create index work_sessions_open_idx on work_sessions (last_heartbeat_at) where ended_at is null;

-- ---------------------------------------------------------------------------
-- Revision rounds, comments, attachments, activity
-- ---------------------------------------------------------------------------
create table ticket_revisions (
  id           uuid primary key default gen_random_uuid(),
  ticket_id    uuid not null references tickets (id) on delete cascade,
  round        int  not null,
  requested_by uuid not null references profiles (id) on delete restrict,
  notes        text not null default '',
  created_at   timestamptz not null default now(),
  unique (ticket_id, round)
);
create index ticket_revisions_ticket_idx on ticket_revisions (ticket_id, round);

create table comments (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references tickets (id) on delete cascade,
  author_id  uuid not null references profiles (id) on delete restrict,
  body       text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index comments_ticket_idx on comments (ticket_id, created_at);

create table attachments (
  id           uuid primary key default gen_random_uuid(),
  ticket_id    uuid not null references tickets (id) on delete cascade,
  uploaded_by  uuid not null references profiles (id) on delete restrict,
  storage_path text not null,
  file_name    text not null,
  mime_type    text not null default '',
  size_bytes   bigint not null default 0,
  -- Which revision round this deliverable belongs to; 0 = first submission.
  round        int not null default 0,
  created_at   timestamptz not null default now()
);
create index attachments_ticket_idx on attachments (ticket_id, created_at desc);

create table ticket_events (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references tickets (id) on delete cascade,
  actor_id   uuid references profiles (id) on delete set null,
  kind       text not null,       -- created | status | assigned | revision | comment | attachment
  from_value text,
  to_value   text,
  created_at timestamptz not null default now()
);
create index ticket_events_ticket_idx on ticket_events (ticket_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Benchmarks — the "expected" minutes a unit of each format should take.
-- Everything on the scorecard compares against these rather than against
-- other designers, which is the difference between a useful metric and a
-- leaderboard nobody trusts.
-- ---------------------------------------------------------------------------
create table format_benchmarks (
  format               creative_format primary key,
  target_minutes_per_unit int not null check (target_minutes_per_unit > 0),
  updated_by           uuid references profiles (id) on delete set null,
  updated_at           timestamptz not null default now()
);

insert into format_benchmarks (format, target_minutes_per_unit) values
  ('video', 120), ('static', 35), ('carousel', 75), ('gif', 45);

-- ---------------------------------------------------------------------------
-- Daily scorecards — one immutable row per designer per day
-- ---------------------------------------------------------------------------
create table daily_scorecards (
  id                uuid primary key default gen_random_uuid(),
  designer_id       uuid not null references profiles (id) on delete cascade,
  day               date not null,
  active_seconds    int  not null default 0,
  tickets_touched   int  not null default 0,
  tickets_completed int  not null default 0,
  units_completed   int  not null default 0,
  units_by_format   jsonb not null default '{}'::jsonb,
  seconds_by_format jsonb not null default '{}'::jsonb,
  first_pass_count  int  not null default 0,
  revision_rounds   int  not null default 0,
  on_time_count     int  not null default 0,
  late_count        int  not null default 0,
  -- benchmark minutes earned / minutes actually spent, x100
  efficiency_pct    int,
  generated_at      timestamptz not null default now(),
  unique (designer_id, day)
);
create index daily_scorecards_day_idx on daily_scorecards (day desc);

-- ===========================================================================
-- Helper functions
--
-- These are SECURITY DEFINER on purpose: a policy on `profiles` that reads
-- `profiles` would recurse, so the lookup has to step around RLS.
-- ===========================================================================

create or replace function auth_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin' and is_active
  )
$$;

create or replace function is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('admin', 'strategist') and is_active
  )
$$;

-- ---------------------------------------------------------------------------
-- New sign-ups become profiles. Role comes from a pending invite; the very
-- first admin is bootstrapped by email so there's a way in on a fresh project.
-- Anyone who shows up uninvited lands inactive and has to be approved.
-- ---------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_invite   invites%rowtype;
  v_role     user_role := 'designer';
  v_active   boolean   := false;
  v_name     text;
  v_bootstrap text := current_setting('app.bootstrap_admin_email', true);
begin
  select * into v_invite from invites
   where lower(email) = lower(new.email) and accepted_at is null;

  if found then
    v_role   := v_invite.role;
    v_active := true;
    update invites set accepted_at = now() where id = v_invite.id;
  elsif v_bootstrap is not null and lower(v_bootstrap) = lower(new.email) then
    v_role   := 'admin';
    v_active := true;
  elsif not exists (select 1 from profiles) then
    -- Empty instance: whoever gets there first owns it.
    v_role   := 'admin';
    v_active := true;
  end if;

  v_name := coalesce(
    nullif(v_invite.full_name, ''),
    new.raw_user_meta_data ->> 'full_name',
    split_part(new.email, '@', 1)
  );

  insert into profiles (id, email, full_name, role, is_active)
  values (new.id, new.email, v_name, v_role, v_active)
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Only admins may change somebody's role or switch their access off.
-- ---------------------------------------------------------------------------
create or replace function guard_profile_changes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null only for the service role and for internal triggers,
  -- both of which are already privileged. End users always have one.
  if auth.uid() is not null and not is_admin() then
    if new.role is distinct from old.role then
      raise exception 'Only an admin can change a role';
    end if;
    if new.is_active is distinct from old.is_active then
      raise exception 'Only an admin can change access';
    end if;
    if new.daily_capacity_minutes is distinct from old.daily_capacity_minutes then
      raise exception 'Only an admin can change working hours';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard
  before update on profiles
  for each row execute function guard_profile_changes();

-- ===========================================================================
-- Ticket lifecycle
-- ===========================================================================

-- Stamps and guard rails, applied before the row lands.
create or replace function stamp_ticket()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role user_role := auth_role();
begin
  new.updated_at := now();

  -- A designer picking work up owns it.
  if new.status in ('assigned', 'in_progress') and new.assigned_to is null then
    new.assigned_to := auth.uid();
  end if;

  if new.status is distinct from old.status then
    if new.status = 'in_progress' and new.started_at is null then
      new.started_at := now();
    elsif new.status = 'in_review' then
      new.submitted_at := now();
    elsif new.status = 'approved' then
      new.approved_at := coalesce(new.approved_at, now());
    elsif new.status = 'delivered' then
      new.delivered_at := coalesce(new.delivered_at, now());
      new.approved_at  := coalesce(new.approved_at, now());
    elsif new.status = 'revisions' then
      -- Kicking it back opens a new round and un-does any sign-off.
      new.revision_count := old.revision_count + 1;
      new.approved_at    := null;
    end if;
  end if;

  -- Designers drive their own lane and nothing else. Everything a strategist
  -- owns — the brief, the brand, the deadline, sign-off — stays put.
  if v_role = 'designer' then
    -- Only police the lane when the lane actually changes. Otherwise a
    -- designer couldn't touch a ticket parked in revisions or approved at
    -- all — including posting the new review link, which is the one thing
    -- they need to do there.
    if new.status is distinct from old.status
       and new.status not in ('assigned', 'in_progress', 'in_review') then
      raise exception 'A designer can move a ticket to assigned, in progress or in review only';
    end if;
    if new.assigned_to is distinct from old.assigned_to
       and new.assigned_to is distinct from auth.uid() then
      raise exception 'A designer can only assign work to themselves';
    end if;
    if (new.title, new.brief, new.format, new.quantity, new.brand_id, new.due_at,
        new.priority, new.created_by, new.estimated_minutes, new.revision_count)
       is distinct from
       (old.title, old.brief, old.format, old.quantity, old.brand_id, old.due_at,
        old.priority, old.created_by, old.estimated_minutes, old.revision_count) then
      raise exception 'A designer cannot edit the brief';
    end if;
  end if;

  return new;
end;
$$;

create trigger tickets_stamp
  before update on tickets
  for each row execute function stamp_ticket();

-- ---------------------------------------------------------------------------
-- The timer. Nobody starts or stops it by hand.
-- ---------------------------------------------------------------------------
create or replace function sync_work_session()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_designer uuid;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'in_progress' then
    v_designer := coalesce(new.assigned_to, auth.uid());
    if v_designer is not null then
      -- One clock per person: whatever they were on before stops here.
      update work_sessions
         set ended_at = now(), end_reason = 'switched'
       where designer_id = v_designer and ended_at is null;

      -- ...and the board has to agree with the clock. A ticket nobody is
      -- actively on drops back to 'assigned' — still theirs, just not live.
      -- (That UPDATE re-enters this trigger once on the else branch, where
      -- there is nothing left to close, so it settles immediately.)
      update tickets
         set status = 'assigned'
       where assigned_to = v_designer
         and status = 'in_progress'
         and id <> new.id;

      insert into work_sessions (ticket_id, designer_id)
      values (new.id, v_designer);
    end if;

  elsif old.status = 'in_progress' then
    update work_sessions
       set ended_at = now(), end_reason = 'status_change'
     where ticket_id = new.id and ended_at is null;
  end if;

  return new;
end;
$$;

create trigger tickets_sync_session
  after update on tickets
  for each row execute function sync_work_session();

-- ---------------------------------------------------------------------------
-- Activity feed
-- ---------------------------------------------------------------------------
create or replace function log_ticket_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into ticket_events (ticket_id, actor_id, kind, to_value)
    values (new.id, auth.uid(), 'created', new.status::text);
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into ticket_events (ticket_id, actor_id, kind, from_value, to_value)
    values (new.id, auth.uid(), 'status', old.status::text, new.status::text);
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    insert into ticket_events (ticket_id, actor_id, kind, from_value, to_value)
    values (new.id, auth.uid(), 'assigned', old.assigned_to::text, new.assigned_to::text);
  end if;

  return new;
end;
$$;

create trigger tickets_log_insert
  after insert on tickets
  for each row execute function log_ticket_event();

create trigger tickets_log_update
  after update on tickets
  for each row execute function log_ticket_event();

-- ===========================================================================
-- Heartbeat + idle trimming
-- ===========================================================================

-- Called by the open tab every 45s. Bumps the live session, or re-opens one
-- if an idle sweep closed it while the designer was away from the keyboard.
create or replace function heartbeat(p_ticket_id uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_user   uuid := auth.uid();
  v_status ticket_status;
  v_owner  uuid;
  v_hit    int;
begin
  if v_user is null then
    raise exception 'Not signed in';
  end if;

  select status, assigned_to into v_status, v_owner from tickets where id = p_ticket_id;
  if v_status is null then
    raise exception 'No such ticket';
  end if;
  if v_owner is distinct from v_user or v_status <> 'in_progress' then
    return null;   -- nothing to keep alive
  end if;

  update work_sessions
     set last_heartbeat_at = now()
   where ticket_id = p_ticket_id and designer_id = v_user and ended_at is null;

  get diagnostics v_hit = row_count;

  if v_hit = 0 then
    update work_sessions
       set ended_at = now(), end_reason = 'switched'
     where designer_id = v_user and ended_at is null;

    insert into work_sessions (ticket_id, designer_id) values (p_ticket_id, v_user);
  end if;

  return now();
end;
$$;

-- Ends sessions whose tab went quiet, rewinding the end to the last beat so
-- lunch never shows up as work.
create or replace function close_stale_sessions(p_grace_minutes int default 10)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_closed int;
begin
  update work_sessions
     set ended_at = last_heartbeat_at, end_reason = 'idle'
   where ended_at is null
     and last_heartbeat_at < now() - make_interval(mins => p_grace_minutes);
  get diagnostics v_closed = row_count;
  return v_closed;
end;
$$;

-- ===========================================================================
-- Reporting views
-- ===========================================================================

-- Live-safe totals: an open session counts up to right now.
create or replace view ticket_time as
select
  t.id as ticket_id,
  coalesce(sum(
    case when ws.ended_at is null
         then extract(epoch from (least(now(), ws.last_heartbeat_at + interval '2 minutes') - ws.started_at))::int
         else ws.duration_seconds end
  ), 0)::int as total_seconds,
  count(ws.id)::int as session_count,
  bool_or(ws.ended_at is null) as is_running
from tickets t
left join work_sessions ws on ws.ticket_id = t.id
group by t.id;

-- Per-format averages across finished work — the "how long does a static take
-- us" number, and the base for every benchmark comparison.
create or replace view format_throughput as
select
  t.format,
  t.assigned_to as designer_id,
  count(*)::int as tickets,
  sum(t.quantity)::int as units,
  sum(tt.total_seconds)::int as total_seconds,
  case when sum(t.quantity) > 0
       then round(sum(tt.total_seconds)::numeric / sum(t.quantity))::int
  end as seconds_per_unit,
  count(*) filter (where t.revision_count = 0)::int as first_pass_tickets
from tickets t
join ticket_time tt on tt.ticket_id = t.id
where t.approved_at is not null and t.assigned_to is not null
group by t.format, t.assigned_to;

alter view ticket_time set (security_invoker = on);
alter view format_throughput set (security_invoker = on);

-- ===========================================================================
-- Daily scorecard roll-up
--
-- Run once a night (Vercel Cron hits /api/cron/scorecards). Re-running for a
-- day is safe — it overwrites rather than appends.
-- ===========================================================================
create or replace function generate_daily_scorecards(p_day date default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_rows int;
begin
  with days as (
    -- Each designer's day is their own local day, not UTC's.
    select p.id as designer_id, p.timezone,
           coalesce(p_day, (now() at time zone p.timezone)::date - 1) as day
    from profiles p
    where p.role = 'designer' and p.is_active
  ),
  -- Time spent, split by format. An open session counts up to its last beat.
  spent as (
    select d.designer_id, d.day, t.format,
           sum(coalesce(
             ws.duration_seconds,
             greatest(0, extract(epoch from (ws.last_heartbeat_at - ws.started_at))::int)
           ))::int as seconds,
           count(distinct ws.ticket_id)::int as tickets
    from days d
    join work_sessions ws
      on ws.designer_id = d.designer_id
     and (ws.started_at at time zone d.timezone)::date = d.day
    join tickets t on t.id = ws.ticket_id
    group by d.designer_id, d.day, t.format
  ),
  spent_total as (
    select designer_id, day,
           sum(seconds)::int as active_seconds,
           sum(tickets)::int as tickets_touched,
           jsonb_object_agg(format, seconds) as seconds_by_format
    from spent group by designer_id, day
  ),
  -- Work signed off that day, and the benchmark minutes it was worth.
  finished as (
    select d.designer_id, d.day, t.format,
           count(*)::int as tickets,
           sum(t.quantity)::int as units,
           count(*) filter (where t.revision_count = 0)::int as first_pass,
           sum(t.revision_count)::int as rounds,
           count(*) filter (where t.due_at is not null and t.approved_at <= t.due_at)::int as on_time,
           count(*) filter (where t.due_at is not null and t.approved_at >  t.due_at)::int as late,
           sum(t.quantity * fb.target_minutes_per_unit)::int as earned_minutes
    from days d
    join tickets t
      on t.assigned_to = d.designer_id
     and t.approved_at is not null
     and (t.approved_at at time zone d.timezone)::date = d.day
    join format_benchmarks fb on fb.format = t.format
    group by d.designer_id, d.day, t.format
  ),
  finished_total as (
    select designer_id, day,
           sum(tickets)::int as tickets_completed,
           sum(units)::int   as units_completed,
           jsonb_object_agg(format, units) as units_by_format,
           sum(first_pass)::int as first_pass_count,
           sum(rounds)::int     as revision_rounds,
           sum(on_time)::int    as on_time_count,
           sum(late)::int       as late_count,
           sum(earned_minutes)::int as earned_minutes
    from finished group by designer_id, day
  )
  insert into daily_scorecards as ds (
    designer_id, day, active_seconds, tickets_touched, tickets_completed,
    units_completed, units_by_format, seconds_by_format, first_pass_count,
    revision_rounds, on_time_count, late_count, efficiency_pct, generated_at
  )
  select
    d.designer_id,
    d.day,
    coalesce(s.active_seconds, 0),
    coalesce(s.tickets_touched, 0),
    coalesce(f.tickets_completed, 0),
    coalesce(f.units_completed, 0),
    coalesce(f.units_by_format, '{}'::jsonb),
    coalesce(s.seconds_by_format, '{}'::jsonb),
    coalesce(f.first_pass_count, 0),
    coalesce(f.revision_rounds, 0),
    coalesce(f.on_time_count, 0),
    coalesce(f.late_count, 0),
    -- Benchmark minutes earned vs minutes actually spent. 100 = on the bar.
    case when coalesce(s.active_seconds, 0) > 0 and coalesce(f.earned_minutes, 0) > 0
         then round(f.earned_minutes * 6000.0 / s.active_seconds)::int end,
    now()
  from days d
  left join spent_total    s on s.designer_id = d.designer_id and s.day = d.day
  left join finished_total f on f.designer_id = d.designer_id and f.day = d.day
  -- A day with no work at all doesn't need a card.
  where s.designer_id is not null or f.designer_id is not null
  on conflict (designer_id, day) do update set
    active_seconds    = excluded.active_seconds,
    tickets_touched   = excluded.tickets_touched,
    tickets_completed = excluded.tickets_completed,
    units_completed   = excluded.units_completed,
    units_by_format   = excluded.units_by_format,
    seconds_by_format = excluded.seconds_by_format,
    first_pass_count  = excluded.first_pass_count,
    revision_rounds   = excluded.revision_rounds,
    on_time_count     = excluded.on_time_count,
    late_count        = excluded.late_count,
    efficiency_pct    = excluded.efficiency_pct,
    generated_at      = now();

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- ===========================================================================
-- Row level security
-- ===========================================================================
alter table profiles          enable row level security;
alter table invites           enable row level security;
alter table brands            enable row level security;
alter table tickets           enable row level security;
alter table work_sessions     enable row level security;
alter table ticket_revisions  enable row level security;
alter table comments          enable row level security;
alter table attachments       enable row level security;
alter table ticket_events     enable row level security;
alter table format_benchmarks enable row level security;
alter table daily_scorecards  enable row level security;

-- Profiles: the whole team is visible (you need names on cards), but only
-- admins rewrite anyone else's row.
create policy profiles_read on profiles
  for select to authenticated using (true);
create policy profiles_self_update on profiles
  for update to authenticated using (id = auth.uid() or is_admin())
  with check (id = auth.uid() or is_admin());
create policy profiles_admin_insert on profiles
  for insert to authenticated with check (is_admin());

-- Invites: admin-only.
create policy invites_admin_all on invites
  for all to authenticated using (is_admin()) with check (is_admin());

-- Brands: everyone reads, staff maintains.
create policy brands_read on brands
  for select to authenticated using (true);
create policy brands_staff_write on brands
  for all to authenticated using (is_staff()) with check (is_staff());

-- Tickets: staff see the whole pipeline. Designers see their own work plus
-- the unclaimed backlog they're allowed to pick from.
create policy tickets_read on tickets
  for select to authenticated using (
    is_staff()
    or assigned_to = auth.uid()
    or (assigned_to is null and status = 'backlog')
  );
create policy tickets_staff_insert on tickets
  for insert to authenticated with check (is_staff() and created_by = auth.uid());
create policy tickets_update on tickets
  for update to authenticated using (
    is_staff()
    or assigned_to = auth.uid()
    or (assigned_to is null and status = 'backlog')
  ) with check (
    is_staff() or assigned_to = auth.uid()
  );
create policy tickets_admin_delete on tickets
  for delete to authenticated using (is_admin());

-- Work sessions: a designer's raw log belongs to them and to the admin.
-- Strategists get delivery status, not somebody's keystroke timeline.
create policy work_sessions_read on work_sessions
  for select to authenticated using (designer_id = auth.uid() or is_admin());

-- Deliberately no INSERT or UPDATE policy. Sessions are written only by the
-- SECURITY DEFINER trigger and the heartbeat function, so nobody — designer
-- included — can hand-edit their own start time. Derived, not self-reported,
-- is the whole promise; this is where it's actually enforced.

-- Everything hanging off a ticket inherits that ticket's visibility.
create policy revisions_read on ticket_revisions
  for select to authenticated using (
    exists (select 1 from tickets t where t.id = ticket_id)
  );
create policy revisions_staff_write on ticket_revisions
  for insert to authenticated with check (is_staff() and requested_by = auth.uid());

create policy comments_read on comments
  for select to authenticated using (
    exists (select 1 from tickets t where t.id = ticket_id)
  );
create policy comments_write on comments
  for insert to authenticated with check (author_id = auth.uid());
create policy comments_own_update on comments
  for update to authenticated using (author_id = auth.uid())
  with check (author_id = auth.uid());
create policy comments_own_delete on comments
  for delete to authenticated using (author_id = auth.uid() or is_admin());

create policy attachments_read on attachments
  for select to authenticated using (
    exists (select 1 from tickets t where t.id = ticket_id)
  );
create policy attachments_write on attachments
  for insert to authenticated with check (uploaded_by = auth.uid());
create policy attachments_delete on attachments
  for delete to authenticated using (uploaded_by = auth.uid() or is_admin());

create policy events_read on ticket_events
  for select to authenticated using (
    exists (select 1 from tickets t where t.id = ticket_id)
  );

-- Benchmarks: everybody should be able to see the bar they're measured
-- against. Only an admin moves it.
create policy benchmarks_read on format_benchmarks
  for select to authenticated using (true);
create policy benchmarks_admin_write on format_benchmarks
  for all to authenticated using (is_admin()) with check (is_admin());

-- Scorecards: yours, or everyone's if you're the admin.
create policy scorecards_read on daily_scorecards
  for select to authenticated using (designer_id = auth.uid() or is_admin());

-- ===========================================================================
-- Realtime — the board and ticket pages patch their cache from these.
-- ===========================================================================
do $$
begin
  alter publication supabase_realtime add table tickets;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table comments;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table work_sessions;
exception when duplicate_object then null;
end $$;

-- ===========================================================================
-- Storage for deliverables
-- ===========================================================================
insert into storage.buckets (id, name, public)
values ('creative-assets', 'creative-assets', false)
on conflict (id) do nothing;

drop policy if exists "assets readable by signed-in team" on storage.objects;
create policy "assets readable by signed-in team" on storage.objects
  for select to authenticated using (bucket_id = 'creative-assets');

drop policy if exists "assets uploadable by signed-in team" on storage.objects;
create policy "assets uploadable by signed-in team" on storage.objects
  for insert to authenticated with check (bucket_id = 'creative-assets');

drop policy if exists "assets removable by owner or admin" on storage.objects;
create policy "assets removable by owner or admin" on storage.objects
  for delete to authenticated using (
    bucket_id = 'creative-assets' and (owner = auth.uid() or is_admin())
  );

-- ===========================================================================
-- Grants
--
-- Supabase does configure default privileges for the public schema, but
-- spelling them out keeps this migration portable and makes the intent
-- reviewable: RLS decides which ROWS you touch, grants decide which TABLES.
-- ===========================================================================
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on
  profiles, invites, brands, tickets, work_sessions, ticket_revisions,
  comments, attachments, ticket_events, format_benchmarks, daily_scorecards
to authenticated;

grant select on ticket_time, format_throughput to authenticated;
grant usage, select on sequence ticket_number_seq to authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- The tab's keep-alive is the only timing function the browser may call.
grant execute on function heartbeat(uuid) to authenticated;

-- Roll-ups and the idle sweep are cron work, not client work.
revoke execute on function generate_daily_scorecards(date) from public, anon, authenticated;
revoke execute on function close_stale_sessions(int)      from public, anon, authenticated;
grant  execute on function generate_daily_scorecards(date) to service_role;
grant  execute on function close_stale_sessions(int)       to service_role;

-- ===========================================================================
-- Team-level reporting
--
-- Strategists need planning numbers ("what does a carousel cost us") without
-- getting a window into any individual's day. These return the aggregate only
-- — no designer column — so the split stays a property of the API rather than
-- something the UI is trusted to remember.
-- ===========================================================================
create or replace function team_format_stats(p_from date, p_to date)
returns table (
  format             creative_format,
  tickets            int,
  units              int,
  total_seconds      bigint,
  seconds_per_unit   int,
  first_pass_tickets int,
  on_time_tickets    int,
  dated_tickets      int,
  revision_rounds    int
) language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff() then
    raise exception 'Not permitted';
  end if;

  return query
  select
    t.format,
    count(*)::int,
    sum(t.quantity)::int,
    sum(tt.total_seconds)::bigint,
    case when sum(t.quantity) > 0
         then round(sum(tt.total_seconds)::numeric / sum(t.quantity))::int end,
    count(*) filter (where t.revision_count = 0)::int,
    count(*) filter (where t.due_at is not null and t.approved_at <= t.due_at)::int,
    count(*) filter (where t.due_at is not null)::int,
    sum(t.revision_count)::int
  from tickets t
  join ticket_time tt on tt.ticket_id = t.id
  where t.approved_at is not null
    and t.approved_at >= p_from::timestamptz
    and t.approved_at <  (p_to + 1)::timestamptz
  group by t.format;
end;
$$;

create or replace function team_daily_output(p_from date, p_to date)
returns table (
  day           date,
  units         int,
  tickets       int,
  active_seconds bigint
) language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff() then
    raise exception 'Not permitted';
  end if;

  return query
  select
    d::date,
    coalesce(sum(t.quantity), 0)::int,
    count(t.id)::int,
    coalesce(sum(tt.total_seconds), 0)::bigint
  from generate_series(p_from, p_to, interval '1 day') as d
  left join tickets t
    on t.approved_at is not null
   and t.approved_at >= d
   and t.approved_at <  d + interval '1 day'
  left join ticket_time tt on tt.ticket_id = t.id
  group by d
  order by d;
end;
$$;

grant execute on function team_format_stats(date, date) to authenticated;
grant execute on function team_daily_output(date, date) to authenticated;
