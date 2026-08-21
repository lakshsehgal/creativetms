-- ===========================================================================
-- Phase two — the real studio workflow
--
--   * The nine statuses the team actually uses, replacing the placeholder set.
--   * The clock runs in ONE place: In Progress. A designer marks a ticket In
--     Progress and time accrues; Ready for Approval stops it; Needs Edit sends
--     it back and the next In Progress adds to the same total.
--   * UGC joins the format list.
--   * Tickets can be pledged to a day, so strategists can see what's been
--     picked up today without asking.
--   * Saved filter views.
--   * Anyone can add a brand.
--
-- Safe to run on a database that already has 0001 applied.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Formats
-- ---------------------------------------------------------------------------
alter type creative_format add value if not exists 'ugc';

-- ---------------------------------------------------------------------------
-- Statuses
--
-- Postgres can't drop a value from an enum, so the type is rebuilt and the
-- old values are mapped across. Side states (Size Changes, Awaiting Assets,
-- On Hold) are parking spots — none of them run the clock.
-- ---------------------------------------------------------------------------
-- The read/update policies mention a status literal, and Postgres won't let
-- a column change type while a policy depends on it. They're rebuilt below
-- against the new vocabulary.
drop policy if exists tickets_read on tickets;
drop policy if exists tickets_update on tickets;

-- Same problem with the partial index: its predicate compares against a
-- status literal, so it has to go and come back.
drop index if exists tickets_due_idx;

alter table tickets alter column status drop default;
alter table tickets alter column status type text;
alter table ticket_events alter column from_value type text;
alter table ticket_events alter column to_value type text;

drop type ticket_status;

create type ticket_status as enum (
  'new_request',        -- raised, nobody has started
  'in_progress',        -- THE ONLY STATE WHERE THE CLOCK RUNS
  'size_changes',       -- resizes requested, waiting on the designer to pick up
  'ready_for_approval', -- submitted, with the strategist
  'sent_to_client',     -- out for client review
  'needs_edit',         -- came back with notes
  'approved',           -- signed off
  'awaiting_assets',    -- blocked on someone else's input
  'on_hold'             -- parked deliberately
);

alter table tickets
  alter column status type ticket_status
  using (
    case status
      when 'backlog'   then 'new_request'
      when 'assigned'  then 'new_request'
      when 'in_review' then 'ready_for_approval'
      when 'revisions' then 'needs_edit'
      when 'delivered' then 'sent_to_client'
      when 'in_progress' then 'in_progress'
      when 'approved'    then 'approved'
      else 'new_request'
    end::ticket_status
  );

alter table tickets alter column status set default 'new_request';

-- Rebuilt visibility rules. A designer sees their own work plus the unclaimed
-- New Request pool they're allowed to pick from.
create policy tickets_read on tickets
  for select to authenticated using (
    is_staff()
    or assigned_to = auth.uid()
    or (assigned_to is null and status = 'new_request')
  );

create index tickets_due_idx on tickets (due_at)
  where status not in ('approved', 'sent_to_client');

