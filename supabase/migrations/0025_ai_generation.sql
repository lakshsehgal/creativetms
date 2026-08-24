-- ===========================================================================
-- 0025 — Work that needs AI generation
--
-- Some creative now comes out of a generator before a designer touches it:
-- product shots that never existed, AI UGC avatars, image-to-video. It is
-- still a static or still a film when it ships, so the format is right — but
-- it takes materially longer to make. The prompt is written five times, the
-- render is waited on, most of the outputs are thrown away, and the ones kept
-- get fixed by hand.
--
-- Measured against the plain format benchmark, that designer looks slow. They
-- aren't. They did more work, and the tool was quietly telling everyone the
-- opposite — which is precisely the kind of dishonest number this app exists
-- not to produce.
--
-- Two pieces:
--
--   1. a flag on the ticket saying this one needs generating, and
--   2. an extra per-unit allowance on each format's benchmark, set from
--      observation by whoever sets the base one.
--
-- Additive per unit rather than a multiplier, because that is the shape of
-- the real cost: the extra is prompt iteration, render waits and culling, and
-- it repeats for each output rather than scaling with how polished the base
-- work is.
--
-- The flag is NOT in the list of fields only a strategist may touch. The
-- designer is usually the one who discovers that a brief needs generating —
-- it rarely says so — and making them ask somebody to record that is how you
-- end up with the honest version living in nobody's system. It shows on the
-- card and in the ticket's history, which is the check that matters here.
--
-- Safe to run more than once. Needs 0004.
-- ===========================================================================

alter table tickets
  add column if not exists needs_ai boolean not null default false;

comment on column tickets.needs_ai is
  'This creative has to be generated before it can be built. Carries an extra per-unit allowance from format_benchmarks.ai_extra_minutes_per_unit.';

alter table format_benchmarks
  add column if not exists ai_extra_minutes_per_unit int
    check (ai_extra_minutes_per_unit is null or ai_extra_minutes_per_unit > 0);

comment on column format_benchmarks.ai_extra_minutes_per_unit is
  'Minutes ON TOP of the base benchmark, per unit, when a ticket needs AI generation. Null means nobody has measured it yet.';

create index if not exists tickets_needs_ai_idx on tickets (needs_ai) where needs_ai;

/**
 * What a ticket is expected to cost, in minutes.
 *
 * One definition, so the scorecard and the app cannot drift apart on the
 * question everybody is judged by. A format with no base benchmark earns
 * nothing — null, deliberately, rather than a zero that would read as
 * "delivered instantly".
 */
create or replace function expected_minutes(
  p_format   creative_format,
  p_quantity int,
  p_needs_ai boolean default false
)
returns int language sql stable security definer set search_path = public as $$
  select case
    when fb.target_minutes_per_unit is null then null
    else (fb.target_minutes_per_unit
          + case when p_needs_ai then coalesce(fb.ai_extra_minutes_per_unit, 0) else 0 end)
         * greatest(1, p_quantity)
  end
  from format_benchmarks fb
  where fb.format = p_format;
$$;

grant execute on function expected_minutes(creative_format, int, boolean) to authenticated;

/**
 * The daily scorecard, crediting generation time.
 *
 * Byte-for-byte 0004 apart from one expression: earned_minutes. A ticket that
 * had to be generated earns the base allowance plus the extra, so the
 * efficiency figure — earned minutes against minutes actually spent — stops
 * marking somebody down for the part of the job that takes longest.
 *
 * This is the number designers see on their own scorecard. Getting it wrong
 * in this direction is the version that makes people distrust the tool, which
 * is why it is worth a whole migration.
 */
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
           -- but the ticket still counts as delivered work. A generated one
           -- earns the extra allowance on top, per unit.
           --
           -- The extra only applies where a base exists. Paying it on a format
           -- nobody has measured would credit a fraction of an unknown number
           -- and present it as the whole — which reads as a real figure and
           -- isn't one. expected_minutes() refuses the same case for the same
           -- reason, and these two must never disagree.
           sum(
             t.quantity * case
               when fb.target_minutes_per_unit is null then 0
               else fb.target_minutes_per_unit
                    + case when t.needs_ai then coalesce(fb.ai_extra_minutes_per_unit, 0) else 0 end
             end
           )::int as earned_minutes
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

/**
 * Turning generation on or off is worth a line in the ticket's history.
 *
 * It changes what the ticket is expected to cost, and anything that moves a
 * number people are measured by should be visible next to the work rather
 * than only in its effect.
 */
create or replace function log_needs_ai()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.needs_ai is distinct from old.needs_ai then
    insert into ticket_events (ticket_id, actor_id, kind, from_value, to_value)
    values (new.id, auth.uid(), 'needs_ai', old.needs_ai::text, new.needs_ai::text);
  end if;
  return new;
end;
$$;

drop trigger if exists tickets_log_needs_ai on tickets;
create trigger tickets_log_needs_ai
  after update of needs_ai on tickets
  for each row execute function log_needs_ai();
