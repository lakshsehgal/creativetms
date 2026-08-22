-- ===========================================================================
-- 0015 — Shoot ops
--
-- Four things, all of them about shoots being a first-class part of the week
-- rather than a footnote on the Team page.
--
-- 1. A "Shoot ops" flag. Some creative strategists effectively run production
--    — they know the call sheet before anyone else does. Rather than making
--    them operators (which would hand them the whole floor), an admin can give
--    that one strategist the ability to block bandwidth and open the Shoot
--    section, and nothing else.
--
-- 2. Everyone who raises briefs finds out when somebody gets booked out. A
--    strategist who learns on Thursday morning that their designer has been on
--    a shoot since Tuesday has already made a promise they can't keep.
--
-- 3. The shoot brief itself lives here, not in one person's browser. A call
--    sheet that only the person who typed it can see is a call sheet that gets
--    re-typed into WhatsApp at 11pm.
--
-- 4. A fix to 0014: it taught the profiles *trigger* what an operator may
--    change, but left the RLS *policy* at "yourself, or an admin" — so an
--    operator's edit never reached the trigger at all. The rule was right and
--    unreachable.
--
-- Safe to run more than once.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- The flag
-- ---------------------------------------------------------------------------

alter table profiles
  add column if not exists has_shoot_ops boolean not null default false;

comment on column profiles.has_shoot_ops is
  'Granted by an admin. Lets a strategist open the Shoot section and block bandwidth.';

/**
 * Who may block someone's day.
 *
 * Admins and operators, as before — plus any active strategist an admin has
 * handed shoot ops to. Designers are still not on this list: capacity that
 * other people plan against is not a thing to edit unilaterally.
 */
create or replace function can_run_shoots()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and is_active
      and (role::text in ('admin', 'operator')
           or (role::text = 'strategist' and has_shoot_ops))
  )
$$;

grant execute on function can_run_shoots() to authenticated;

drop policy if exists availability_blocks_write on availability_blocks;
create policy availability_blocks_write on availability_blocks
  for all to authenticated using (can_run_shoots()) with check (can_run_shoots());

-- ---------------------------------------------------------------------------
-- Who may change what on a profile
--
-- Admins: everything.
-- Operators: working hours, and role or access for designers and strategists.
-- Nobody but an admin: shoot ops, and anything about an admin or an operator.
--
-- The policy is widened to match: without this an operator's update never got
-- as far as the trigger, so the rules 0014 wrote were true and unreachable.
-- ---------------------------------------------------------------------------

drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles
  for update to authenticated
  using (id = auth.uid() or is_admin() or is_analyst())
  with check (id = auth.uid() or is_admin() or is_analyst());

create or replace function guard_profile_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_operator boolean;
begin
  -- auth.uid() is null only for the service role and for internal triggers,
  -- both of which are already privileged. End users always have one.
  if auth.uid() is null or is_admin() then
    return new;
  end if;

  -- Past this line nobody is an admin, so shoot ops is settled in one place
  -- rather than repeated down each branch.
  if new.has_shoot_ops is distinct from old.has_shoot_ops then
    raise exception 'Only an admin can grant shoot ops';
  end if;

  v_operator := is_analyst();

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
-- Telling everyone who raises briefs
--
-- One notification per person per *statement*, not per row. A shoot is three
-- days and the form writes three rows; three identical pings for one fact is
-- how a bell gets ignored.
-- ---------------------------------------------------------------------------

create or replace function notify_on_shoot_block()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_block record;
  v_name  text;
  v_what  text;
  v_self  text;
  v_when  text;
  v_hours text;
  v_body  text;
