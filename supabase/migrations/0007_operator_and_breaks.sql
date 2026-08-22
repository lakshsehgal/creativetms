-- ===========================================================================
-- Breaks, the Operator role, and who can see time
--
-- Two principles here:
--   * A break is real. Lunch is not work, and a designer shouldn't have to
--     choose between an honest number and looking slow.
--   * Time data is management information, not a scoreboard. Designers see
--     their own finished totals; strategists see none of it; only admins and
--     operators see the live picture.
-- ===========================================================================

-- NOTE: Postgres will not let a newly added enum value be USED in the same
-- transaction that adds it, and the Supabase SQL editor runs a script as one
-- transaction. Every comparison against these new values below is therefore
-- written against ::text, which the planner treats as an ordinary string
-- rather than a not-yet-committed enum literal. That keeps this file runnable
-- in a single pass.
alter type user_role add value if not exists 'operator';
alter type session_end_reason add value if not exists 'break';

-- ---------------------------------------------------------------------------
-- Break state lives on the profile
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists break_started_at timestamptz;
-- What they were on when they stepped away, so coming back resumes it rather
-- than making them find their place again.
alter table profiles add column if not exists break_ticket_id uuid
  references tickets (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Who may see timing data
-- ---------------------------------------------------------------------------
create or replace function is_analyst()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role::text in ('admin', 'operator') and is_active
  )
$$;

grant execute on function is_analyst() to authenticated;

-- Operators read the whole pipeline, but they don't run it.
create or replace function is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role::text in ('admin', 'strategist') and is_active
  )
$$;

drop policy if exists tickets_read on tickets;
create policy tickets_read on tickets
  for select to authenticated using (
    is_staff()
    or is_analyst()
    or assigned_to = auth.uid()
    or (assigned_to is null and status = 'new_request')
  );

-- A strategist gets delivery status, never the clock.
drop policy if exists work_sessions_read on work_sessions;
create policy work_sessions_read on work_sessions
  for select to authenticated using (designer_id = auth.uid() or is_analyst());

drop policy if exists scorecards_read on daily_scorecards;
create policy scorecards_read on daily_scorecards
  for select to authenticated using (designer_id = auth.uid() or is_analyst());

-- ---------------------------------------------------------------------------
-- Breaks
--
-- Starting one closes the live session; ending one re-opens a session on the
-- same ticket, so the total continues rather than restarting. Both are
-- SECURITY DEFINER because work_sessions is deliberately not writable by end
-- users — otherwise the honest-number guarantee is worth nothing.
-- ---------------------------------------------------------------------------
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

grant execute on function start_break() to authenticated;
grant execute on function end_break()   to authenticated;

-- The heartbeat must never revive a session while somebody is on a break.
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

-- ---------------------------------------------------------------------------
-- Team-level reporting is open to operators too
-- ---------------------------------------------------------------------------
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
  if not (is_staff() or is_analyst()) then
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
returns table (day date, units int, tickets int, active_seconds bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_staff() or is_analyst()) then
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
