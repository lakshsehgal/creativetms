-- ===========================================================================
-- 0014 — Shoot days, and what an operator may touch
--
-- Two things.
--
-- 1. Some designers are videographers too. When one of them is on a shoot
--    their day is gone, and nothing in the tool knew that — the workload grid
--    showed a full eight hours, and a strategist could brief them for the same
--    afternoon they were standing in somebody's warehouse.
--
--    A block is a slice of a person's day that is not available. Whole day,
--    or a time range. It comes out of their capacity everywhere capacity is
--    counted, and a strategist gets warned before assigning into it.
--
--    It is a warning, not a wall. Shoots move, people come back early, and a
--    tool that refuses the brief outright just gets worked around in Slack.
--
-- 2. Operators get the Team and Brands screens, and can mark shoots. They
--    cannot touch an admin's role or access — that stays with admins, and the
--    check is in the database rather than in the UI that hides the button.
--
-- Safe to run more than once.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Blocks
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'block_kind') then
    create type block_kind as enum ('shoot', 'leave', 'holiday', 'other');
  end if;
end
$$;

create table if not exists availability_blocks (
  id          uuid primary key default gen_random_uuid(),
  designer_id uuid not null references profiles (id) on delete cascade,
  day         date not null,
  -- Both null means the whole day. Otherwise a range within it.
  start_time  time,
  end_time    time,
  -- Filled by the trigger below; null means "the whole day, whatever that is
  -- for this person", which is the only honest answer before you know whose
  -- day it is.
  minutes     int,
  kind        block_kind not null default 'shoot',
  note        text not null default '',
  created_by  uuid references profiles (id) on delete set null,
  created_at  timestamptz not null default now(),

  constraint availability_blocks_range check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and end_time > start_time)
  )
);

create index if not exists availability_blocks_day_idx
  on availability_blocks (designer_id, day);

/** Minutes are derived from the range, so the two can never disagree. */
create or replace function stamp_block_minutes()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.start_time is null then
    new.minutes := null;               -- whole day
  else
    new.minutes := ceil(extract(epoch from (new.end_time - new.start_time)) / 60)::int;
  end if;
  return new;
end;
$$;

drop trigger if exists availability_blocks_stamp on availability_blocks;
create trigger availability_blocks_stamp
  before insert or update on availability_blocks
  for each row execute function stamp_block_minutes();

alter table availability_blocks enable row level security;

-- Everyone signed in can see who is out and when. A shoot schedule is not
-- private, and a strategist can only be warned about what they can read.
drop policy if exists availability_blocks_read on availability_blocks;
create policy availability_blocks_read on availability_blocks
  for select to authenticated using (true);

-- Admins and operators write them. A designer marking their own shoot would
-- be convenient and is deliberately not allowed: capacity somebody else plans
-- against is not a thing to edit unilaterally.
drop policy if exists availability_blocks_write on availability_blocks;
create policy availability_blocks_write on availability_blocks
  for all to authenticated using (is_analyst()) with check (is_analyst());

grant select, insert, update, delete on availability_blocks to authenticated;

-- ---------------------------------------------------------------------------
-- What an operator may change on a profile
--
-- Admins: everything, as before.
-- Operators: working hours, and role or access for designers and strategists.
-- Never an admin's or another operator's role or access — that is the line the
-- request drew, and it belongs here rather than in a hidden button.
-- ---------------------------------------------------------------------------

create or replace function guard_profile_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_operator boolean := is_analyst() and not is_admin();
begin
  -- auth.uid() is null only for the service role and for internal triggers,
  -- both of which are already privileged. End users always have one.
  if auth.uid() is null or is_admin() then
    return new;
  end if;

  if v_operator then
    -- An operator may not promote themselves, nor demote the person who
    -- could undo it.
    if old.role::text in ('admin', 'operator')
       and (new.role is distinct from old.role or new.is_active is distinct from old.is_active)
    then
      raise exception 'Only an admin can change an admin or operator';
    end if;
    if new.role::text = 'admin' and old.role::text <> 'admin' then
      raise exception 'Only an admin can make someone an admin';
    end if;
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'Only an admin can change a role';
  end if;
  if new.is_active is distinct from old.is_active then
    raise exception 'Only an admin can change access';
  end if;
  if new.daily_capacity_minutes is distinct from old.daily_capacity_minutes then
    raise exception 'Only an admin can change working hours';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Operators get Brands and the benchmark table too.
-- ---------------------------------------------------------------------------

drop policy if exists brands_staff_update on brands;
create policy brands_staff_update on brands
  for update to authenticated using (is_staff() or is_analyst())
  with check (is_staff() or is_analyst());

drop policy if exists benchmarks_admin_write on format_benchmarks;
drop policy if exists benchmarks_write on format_benchmarks;
create policy benchmarks_write on format_benchmarks
  for all to authenticated using (is_analyst()) with check (is_analyst());

-- ---------------------------------------------------------------------------
-- Reading a person's day
--
-- Returns one row per designer per day in the window with what is blocked, so
-- the workload grid and the brief form ask the same question of the same
-- place rather than each doing their own arithmetic.
-- ---------------------------------------------------------------------------

create or replace function blocked_minutes(p_from date, p_to date)
returns table (
  designer_id uuid,
  day         date,
  minutes     int,
  whole_day   boolean,
  kinds       text[],
  notes       text[]
) language sql stable security invoker set search_path = public as $$
  select
    b.designer_id,
    b.day,
    -- A whole-day block has no minutes of its own; callers treat the flag as
    -- "all of it" against whatever that person's day is worth.
    coalesce(sum(b.minutes) filter (where b.minutes is not null), 0)::int,
    bool_or(b.minutes is null),
    array_agg(distinct b.kind::text),
    array_remove(array_agg(b.note order by b.created_at), '')
  from availability_blocks b
  where b.day >= p_from and b.day <= p_to
  group by b.designer_id, b.day;
$$;

grant execute on function blocked_minutes(date, date) to authenticated;
