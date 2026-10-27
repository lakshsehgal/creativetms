-- ===========================================================================
-- 0029 — Put the work_sessions table back
--
-- Production turned out not to have it: `to_regclass('public.work_sessions')`
-- came back null, so every function that reads it (the heartbeat, the
-- scorecards, Analytics, user_footprint) failed with "relation does not
-- exist". Nothing in this project drops that table, so either 0001 did not
-- finish on that database or it was removed by hand.
--
-- This recreates it to the shape the latest code expects — 0001's table plus
-- 0005's phase column — with its indexes, its policy, its realtime feed and
-- the trigger that opens and closes sessions as tickets move. Every step is
-- a no-op where the thing already exists, so it is safe on a database that
-- is already right.
-- ===========================================================================

do $$ begin
  create type session_end_reason as enum ('status_change', 'switched', 'idle', 'manual', 'day_close');
exception when duplicate_object then null; end $$;
do $$ begin
  create type work_phase as enum ('initial', 'revision', 'size_change');
exception when duplicate_object then null; end $$;

create table if not exists public.work_sessions (
  id                uuid primary key default gen_random_uuid(),
  ticket_id         uuid not null references public.tickets (id) on delete cascade,
  designer_id       uuid not null references public.profiles (id) on delete cascade,
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
  phase             work_phase not null default 'initial',
  constraint work_sessions_span_valid check (ended_at is null or ended_at >= started_at)
);

-- In case the table survived from 0001 but 0005 never ran against it.
alter table public.work_sessions add column if not exists phase work_phase not null default 'initial';

create unique index if not exists work_sessions_one_open_per_designer
  on public.work_sessions (designer_id) where ended_at is null;
create index if not exists work_sessions_ticket_idx       on public.work_sessions (ticket_id);
create index if not exists work_sessions_designer_day_idx on public.work_sessions (designer_id, started_at desc);
create index if not exists work_sessions_open_idx         on public.work_sessions (last_heartbeat_at) where ended_at is null;
create index if not exists work_sessions_phase_idx        on public.work_sessions (ticket_id, phase);

alter table public.work_sessions enable row level security;

-- The designer's own rows, and everything for the admin and the operator.
-- No insert or update policy on purpose: sessions are written only by the
-- security-definer trigger and the heartbeat, never by hand.
drop policy if exists work_sessions_read on public.work_sessions;
create policy work_sessions_read on public.work_sessions
  for select to authenticated using (designer_id = auth.uid() or is_analyst());

grant select on public.work_sessions to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.work_sessions;
exception when duplicate_object then null; end $$;

-- The trigger that turns board moves into sessions. The function itself is
-- already in place (0005's version); only its attachment to tickets needs
-- to be certain.
drop trigger if exists tickets_sync_session on public.tickets;
create trigger tickets_sync_session
  after update on public.tickets
  for each row execute function sync_work_session();

-- ---------------------------------------------------------------------------
-- Dropping the table takes three views down with it. Back, as last defined.
-- ---------------------------------------------------------------------------

-- Live-safe totals: an open session counts up to right now.
create or replace view public.ticket_time as
select
  t.id as ticket_id,
  coalesce(sum(
    case when ws.ended_at is null
         then extract(epoch from (least(now(), ws.last_heartbeat_at + interval '2 minutes') - ws.started_at))::int
         else ws.duration_seconds end
  ), 0)::int as total_seconds,
  count(ws.id)::int as session_count,
  bool_or(ws.ended_at is null) as is_running
from public.tickets t
left join public.work_sessions ws on ws.ticket_id = t.id
group by t.id;

-- Per-format averages across finished work.
create or replace view public.format_throughput as
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
from public.tickets t
join public.ticket_time tt on tt.ticket_id = t.id
where t.approved_at is not null and t.assigned_to is not null
group by t.format, t.assigned_to;

-- Per-phase time, for the ticket page and the scorecards.
create or replace view public.ticket_time_by_phase as
select
  ws.ticket_id,
  ws.phase,
  sum(coalesce(
    ws.duration_seconds,
    greatest(0, extract(epoch from (least(now(), ws.last_heartbeat_at) - ws.started_at))::int)
  ))::int as total_seconds,
  count(*)::int as sessions
from public.work_sessions ws
group by ws.ticket_id, ws.phase;

alter view public.ticket_time          set (security_invoker = on);
alter view public.format_throughput    set (security_invoker = on);
alter view public.ticket_time_by_phase set (security_invoker = on);

grant select on public.ticket_time, public.format_throughput, public.ticket_time_by_phase to authenticated;
