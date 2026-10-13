-- ===========================================================================
-- 0026 — Time tracking, removed
--
-- The studio no longer measures how long a piece of work takes. Moving a
-- ticket into In Progress used to open a work session, a heartbeat kept it
-- alive and a sweep closed it; scorecards and analytics were built on the
-- minutes that produced. All of that goes:
--
--   - the trigger that opened and closed sessions on status changes
--   - heartbeat(), the idle sweep, and the Break button's two functions
--   - the work_sessions table itself, and every view and report reading it
--   - the time columns on daily_scorecards (active time, time per format,
--     efficiency) and the break columns on profiles
--
-- What stays: statuses and their lifecycle stamps (started_at is when a
-- ticket was first picked up, not a clock), the work phase on each ticket
-- (it labels revision rounds), and format benchmarks — they are planning
-- estimates for the Workload view and My Day, not a bar anyone is timed
-- against.
--
-- THIS DELETES THE HISTORICAL SESSION LOG. If you want a copy, export
-- work_sessions from the Table Editor before running it.
--
-- Safe to run more than once. Needs 0025.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- The clock and everything that drove it
-- ---------------------------------------------------------------------------
drop trigger if exists tickets_sync_session on tickets;
drop function if exists sync_work_session();
drop function if exists heartbeat(uuid);
drop function if exists close_stale_sessions(int);
drop function if exists start_break();
drop function if exists end_break();

alter table profiles drop column if exists break_started_at;
alter table profiles drop column if exists break_ticket_id;

-- ---------------------------------------------------------------------------
-- Reports that only ever measured time
-- ---------------------------------------------------------------------------
drop function if exists designer_phase_breakdown(date, date);
drop function if exists designer_format_phase(date, date);
drop function if exists studio_phase_daily(date, date);
drop view if exists ticket_time_by_phase;

-- ---------------------------------------------------------------------------
-- Team reporting, without the minutes
--
-- Dropped and recreated rather than replaced: Postgres won't change a
-- function's return type in place.
-- ---------------------------------------------------------------------------
drop function if exists team_format_stats(date, date);
create function team_format_stats(p_from date, p_to date)
returns table (
  format             creative_format,
  tickets            int,
  units              int,
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
    count(*) filter (where t.revision_count = 0)::int,
    count(*) filter (where t.due_at is not null and t.approved_at <= t.due_at)::int,
    count(*) filter (where t.due_at is not null)::int,
    sum(t.revision_count)::int
  from tickets t
  where t.approved_at is not null
    and t.approved_at >= p_from::timestamptz
    and t.approved_at <  (p_to + 1)::timestamptz
  group by t.format;
end;
$$;

drop function if exists team_daily_output(date, date);
create function team_daily_output(p_from date, p_to date)
returns table (
  day     date,
  units   int,
  tickets int
) language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_staff() or is_analyst()) then
    raise exception 'Not permitted';
  end if;

  return query
  select
    d::date,
    coalesce(sum(t.quantity), 0)::int,
    count(t.id)::int
  from generate_series(p_from, p_to, interval '1 day') as d
  left join tickets t
    on t.approved_at is not null
   and t.approved_at >= d
   and t.approved_at <  d + interval '1 day'
  group by d
  order by d;
end;
$$;

grant execute on function team_format_stats(date, date) to authenticated;
grant execute on function team_daily_output(date, date) to authenticated;

drop view if exists format_throughput;
drop view if exists ticket_time;

-- ---------------------------------------------------------------------------
-- Today's plan no longer knows which card has a clock running on it
-- ---------------------------------------------------------------------------
drop function if exists todays_plan(date);

create function todays_plan(p_day date default null)
returns table (
  designer_id   uuid,
  designer_name text,
  ticket_id     uuid,
  ticket_number int,
  title         text,
  format        creative_format,
  quantity      int,
  status        ticket_status,
  brand_name    text,
  due_at        timestamptz
) language plpgsql stable security definer set search_path = public as $$
declare
  v_day date := coalesce(p_day, (now() at time zone 'Asia/Kolkata')::date);
