-- ===========================================================================
-- 0029 — Put time tracking back in the database
--
-- Production turned out to be missing the whole time-tracking cluster:
-- the work_sessions table, its enum, the trigger that opens and closes
-- sessions as tickets move, the heartbeat, the break functions, the idle
-- sweep, the three phase reports and the three reporting views. Every
-- screen that reads tracked time — the Time panel, Analytics, Scorecards —
-- and the admin's delete dialog failed with "relation does not exist".
--
-- Nothing in this project drops any of it, so it was removed by hand. This
-- recreates each piece to its latest definition, copied from the migration
-- that last wrote it (0001, 0005, 0007, 0011). Every step is a no-op where
-- the object already exists, so it is safe on a database that is right.
--
-- Time already spent before this ran is gone with the table; counting
-- starts again from here.
-- ===========================================================================

do $$ begin
  create type session_end_reason as enum ('status_change', 'switched', 'idle', 'manual', 'day_close', 'break');
exception when duplicate_object then null; end $$;
alter type session_end_reason add value if not exists 'break';
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

-- ---------------------------------------------------------------------------
-- The functions that write and read it, each as last defined
-- ---------------------------------------------------------------------------

-- Break state lives on the profile (0007). Harmless where it already does.
alter table profiles add column if not exists break_started_at timestamptz;
-- What they were on when they stepped away, so coming back resumes it rather
-- than making them find their place again.
alter table profiles add column if not exists break_ticket_id uuid
  references tickets (id) on delete set null;

/** Opens a session when a ticket goes In Progress; closes it when it leaves. (0005) */
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
      update work_sessions
         set ended_at = now(), end_reason = 'switched'
       where designer_id = v_designer and ended_at is null;

      insert into work_sessions (ticket_id, designer_id, phase)
      values (new.id, v_designer, new.work_phase);
    end if;

  elsif old.status = 'in_progress' then
    update work_sessions
       set ended_at = now(), end_reason = 'status_change'
     where ticket_id = new.id and ended_at is null;
  end if;

  return new;
end;
$$;

drop trigger if exists tickets_sync_session on public.tickets;
create trigger tickets_sync_session
  after update on public.tickets
  for each row execute function sync_work_session();