create policy tickets_update on tickets
  for update to authenticated using (
    is_staff()
    or assigned_to = auth.uid()
    or (assigned_to is null and status = 'new_request')
  ) with check (
    is_staff() or assigned_to = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- New ticket columns
-- ---------------------------------------------------------------------------
alter table tickets add column if not exists sent_at timestamptz;

-- The designer's pledge: "I'm doing this one today." Drives the Today view.
alter table tickets add column if not exists planned_for date;

create index if not exists tickets_planned_idx
  on tickets (planned_for, assigned_to) where planned_for is not null;

-- ---------------------------------------------------------------------------
-- Saved filter views
-- ---------------------------------------------------------------------------
create table if not exists saved_views (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references profiles (id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  -- Whatever the filter bar produced. Kept opaque on purpose so adding a
  -- filter later doesn't need a migration.
  filters    jsonb not null default '{}'::jsonb,
  layout     text  not null default 'board' check (layout in ('board', 'list')),
  is_shared  boolean not null default false,
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

create index if not exists saved_views_owner_idx on saved_views (owner_id);

alter table saved_views enable row level security;

drop policy if exists saved_views_read on saved_views;
create policy saved_views_read on saved_views
  for select to authenticated using (owner_id = auth.uid() or is_shared);

drop policy if exists saved_views_write on saved_views;
create policy saved_views_write on saved_views
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

grant select, insert, update, delete on saved_views to authenticated;

-- ---------------------------------------------------------------------------
-- Anyone can add a brand now — designers included.
-- Only staff can archive or rename one.
-- ---------------------------------------------------------------------------
drop policy if exists brands_staff_write on brands;

create policy brands_anyone_insert on brands
  for insert to authenticated with check (true);

create policy brands_staff_update on brands
  for update to authenticated using (is_staff()) with check (is_staff());

create policy brands_admin_delete on brands
  for delete to authenticated using (is_admin());

-- ===========================================================================
-- Lifecycle stamps and the designer's lane
-- ===========================================================================
create or replace function stamp_ticket()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role user_role := auth_role();
begin
  new.updated_at := now();

  if new.status <> 'new_request' and new.assigned_to is null then
    new.assigned_to := auth.uid();
  end if;

  if new.status is distinct from old.status then
    if new.status = 'in_progress' then
      new.started_at := coalesce(new.started_at, now());
      -- Starting work is itself a pledge that this is today's job.
      new.planned_for := coalesce(new.planned_for, (now() at time zone 'Asia/Kolkata')::date);
    elsif new.status = 'ready_for_approval' then
      new.submitted_at := now();
    elsif new.status = 'sent_to_client' then
      new.sent_at := coalesce(new.sent_at, now());
    elsif new.status = 'approved' then
      new.approved_at := coalesce(new.approved_at, now());
    elsif new.status = 'needs_edit' then
      -- A real revision round: the work came back on quality.
      new.revision_count := old.revision_count + 1;
      new.approved_at    := null;
    end if;
    -- Size Changes deliberately does NOT count as a revision round. A resize
    -- request isn't the designer missing the brief, and folding it into the
    -- first-pass rate would make that number worthless.
  end if;

  if v_role = 'designer' then
    if new.status is distinct from old.status
       and new.status not in ('in_progress', 'ready_for_approval', 'awaiting_assets', 'on_hold') then
      raise exception 'A designer can move work to In Progress, Ready for Approval, Awaiting Assets or On Hold only';
    end if;
    if new.assigned_to is distinct from old.assigned_to
       and new.assigned_to is distinct from auth.uid() then
      raise exception 'A designer can only assign work to themselves';
    end if;
    if (new.title, new.brief, new.format, new.quantity, new.brand_id, new.due_at,
        new.priority, new.created_by, new.estimated_minutes, new.revision_count)
       is distinct from
       (old.title, old.brief, old.format, old.quantity, old.brand_id, old.due_at,
        old.priority, old.created_by, old.estimated_minutes, old.revision_count) then
      raise exception 'A designer cannot edit the brief';
    end if;
  end if;

  return new;
end;
$$;

-- ===========================================================================
-- The clock
--
-- One place only: In Progress. Everything else stops it.
--
-- Note the deliberate change from the earlier build: a designer may now hold
-- several tickets In Progress at once, because that is what a day's plan looks
-- like. Only ONE of them has a running session — starting a second stops the
-- first's clock but leaves its status alone. In Progress means "on my plate
-- today"; the live session says which one is under the cursor right now.
-- ===========================================================================
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

      insert into work_sessions (ticket_id, designer_id)
      values (new.id, v_designer);
    end if;

  elsif old.status = 'in_progress' then
    update work_sessions
       set ended_at = now(), end_reason = 'status_change'
     where ticket_id = new.id and ended_at is null;
  end if;

  return new;
end;
$$;

-- ===========================================================================
-- Today's plan
--
-- Who has picked up what today, so a strategist can see the day without
-- pinging anyone. Visible to staff and to the designer themselves.
-- ===========================================================================
create or replace function todays_plan(p_day date default null)
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
    -- A designer sees their own row; staff see the whole floor.
    and (is_staff() or t.assigned_to = auth.uid())
  order by p.full_name, t.status, t.due_at nulls last;
end;
$$;

grant execute on function todays_plan(date) to authenticated;
