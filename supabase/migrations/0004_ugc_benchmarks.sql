-- ===========================================================================
-- Un-benchmarked formats must still count
--
-- UGC arrived without a benchmark, and the nightly roll-up joined tickets to
-- format_benchmarks with an INNER join — so a finished UGC ticket was dropped
-- from the designer's completed count, units and on-time figures entirely. The
-- work happened and the scorecard didn't know about it.
--
-- A benchmark is now genuinely optional: the roll-up left-joins, so counts are
-- always right, and only the pace figure waits for a number to compare against.
-- That's the honest behaviour for a format like UGC, where the job is grade →
-- line-up → hand-place clips and the time per unit varies enough that guessing
-- a target up front would produce a number nobody trusts.
-- ===========================================================================

alter table format_benchmarks alter column target_minutes_per_unit drop not null;
alter table format_benchmarks drop constraint if exists format_benchmarks_target_minutes_per_unit_check;
alter table format_benchmarks
  add constraint format_benchmarks_target_positive
  check (target_minutes_per_unit is null or target_minutes_per_unit > 0);

-- UGC gets a row so it appears on the Team page, with no target yet.
insert into format_benchmarks (format, target_minutes_per_unit)
values ('ugc', null)
on conflict (format) do nothing;

-- ---------------------------------------------------------------------------
-- Roll-up, with the join fixed.
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
  finished as (
    select d.designer_id, d.day, t.format,
           count(*)::int as tickets,
           sum(t.quantity)::int as units,
           count(*) filter (where t.revision_count = 0)::int as first_pass,
           sum(t.revision_count)::int as rounds,
           count(*) filter (where t.due_at is not null and t.approved_at <= t.due_at)::int as on_time,
           count(*) filter (where t.due_at is not null and t.approved_at >  t.due_at)::int as late,
           -- LEFT JOIN: a format with no target earns no benchmark minutes,
           -- but the ticket still counts as delivered work.
           sum(t.quantity * coalesce(fb.target_minutes_per_unit, 0))::int as earned_minutes
    from days d
    join tickets t
      on t.assigned_to = d.designer_id
     and t.approved_at is not null
     and (t.approved_at at time zone d.timezone)::date = d.day
    left join format_benchmarks fb on fb.format = t.format
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
    case when coalesce(s.active_seconds, 0) > 0 and coalesce(f.earned_minutes, 0) > 0
         then round(f.earned_minutes * 6000.0 / s.active_seconds)::int end,
    now()
  from days d
  left join spent_total    s on s.designer_id = d.designer_id and s.day = d.day
  left join finished_total f on f.designer_id = d.designer_id and f.day = d.day
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

revoke execute on function generate_daily_scorecards(date) from public, anon, authenticated;
grant  execute on function generate_daily_scorecards(date) to service_role;
