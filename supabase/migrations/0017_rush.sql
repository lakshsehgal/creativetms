-- ===========================================================================
-- 0017 — The escalation, and the person who has to agree to it
--
-- The noon rule exists because a brief raised at 3pm can't honestly be due at
-- 6pm: the designer's day was planned this morning, and a same-day deadline
-- set in the afternoon is a promise the floor can't keep.
--
-- It is also, occasionally, wrong. A client escalates, an ad set is burning
-- money on a creative that has to come down, something genuinely can't wait.
-- Until now the only way through was to lie about the due date, which is worse
-- than the rule it dodges — the number stops meaning anything for everyone.
--
-- So: a strategist can ask to break it, in writing, and somebody who carries
-- the floor decides. Until they do, the brief exists but the designer has not
-- been asked to do anything. That last part is the whole design. A pending
-- rush that already shows up in somebody's queue is not an approval step, it's
-- a notification with extra clicks.
--
-- An admin's own rush is approved as it's raised. Making the person who owns
-- the studio wait for a second signature on their own escalation is ceremony,
-- not control.
--
-- Safe to run more than once.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- The state
--
-- Text with a check rather than an enum, deliberately. A new enum type is
-- fine, but every future addition to it is a two-step migration on a live
-- database (a value cannot be added and used in one transaction), and this is
-- a set that may well grow a "withdrawn" one day.
-- ---------------------------------------------------------------------------

alter table tickets add column if not exists rush_state text
  check (rush_state in ('pending', 'approved', 'declined'));

alter table tickets add column if not exists rush_reason       text not null default '';
alter table tickets add column if not exists rush_requested_at timestamptz;
alter table tickets add column if not exists rush_requested_by uuid references profiles (id) on delete set null;
alter table tickets add column if not exists rush_decided_at   timestamptz;
alter table tickets add column if not exists rush_decided_by   uuid references profiles (id) on delete set null;
alter table tickets add column if not exists rush_note         text not null default '';

-- Who the strategist wants on it. Held here rather than in assigned_to until
-- somebody approves, so a pending rush never lands in a designer's queue and
-- never counts against their day.
alter table tickets add column if not exists rush_designer_id uuid references profiles (id) on delete set null;

comment on column tickets.rush_state is
  'null on an ordinary brief. pending/approved/declined only for a same-day escalation past midday.';
comment on column tickets.rush_designer_id is
  'The intended designer, applied to assigned_to on approval. Kept out of assigned_to so a pending rush is nobody''s work yet.';

-- What the approval queue reads. Almost every ticket has a null rush_state, so
-- a partial index is the whole table's worth of answer in a few pages.
create index if not exists tickets_rush_pending_idx
  on tickets (rush_requested_at)
  where rush_state = 'pending' and deleted_at is null;

-- ---------------------------------------------------------------------------
-- The noon rule, with one door in it
-- ---------------------------------------------------------------------------

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

    -- The door: an escalation somebody has put their name to. Not a checkbox
    -- on its own — a reason is the thing an approver actually reads, and a
    -- rush with no reason is just the rule switched off.
    if new.rush_state = 'pending' and length(btrim(coalesce(new.rush_reason, ''))) >= 10 then
      return new;
    end if;

    if new.rush_state = 'pending' then
      raise exception 'Say why this can''t wait — a sentence is enough, and whoever approves it has to read something.'
        using errcode = 'check_violation';
    end if;

    raise exception 'It''s past midday, so this brief can''t be due today. Pick tomorrow or later, or mark it as something that can''t wait.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who may ask, and who may decide
-- ---------------------------------------------------------------------------

create or replace function guard_rush()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old text := case when tg_op = 'UPDATE' then old.rush_state else null end;
begin
  if auth.uid() is null then
    return new;
  end if;

  -- Asking.
  if new.rush_state = 'pending' and v_old is distinct from 'pending' then
    if not is_staff() then
      raise exception 'Only whoever raises briefs can ask for a same-day exception';
    end if;
    new.rush_requested_at := coalesce(new.rush_requested_at, now());
    new.rush_requested_by := auth.uid();

    -- A pending rush is nobody's work yet. Whoever was picked is remembered
    -- and applied on approval.
    new.rush_designer_id := coalesce(new.rush_designer_id, new.assigned_to);
    new.assigned_to := null;

    -- An admin asking is an admin deciding. Waiting for a second signature on
    -- your own escalation is ceremony rather than control.
    if is_admin() then
      new.rush_state := 'approved';
      new.rush_decided_at := now();
      new.rush_decided_by := auth.uid();
      new.rush_note := 'Raised by an admin';
      new.assigned_to := new.rush_designer_id;
    end if;

    return new;
  end if;

  -- Deciding.
  if new.rush_state is distinct from v_old and v_old = 'pending' then
    if not is_analyst() then
      raise exception 'Only an operator or an admin can decide a same-day exception';
    end if;
    if new.rush_state not in ('approved', 'declined') then
      raise exception 'A same-day exception is either approved or declined';
    end if;

    new.rush_decided_at := now();
    new.rush_decided_by := auth.uid();

    if new.rush_state = 'approved' then
      -- Now it's somebody's work.
      new.assigned_to := coalesce(new.assigned_to, new.rush_designer_id);
    else
      -- Declined doesn't throw the brief away — it takes back the exception.
      -- Leaving the date at today would let a refused escalation keep claiming
      -- a deadline the studio has just said no to.
      new.due_at := new.due_at + interval '1 day';
    end if;

    return new;
  end if;

  -- A decision, once made, stands. Reopening it would let a declined rush be
  -- quietly flipped later by whoever wanted it in the first place.
  if v_old in ('approved', 'declined') and new.rush_state is distinct from v_old then
    raise exception 'That exception has already been decided';
  end if;

  return new;
