-- ===========================================================================
-- 0011 — Deleting a ticket, and time broken down by what it was spent on
--
-- Two things.
--
-- 1. Tickets can be removed. The row is kept and stamped rather than
--    destroyed, because a hard DELETE takes the work sessions, comments and
--    activity trail with it and there is no getting those back. A removed
--    ticket disappears from every list and stops counting in the numbers; an
--    admin can put it back.
--
-- 2. Time can be read by *what it was*. The clock has recorded a phase on
--    every session since 0005 — original build, revision round, size change —
--    but nothing surfaced it per designer. The size-change number is the one
--    that matters most: resizing for Google Ads was invisible work before
--    this tool, and it is the reason a week can vanish with nothing new
--    shipped.
--
-- Safe to run more than once.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Soft delete
-- ---------------------------------------------------------------------------

alter table tickets add column if not exists deleted_at timestamptz;
alter table tickets add column if not exists deleted_by uuid references profiles (id) on delete set null;

create index if not exists tickets_live_idx on tickets (status, position) where deleted_at is null;

-- Hidden at the policy level rather than in every query, so a view added
-- later can't forget to filter.
drop policy if exists tickets_read on tickets;
create policy tickets_read on tickets
  for select to authenticated using (
    (deleted_at is null or is_admin())
    and (
      is_staff()
      or is_analyst()
      or assigned_to = auth.uid()
      or (assigned_to is null and status = 'new_request')
    )
  );

/**
 * Remove a ticket.
 *
 * Admins can remove anything. Anyone else can only remove a brief they
 * raised themselves, while it is still untouched — nobody has been assigned,
 * the status has not moved, and no clock has ever run against it. That covers
 * the case this is actually for, which is raising the same brief twice,
 * without giving a strategist a way to erase a designer's afternoon.
 */
create or replace function delete_ticket(p_ticket_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ticket   tickets%rowtype;
  v_sessions int;
begin
  select * into v_ticket from tickets where id = p_ticket_id;
  if not found then
    raise exception 'That ticket no longer exists';
  end if;
  if v_ticket.deleted_at is not null then
    return; -- already gone; deleting twice is not an error
  end if;

  if not is_admin() then
    if v_ticket.created_by <> auth.uid() then
      raise exception 'Only an admin can remove a ticket somebody else raised';
    end if;
    if v_ticket.status <> 'new_request' or v_ticket.assigned_to is not null then
      raise exception 'This one is already moving. Ask an admin to remove it';
    end if;
    select count(*) into v_sessions from work_sessions where ticket_id = p_ticket_id;
    if v_sessions > 0 then
      raise exception 'Someone has already worked on this. Ask an admin to remove it';
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

/**
 * Put a removed ticket back.
 *
 * Admins can restore anything. So can whoever removed it — undoing your own
 * click in the next few seconds is the single most likely reason anyone
 * reaches for this, and making them find an admin for it would be silly.
 */
create or replace function restore_ticket(p_ticket_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (
    is_admin()
    or exists (
      select 1 from tickets
      where id = p_ticket_id and deleted_by = auth.uid()
    )
  ) then
    raise exception 'Only an admin, or whoever removed it, can restore a ticket';
  end if;

  update tickets set deleted_at = null, deleted_by = null where id = p_ticket_id;

  insert into ticket_events (ticket_id, actor_id, kind, from_value, to_value)
  values (p_ticket_id, auth.uid(), 'restored', null, null);
end;
$$;

grant execute on function delete_ticket(uuid)  to authenticated;
grant execute on function restore_ticket(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Phase analytics
--
-- All three are SECURITY DEFINER and refuse anyone who isn't an admin or an
-- operator. Per-designer timings are management information: a strategist
-- gets delivery status, and a designer gets their own finished totals, but
-- neither gets the studio's clock.
-- ---------------------------------------------------------------------------

/**
 * Every designer, every phase, over a window.
 *
 * A session counts against the day it *started*, which is how a scorecard
 * reads and how anyone remembers a working day — a session running past
 * midnight belongs to the shift it began in, not to two days.
 */
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

/**
 * The same, cut by format as well — which is what answers "how long does a
 * round of static resizes actually cost us".
 */
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

/**
 * The studio's shape over time: one row per day per phase, for the trend.
 */
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

grant execute on function designer_phase_breakdown(date, date) to authenticated;
grant execute on function designer_format_phase(date, date)    to authenticated;
grant execute on function studio_phase_daily(date, date)       to authenticated;
