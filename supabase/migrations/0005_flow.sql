-- ===========================================================================
-- The real handoff loop
--
--   CS raises briefs in the morning → designer picks their day → In Progress
--   starts the clock → Ready for Approval asks for the Frame.io link and
--   pings the CS → Needs Edit or Size Changes sends it back and pings the
--   designer → each of those rounds is timed SEPARATELY.
--
-- Three things this adds:
--   1. Time attributed by phase — original work, revisions, and size changes
--      are different questions and now have different answers.
--   2. A versioned deliverable per submission (V1, V2, V3…), not one link
--      overwritten each round.
--   3. In-app notifications on every handoff, so nobody waits on a Slack ping
--      that never came.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- What kind of work is this?
--
-- Carried on the TICKET rather than derived from the previous status, so a
-- designer who pauses mid-revision and picks it back up tomorrow is still
-- doing revision work. The phase only changes when a strategist sends it back.
-- ---------------------------------------------------------------------------
create type work_phase as enum ('initial', 'revision', 'size_change');

alter table tickets       add column if not exists work_phase work_phase not null default 'initial';
alter table work_sessions add column if not exists phase      work_phase not null default 'initial';

create index if not exists work_sessions_phase_idx on work_sessions (ticket_id, phase);

-- ---------------------------------------------------------------------------
-- Deliverables — one row per submission, so V1 doesn't vanish when V2 lands
-- ---------------------------------------------------------------------------
create table if not exists deliverables (
  id           uuid primary key default gen_random_uuid(),
  ticket_id    uuid not null references tickets (id) on delete cascade,
  version      int  not null check (version > 0),
  url          text not null,
  phase        work_phase not null default 'initial',
  submitted_by uuid references profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (ticket_id, version)
);

create index if not exists deliverables_ticket_idx on deliverables (ticket_id, version desc);

alter table deliverables enable row level security;

drop policy if exists deliverables_read on deliverables;
create policy deliverables_read on deliverables
  for select to authenticated using (
    exists (select 1 from tickets t where t.id = ticket_id)
  );

drop policy if exists deliverables_write on deliverables;
create policy deliverables_write on deliverables
  for insert to authenticated with check (submitted_by = auth.uid());

grant select, insert on deliverables to authenticated;