end;
$$;

drop trigger if exists tickets_zz_guard_rush on tickets;
create trigger tickets_zz_guard_rush
  before insert or update on tickets
  for each row execute function guard_rush();

-- ---------------------------------------------------------------------------
-- How an operator reaches the decision
--
-- Operators are not is_staff(), so the tickets policy does not let them update
-- a ticket at all — correctly: they run the floor, they don't run the board.
-- Widening that policy so they can answer one question would hand them every
-- field on every ticket.
--
-- So the decision gets its own door instead. One function, one thing it can
-- change, and the caller is still themselves inside it — so the guard above
-- and the notifications below both see who actually decided.
-- ---------------------------------------------------------------------------

create or replace function decide_rush(p_ticket uuid, p_approve boolean, p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  v_state text;
begin
  if not is_analyst() then
    raise exception 'Only an operator or an admin can decide a same-day exception';
  end if;

  select rush_state into v_state from tickets where id = p_ticket and deleted_at is null;

  if v_state is null then
    raise exception 'That brief has no same-day exception on it';
  end if;
  if v_state <> 'pending' then
    raise exception 'That exception has already been decided';
  end if;

  update tickets
     set rush_state = case when p_approve then 'approved' else 'declined' end,
         rush_note  = coalesce(btrim(p_note), '')
   where id = p_ticket;
end;
$$;

grant execute on function decide_rush(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Telling the people who have to act
-- ---------------------------------------------------------------------------

create or replace function notify_on_rush()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_old   text := case when tg_op = 'UPDATE' then old.rush_state else null end;
  v_ref   text := '#' || new.number || ' ' || new.title;
  v_who   text;
begin
  -- Asked for, and waiting on somebody.
  if new.rush_state = 'pending' and v_old is distinct from 'pending' then
    select coalesce(nullif(p.full_name, ''), p.email) into v_who
    from profiles p where p.id = new.rush_requested_by;

    insert into notifications (user_id, ticket_id, kind, title, body)
    select p.id, new.id, 'rush_requested',
           'Same-day brief needs a yes or no',
           v_ref || ' · ' || coalesce(v_who, 'Someone') || ': ' || new.rush_reason
    from profiles p
    where p.is_active
      and p.role::text in ('admin', 'operator')
      and p.id is distinct from v_actor;

    return null;
  end if;

  if new.rush_state is not distinct from v_old then
    return null;
  end if;

  select coalesce(nullif(p.full_name, ''), p.email) into v_who
  from profiles p where p.id = new.rush_decided_by;

  if new.rush_state = 'approved' then
    -- The designer. This is the one that matters: somebody has agreed their
    -- afternoon changes shape.
    if new.assigned_to is not null and new.assigned_to is distinct from v_actor then
      insert into notifications (user_id, ticket_id, kind, title, body)
      values (new.assigned_to, new.id, 'rush_approved',
              'Urgent — needed today',
              v_ref || ' · ' || new.rush_reason);
    end if;

    if new.rush_requested_by is not null and new.rush_requested_by is distinct from v_actor then
      insert into notifications (user_id, ticket_id, kind, title, body)
      values (new.rush_requested_by, new.id, 'rush_approved',
              'Approved for today',
              v_ref || ' · ' || coalesce(v_who, 'An operator') || ' agreed');
    end if;

  elsif new.rush_state = 'declined' then
    if new.rush_requested_by is not null and new.rush_requested_by is distinct from v_actor then
      insert into notifications (user_id, ticket_id, kind, title, body)
      values (new.rush_requested_by, new.id, 'rush_declined',
              'Not today — moved to tomorrow',
              v_ref
                || case when new.rush_note <> '' then ' · ' || new.rush_note else '' end);
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists tickets_notify_rush on tickets;
create trigger tickets_notify_rush
  after insert or update on tickets
  for each row execute function notify_on_rush();
