-- ===========================================================================
-- 0013 — The designer decides the running order
--
-- Picking a ticket for today already worked: `planned_for` is set by the
-- designer and by nothing else. A brief raised with today's due date does NOT
-- land in anyone's day — it lands in their assigned list, and somebody has to
-- choose it. That was deliberate and stays.
--
-- What was missing is the order. Today's list came back sorted by priority
-- and due date, which is the studio's opinion of what matters, not the
-- designer's plan. Anyone who works by "the fiddly one first while I'm fresh,
-- the four resizes after lunch" had no way to say so.
--
-- `plan_position` is that running order. It only means anything for the day a
-- ticket is planned for, so it is cleared the moment the ticket leaves the
-- list — a stale position from last Tuesday must not decide next Tuesday.
--
-- Safe to run more than once.
-- ===========================================================================

alter table tickets add column if not exists plan_position double precision;

create index if not exists tickets_day_plan_idx
  on tickets (assigned_to, planned_for, plan_position)
  where planned_for is not null;

/**
 * Keep the position honest.
 *
 * Off the list, no position. Onto the list without one, it joins the bottom —
 * which is what "I'll also do this today" means. A position the client sent
 * on purpose (a drag) is left exactly alone.
 */
create or replace function stamp_plan_position()
returns trigger language plpgsql set search_path = public as $$
declare
  v_moved boolean := TG_OP = 'INSERT'
                     or new.planned_for is distinct from old.planned_for
                     or new.assigned_to is distinct from old.assigned_to;
begin
  if new.planned_for is null then
    new.plan_position := null;
  elsif new.plan_position is null or v_moved then
    select coalesce(max(t.plan_position), 0) + 1000
      into new.plan_position
      from tickets t
     where t.assigned_to is not distinct from new.assigned_to
       and t.planned_for = new.planned_for
       and t.id <> new.id;
  end if;

  return new;
end;
$$;

-- Runs after tickets_stamp, which is where moving to In Progress sets
-- planned_for. Same timing, so Postgres fires them in name order and
-- "tickets_z..." is reliably last.
drop trigger if exists tickets_zz_plan_position on tickets;
create trigger tickets_zz_plan_position
  before insert or update on tickets
  for each row execute function stamp_plan_position();

-- ---------------------------------------------------------------------------
-- Anything already on a plan gets a starting order, so nothing sits at the
-- top of the list purely because its position is null.
-- ---------------------------------------------------------------------------
with ordered as (
  select
    id,
    row_number() over (
      partition by assigned_to, planned_for
      order by
        case priority
          when 'urgent' then 0 when 'high' then 1
          when 'normal' then 2 else 3
        end,
        due_at nulls last,
        created_at
    ) * 1000.0 as position
  from tickets
  where planned_for is not null and plan_position is null
)
update tickets t
   set plan_position = ordered.position
  from ordered
 where ordered.id = t.id;

-- ---------------------------------------------------------------------------
-- The floor view follows the same order, so what a strategist sees on the
-- Today screen is the order the designer actually intends to work in.
--
-- The signature below is byte-for-byte the one from 0003. An earlier draft of
-- this migration retyped it from memory, quietly losing `ticket_number` and
-- renaming `brand_name`, and Postgres refused it: CREATE OR REPLACE cannot
-- change a function's return type (42P13). Only the ORDER BY and the
-- deleted-ticket filter actually change here.
--
-- It is dropped first rather than replaced, so this runs cleanly whatever
-- shape the function is currently in — including on a database where that
-- broken draft did land. Nothing calls it from the app, and the grant is
-- reinstated below.
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
  due_at        timestamptz,
  is_running    boolean
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
    t.due_at,
    exists (
      select 1 from work_sessions ws
      where ws.ticket_id = t.id and ws.ended_at is null
    )
  from tickets t
  join profiles p on p.id = t.assigned_to
  left join brands b on b.id = t.brand_id
  where t.planned_for = v_day
    and t.deleted_at is null
    -- A designer sees their own row; staff see the whole floor.
    and (is_staff() or t.assigned_to = auth.uid())
  -- The designer's own running order, not the studio's opinion of it.
  order by p.full_name, t.plan_position nulls last, t.due_at nulls last;
end;
$$;

grant execute on function todays_plan(date) to authenticated;