-- ---------------------------------------------------------------------------
-- Notifications — in-app, delivered over realtime
-- ---------------------------------------------------------------------------
create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles (id) on delete cascade,
  ticket_id  uuid references tickets (id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text not null default '',
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_unread_idx
  on notifications (user_id, created_at desc) where read_at is null;

alter table notifications enable row level security;

drop policy if exists notifications_read on notifications;
create policy notifications_read on notifications
  for select to authenticated using (user_id = auth.uid());

-- Only marking your own as read; the rows themselves are written by triggers.
drop policy if exists notifications_own_update on notifications;
create policy notifications_own_update on notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, update on notifications to authenticated;

do $$
begin
  alter publication supabase_realtime add table notifications;
exception when duplicate_object then null;
end $$;

-- ===========================================================================
-- The noon rule
--
-- A brief raised after midday can't be due the same day. The designer's day
-- is already planned by then, so a same-day deadline is a promise the floor
-- can't keep — better to refuse it at the point it's made than to discover it
-- at 6pm.
-- ===========================================================================
create or replace function enforce_due_date_rule()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_now   timestamptz := now();
  v_local timestamp;
begin
  if new.due_at is null then
    return new;
  end if;

  -- Everything is judged in the studio's own clock, not the server's.
  v_local := v_now at time zone 'Asia/Kolkata';

  if (new.due_at at time zone 'Asia/Kolkata')::date = v_local::date
     and extract(hour from v_local) >= 12 then
    raise exception 'It''s past midday, so this brief can''t be due today. Pick tomorrow or later.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists tickets_due_rule_insert on tickets;
create trigger tickets_due_rule_insert
  before insert on tickets
  for each row execute function enforce_due_date_rule();

drop trigger if exists tickets_due_rule_update on tickets;
create trigger tickets_due_rule_update
  before update of due_at on tickets
  for each row
  when (new.due_at is distinct from old.due_at)
  execute function enforce_due_date_rule();

-- ===========================================================================
-- Lifecycle stamps, now carrying the work phase
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
      new.planned_for := coalesce(new.planned_for, (now() at time zone 'Asia/Kolkata')::date);
    elsif new.status = 'ready_for_approval' then
      new.submitted_at := now();
    elsif new.status = 'sent_to_client' then
      new.sent_at := coalesce(new.sent_at, now());
    elsif new.status = 'approved' then
      new.approved_at := coalesce(new.approved_at, now());
    elsif new.status = 'needs_edit' then
      new.revision_count := old.revision_count + 1;
      new.approved_at    := null;
      -- Everything the designer does from here is revision work.
      new.work_phase     := 'revision';
    elsif new.status = 'size_changes' then
      -- Resizes are their own kind of work: not a revision round, but real
      -- hours that the Google Ads size matrix eats and nobody was counting.
      new.work_phase     := 'size_change';
    end if;
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
-- The clock, now stamping each session with the phase it belongs to
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

-- ===========================================================================
-- Notifications on every handoff
--
-- Written by a trigger rather than the client, so a ping can't be lost to a
-- dropped request or a closed tab.
-- ===========================================================================
create or replace function notify_on_handoff()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_ref   text := '#' || new.number || ' ' || new.title;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Submitted → tell whoever raised it.
  if new.status = 'ready_for_approval' and new.created_by is distinct from v_actor then
    insert into notifications (user_id, ticket_id, kind, title, body)
    values (new.created_by, new.id, 'ready_for_approval',
            'Ready for your approval', v_ref);
  end if;

  -- Sent back, or signed off → tell the designer.
  if new.assigned_to is not null and new.assigned_to is distinct from v_actor then
    if new.status = 'needs_edit' then
      insert into notifications (user_id, ticket_id, kind, title, body)
      values (new.assigned_to, new.id, 'needs_edit',
              'Edits requested — round ' || new.revision_count, v_ref);
    elsif new.status = 'size_changes' then
      insert into notifications (user_id, ticket_id, kind, title, body)
      values (new.assigned_to, new.id, 'size_changes', 'Size changes requested', v_ref);
    elsif new.status = 'approved' then
      insert into notifications (user_id, ticket_id, kind, title, body)
      values (new.assigned_to, new.id, 'approved', 'Approved', v_ref);
    elsif new.status = 'sent_to_client' then
      insert into notifications (user_id, ticket_id, kind, title, body)
      values (new.assigned_to, new.id, 'sent_to_client', 'Sent to the client', v_ref);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists tickets_notify on tickets;
create trigger tickets_notify
  after update on tickets
  for each row execute function notify_on_handoff();

-- New work landing on someone is worth a ping too.
create or replace function notify_on_assign()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_to is not null
     and new.assigned_to is distinct from old.assigned_to
     and new.assigned_to is distinct from auth.uid() then
    insert into notifications (user_id, ticket_id, kind, title, body)
    values (new.assigned_to, new.id, 'assigned', 'Assigned to you',
            '#' || new.number || ' ' || new.title);
  end if;
  return new;
end;
$$;

drop trigger if exists tickets_notify_assign on tickets;
create trigger tickets_notify_assign
  after update of assigned_to on tickets
  for each row execute function notify_on_assign();

-- ===========================================================================
-- Per-phase time, for the ticket page and the scorecards
-- ===========================================================================
create or replace view ticket_time_by_phase as
select
  ws.ticket_id,
  ws.phase,
  sum(coalesce(
    ws.duration_seconds,
    greatest(0, extract(epoch from (least(now(), ws.last_heartbeat_at) - ws.started_at))::int)
  ))::int as total_seconds,
  count(*)::int as sessions
from work_sessions ws
group by ws.ticket_id, ws.phase;

alter view ticket_time_by_phase set (security_invoker = on);
grant select on ticket_time_by_phase to authenticated;