begin
  if not (is_staff() or auth_role() = 'designer') then
    raise exception 'Not permitted';
  end if;

  return query
  select
    p.id,
    coalesce(nullif(p.full_name, ''), p.email),
    t.id,
    t.number,
    t.title,
    t.format,
    t.quantity,
    t.status,
    b.name,
    t.due_at
  from tickets t
  join profiles p on p.id = t.assigned_to
  left join brands b on b.id = t.brand_id
  where t.planned_for = v_day
    and t.deleted_at is null
    and (is_staff() or t.assigned_to = auth.uid())
  order by p.full_name, t.plan_position nulls last, t.due_at nulls last;
end;
$$;

grant execute on function todays_plan(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Removing a brief: "nobody has worked on it" now means nobody has picked it
-- up, judged by the ticket's own started_at stamp rather than a session count.
-- ---------------------------------------------------------------------------
create or replace function delete_ticket(p_ticket_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ticket tickets%rowtype;
begin
  select * into v_ticket from tickets where id = p_ticket_id;
  if not found then
    raise exception 'That ticket no longer exists';
  end if;
  if v_ticket.deleted_at is not null then
    return; -- already gone; deleting twice is not an error
  end if;

  if not is_analyst() then
    if v_ticket.created_by <> auth.uid() then
      raise exception 'Only an admin or an operator can remove a brief somebody else raised';
    end if;
    if v_ticket.started_at is not null then
      raise exception 'Someone has already worked on this. Ask an admin or an operator to remove it';
    end if;
  end if;

  update tickets
     set deleted_at = now(),
         deleted_by = auth.uid()
   where id = p_ticket_id;

  insert into ticket_events (ticket_id, actor_id, kind, from_value, to_value)
  values (p_ticket_id, auth.uid(), 'deleted', v_ticket.status::text, null);
end;
$$;

-- ---------------------------------------------------------------------------
-- The daily scorecard: what was delivered, how cleanly, and on time
-- ---------------------------------------------------------------------------
create or replace function generate_daily_scorecards(p_day date default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_rows int;
begin
  with days as (
    select p.id as designer_id, p.timezone,
           coalesce(p_day, (now() at time zone p.timezone)::date - 1) as day
    from profiles p
    where p.role = 'designer' and p.is_active
  ),
  finished as (
    select d.designer_id, d.day, t.format,
           count(*)::int as tickets,
           sum(t.quantity)::int as units,
           count(*) filter (where t.revision_count = 0)::int as first_pass,
           sum(t.revision_count)::int as rounds,
           count(*) filter (where t.due_at is not null and t.approved_at <= t.due_at)::int as on_time,
           count(*) filter (where t.due_at is not null and t.approved_at >  t.due_at)::int as late
    from days d
    join tickets t
      on t.assigned_to = d.designer_id
     and t.approved_at is not null
     and (t.approved_at at time zone d.timezone)::date = d.day
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
           sum(late)::int       as late_count
    from finished group by designer_id, day
  )
  insert into daily_scorecards as ds (
    designer_id, day, tickets_completed, units_completed, units_by_format,
    first_pass_count, revision_rounds, on_time_count, late_count, generated_at
  )
  select
    f.designer_id,
    f.day,
    f.tickets_completed,
    f.units_completed,
    f.units_by_format,
    f.first_pass_count,
    f.revision_rounds,
    f.on_time_count,
    f.late_count,
    now()
  from finished_total f
  on conflict (designer_id, day) do update set
    tickets_completed = excluded.tickets_completed,
    units_completed   = excluded.units_completed,
    units_by_format   = excluded.units_by_format,
    first_pass_count  = excluded.first_pass_count,
    revision_rounds   = excluded.revision_rounds,
    on_time_count     = excluded.on_time_count,
    late_count        = excluded.late_count,
    generated_at      = now();

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke execute on function generate_daily_scorecards(date) from public, anon, authenticated;
grant  execute on function generate_daily_scorecards(date) to service_role;

alter table daily_scorecards drop column if exists active_seconds;
alter table daily_scorecards drop column if exists seconds_by_format;
alter table daily_scorecards drop column if exists efficiency_pct;
alter table daily_scorecards drop column if exists tickets_touched;

-- Days that only ever had time on them, and nothing delivered, are empty now.
delete from daily_scorecards where tickets_completed = 0;

-- ---------------------------------------------------------------------------
-- The session log itself
-- ---------------------------------------------------------------------------
drop table if exists work_sessions;
drop type if exists session_end_reason;