/** The browser's pulse while a ticket is open. Never revives a session during a break. (0007) */
create or replace function heartbeat(p_ticket_id uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_user   uuid := auth.uid();
  v_status ticket_status;
  v_owner  uuid;
  v_break  timestamptz;
  v_hit    int;
begin
  if v_user is null then
    raise exception 'Not signed in';
  end if;

  select break_started_at into v_break from profiles where id = v_user;
  if v_break is not null then
    return null;   -- on a break; the clock stays stopped
  end if;

  select status, assigned_to into v_status, v_owner from tickets where id = p_ticket_id;
  if v_status is null then
    raise exception 'No such ticket';
  end if;
  if v_owner is distinct from v_user or v_status <> 'in_progress' then
    return null;
  end if;

  update work_sessions
     set last_heartbeat_at = now()
   where ticket_id = p_ticket_id and designer_id = v_user and ended_at is null;

  get diagnostics v_hit = row_count;

  if v_hit = 0 then
    update work_sessions
       set ended_at = now(), end_reason = 'switched'
     where designer_id = v_user and ended_at is null;

    insert into work_sessions (ticket_id, designer_id, phase)
    select p_ticket_id, v_user, work_phase from tickets where id = p_ticket_id;
  end if;

  return now();
end;
$$;

/** Ends sessions whose tab went quiet, backdating the end to the last pulse. (0001) */
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

/** Breaks: the clock stops without the ticket moving. (0007) */
create or replace function start_break()
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_user   uuid := auth.uid();
  v_ticket uuid;
begin
  if v_user is null then
    raise exception 'Not signed in';
  end if;

  select ticket_id into v_ticket
  from work_sessions
  where designer_id = v_user and ended_at is null
  limit 1;

  update work_sessions
     set ended_at = now(), end_reason = 'break'::session_end_reason
   where designer_id = v_user and ended_at is null;

  update profiles
     set break_started_at = now(),
         break_ticket_id  = v_ticket
   where id = v_user;

  return now();
end;
$$;

create or replace function end_break()
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user   uuid := auth.uid();
  v_ticket uuid;
  v_status ticket_status;
  v_phase  work_phase;
begin
  if v_user is null then
    raise exception 'Not signed in';
  end if;

  select break_ticket_id into v_ticket from profiles where id = v_user;

  update profiles
     set break_started_at = null,
         break_ticket_id  = null
   where id = v_user;

  if v_ticket is null then
    return null;
  end if;

  select status, work_phase into v_status, v_phase from tickets where id = v_ticket;

  -- Only pick the clock back up if the ticket is still theirs and still live.
  if v_status = 'in_progress'
     and exists (select 1 from tickets where id = v_ticket and assigned_to = v_user) then
    update work_sessions
       set ended_at = now(), end_reason = 'switched'
     where designer_id = v_user and ended_at is null;

    insert into work_sessions (ticket_id, designer_id, phase)
    values (v_ticket, v_user, coalesce(v_phase, 'initial'));

    return v_ticket;
  end if;

  return null;
end;
$$;

/** The phase reports Analytics reads. (0011) */
create or replace function designer_phase_breakdown(p_from date, p_to date)
returns table (
  designer_id   uuid,
  designer_name text,
  phase         work_phase,
  total_seconds bigint,
  sessions      int,
  tickets       int
) language plpgsql stable security definer set search_path = public as $$
begin
  if not is_analyst() then
    raise exception 'Not allowed';
  end if;

  return query
  select
    p.id,
    coalesce(nullif(p.full_name, ''), p.email),
    ws.phase,
    sum(coalesce(
      ws.duration_seconds,
      greatest(0, extract(epoch from (least(now(), ws.last_heartbeat_at) - ws.started_at))::int)
    ))::bigint,
    count(*)::int,
    count(distinct ws.ticket_id)::int
  from work_sessions ws
  join profiles p on p.id = ws.designer_id
  join tickets  t on t.id = ws.ticket_id
  where ws.started_at >= p_from
    and ws.started_at <  (p_to + 1)
    -- A removed ticket is one that should never have existed, so its time
    -- stops counting the moment it goes.
    and t.deleted_at is null
  group by p.id, p.full_name, p.email, ws.phase;
end;
$$;

create or replace function designer_format_phase(p_from date, p_to date)
returns table (
  designer_id   uuid,
  format        creative_format,
  phase         work_phase,
  total_seconds bigint,
  tickets       int,
  units         int
) language plpgsql stable security definer set search_path = public as $$
begin
  if not is_analyst() then
    raise exception 'Not allowed';
  end if;

  -- Two passes on purpose. Quantity belongs to the ticket, not to the
  -- session, so summing it straight across sessions would multiply it by
  -- however many times the ticket was picked up and put down. The inner
  -- query collapses to one row per ticket first.
  return query
  with per_ticket as (
    select
      ws.designer_id as d_id,
      t.format       as t_format,
      ws.phase       as w_phase,
      ws.ticket_id   as t_id,
      max(t.quantity) as quantity,
      sum(coalesce(
        ws.duration_seconds,
        greatest(0, extract(epoch from (least(now(), ws.last_heartbeat_at) - ws.started_at))::int)
      ))::bigint as seconds
    from work_sessions ws
    join tickets t on t.id = ws.ticket_id
    where ws.started_at >= p_from
      and ws.started_at <  (p_to + 1)
      and t.deleted_at is null
    group by ws.designer_id, t.format, ws.phase, ws.ticket_id
  )
  select
    per_ticket.d_id,
    per_ticket.t_format,
    per_ticket.w_phase,
    sum(per_ticket.seconds)::bigint,
    count(*)::int,
    sum(per_ticket.quantity)::int
  from per_ticket
  group by per_ticket.d_id, per_ticket.t_format, per_ticket.w_phase;
end;
$$;

create or replace function studio_phase_daily(p_from date, p_to date)
returns table (
  day           date,
  phase         work_phase,
  total_seconds bigint
) language plpgsql stable security definer set search_path = public as $$
begin
  if not is_analyst() then
    raise exception 'Not allowed';
  end if;

  return query
  select
    (ws.started_at at time zone 'Asia/Kolkata')::date,
    ws.phase,
    sum(coalesce(
      ws.duration_seconds,
      greatest(0, extract(epoch from (least(now(), ws.last_heartbeat_at) - ws.started_at))::int)
    ))::bigint
  from work_sessions ws
  join tickets t on t.id = ws.ticket_id
  where ws.started_at >= p_from
    and ws.started_at <  (p_to + 1)
    and t.deleted_at is null
  group by 1, 2;
end;
$$;

grant execute on function heartbeat(uuid)                       to authenticated;
grant execute on function start_break()                         to authenticated;
grant execute on function end_break()                           to authenticated;
grant execute on function designer_phase_breakdown(date, date)  to authenticated;
grant execute on function designer_format_phase(date, date)     to authenticated;
grant execute on function studio_phase_daily(date, date)        to authenticated;

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