begin
  for v_block in
    select
      i.designer_id,
      min(i.day)                       as from_day,
      max(i.day)                       as to_day,
      bool_or(i.minutes is null)       as any_whole_day,
      min(i.start_time)                as start_time,
      max(i.end_time)                  as end_time,
      (array_agg(i.kind::text order by i.day))[1] as kind,
      coalesce(
        (array_agg(i.note order by i.day) filter (where i.note <> ''))[1], '') as note
    from inserted i
    group by i.designer_id
  loop
    select coalesce(nullif(p.full_name, ''), p.email) into v_name
    from profiles p where p.id = v_block.designer_id;

    v_what := case v_block.kind
      when 'shoot'   then 'is on a shoot'
      when 'leave'   then 'is on leave'
      when 'holiday' then 'is off for a holiday'
      else 'is unavailable'
    end;

    -- Their own copy is about them, so it reads as a label rather than gossip.
    v_self := case v_block.kind
      when 'shoot'   then 'On a shoot'
      when 'leave'   then 'On leave'
      when 'holiday' then 'Holiday'
      else 'Unavailable'
    end;

    v_when := case
      when v_block.from_day = v_block.to_day then to_char(v_block.from_day, 'FMDD Mon')
      else to_char(v_block.from_day, 'FMDD Mon') || '–' || to_char(v_block.to_day, 'FMDD Mon')
    end;

    v_hours := case
      when v_block.any_whole_day or v_block.start_time is null then 'all day'
      else to_char(v_block.start_time, 'FMHH12:MIam') || '–'
           || to_char(v_block.end_time, 'FMHH12:MIam')
    end;

    v_body := v_when || ', ' || v_hours
      || case when v_block.note <> '' then ' · ' || v_block.note else '' end
      || ' — raise briefs accordingly';

    -- Everyone who briefs work: strategists and admins. Operators mark these
    -- themselves and would only be told what they just did.
    insert into notifications (user_id, ticket_id, kind, title, body)
    select p.id, null, 'shoot_block', coalesce(v_name, 'Someone') || ' ' || v_what, v_body
    from profiles p
    where p.is_active
      and p.role::text in ('strategist', 'admin')
      and p.id is distinct from v_actor;

    -- And the person whose day it is, so they don't discover it from the grid.
    insert into notifications (user_id, ticket_id, kind, title, body)
    select v_block.designer_id, null, 'shoot_block',
           'Your ' || v_when || ' is blocked',
           v_self || ', ' || v_hours
             || case when v_block.note <> '' then ' · ' || v_block.note else '' end
    where v_block.designer_id is distinct from v_actor;
  end loop;

  return null;
end;
$$;

drop trigger if exists availability_blocks_notify on availability_blocks;
create trigger availability_blocks_notify
  after insert on availability_blocks
  referencing new table as inserted
  for each statement execute function notify_on_shoot_block();

-- ---------------------------------------------------------------------------
-- The shoot brief
--
-- Locations, scripts, crew, actors, meals and the run-up checklist, kept as
-- one document. It is jsonb rather than fifteen tables on purpose: this is a
-- call sheet, not a schema — every shoot has a field the last one didn't, and
-- nothing here is ever aggregated across shoots.
--
-- The columns pulled out beside it are the ones the list screen sorts on.
-- ---------------------------------------------------------------------------

create table if not exists shoots (
  id          uuid primary key default gen_random_uuid(),
  title       text not null default '',
  brand       text not null default '',
  shoot_date  date,
  doc         jsonb not null default '{}'::jsonb,
  checklist   jsonb not null default '[]'::jsonb,
  created_by  uuid references profiles (id) on delete set null,
  updated_by  uuid references profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists shoots_date_idx on shoots (shoot_date desc nulls last);

create or replace function stamp_shoot()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists shoots_stamp on shoots;
create trigger shoots_stamp
  before insert or update on shoots
  for each row execute function stamp_shoot();

alter table shoots enable row level security;

-- Everyone signed in can read a call sheet. A shoot brief nobody can open is
-- the WhatsApp forward it was meant to replace.
drop policy if exists shoots_read on shoots;
create policy shoots_read on shoots
  for select to authenticated using (true);

drop policy if exists shoots_write on shoots;
create policy shoots_write on shoots
  for all to authenticated using (can_run_shoots()) with check (can_run_shoots());

grant select, insert, update, delete on shoots to authenticated;

do $$
begin
  alter publication supabase_realtime add table shoots;
exception when duplicate_object then null;
end $$;
