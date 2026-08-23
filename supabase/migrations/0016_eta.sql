-- ===========================================================================
-- 0016 — "When will this actually land?"
--
-- A brief carries a due date from the moment it's raised: the promise the
-- strategist made. What it has never carried is the designer's own read on
-- when the thing will really be ready, which is a different number and the
-- only one that moves.
--
-- Today that gap is closed by walking over and asking, which is exactly the
-- interaction this whole tool exists to avoid. So:
--
--   * A strategist can ask for an ETA on one specific brief. Not a field
--     everybody fills on every ticket — a question about the one they're
--     chasing.
--   * The designer answers with a date, and can move it as often as reality
--     moves. A reason is offered, never required: mandatory reasons train
--     people to type "busy".
--   * Every answer and every change is kept, and whoever raised the brief is
--     told. Nobody has to remember to pass it on.
--
-- The due date is never touched by any of this. It's the promise; the ETA is
-- the forecast, and the distance between them is the entire point.
--
-- Safe to run more than once.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- The columns
-- ---------------------------------------------------------------------------

alter table tickets add column if not exists eta_at           timestamptz;
alter table tickets add column if not exists eta_reason       text not null default '';
alter table tickets add column if not exists eta_requested_at timestamptz;
alter table tickets add column if not exists eta_requested_by uuid references profiles (id) on delete set null;

comment on column tickets.eta_at is
  'The designer''s current read on when this lands. Never the promise — that is due_at.';
comment on column tickets.eta_requested_at is
  'Set when a strategist asks. Cleared the moment the designer answers.';

-- The two questions anything reads this for: what is outstanding, and what is
-- landing soon. Both partial, because most tickets have neither.
create index if not exists tickets_eta_pending_idx
  on tickets (eta_requested_at)
  where eta_requested_at is not null and eta_at is null and deleted_at is null;

create index if not exists tickets_eta_idx
  on tickets (eta_at)
  where eta_at is not null and deleted_at is null;

-- ---------------------------------------------------------------------------
-- What it was, and why it moved
--
-- A row per answer, kept forever. Two things come out of this that a single
-- column can't give you: the strategist can see a date that has already moved
-- three times and read that as its own kind of warning, and over a quarter the
-- reasons stack up into the actual answer — "every SuperBottoms brief slips
-- waiting on product shots" is a fact worth having.
-- ---------------------------------------------------------------------------

create table if not exists eta_updates (
  id              uuid primary key default gen_random_uuid(),
  ticket_id       uuid not null references tickets (id) on delete cascade,
  eta_at          timestamptz,
  previous_eta_at timestamptz,
  reason          text not null default '',
  set_by          uuid references profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists eta_updates_ticket_idx
  on eta_updates (ticket_id, created_at desc);

alter table eta_updates enable row level security;

-- Anyone who can see the ticket can see how its date has moved. Hiding the
-- history from the person who asked would defeat the point of keeping it.
drop policy if exists eta_updates_read on eta_updates;
create policy eta_updates_read on eta_updates
  for select to authenticated using (
    exists (select 1 from tickets t where t.id = eta_updates.ticket_id)
  );

grant select on eta_updates to authenticated;

do $$
begin
  alter publication supabase_realtime add table eta_updates;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Who may say what
--
-- The date is the designer's word, so only they (or an admin sorting something
-- out) can set it. Asking is the strategist's move, so only staff can raise the
-- request. Neither side can quietly do the other's half — which is the whole
-- reason the answer means anything.
-- ---------------------------------------------------------------------------

create or replace function guard_eta()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Service-role and internal callers are already privileged.
  if auth.uid() is null then
    return new;
  end if;

  if new.eta_at is distinct from old.eta_at
     or new.eta_reason is distinct from old.eta_reason then
    if not (new.assigned_to = auth.uid() or is_admin()) then
      raise exception 'Only the designer working on this can set the delivery estimate';
    end if;
  end if;

  if new.eta_requested_at is distinct from old.eta_requested_at
     and new.eta_requested_at is not null then
    if not is_staff() then
      raise exception 'Only whoever is waiting on this can ask for an estimate';
    end if;
    -- Stamp the asker rather than trusting the client to name themselves.
    new.eta_requested_by := auth.uid();
  end if;

  -- Answering closes the question. Without this the "waiting on an estimate"
  -- list never empties and stops being looked at.
  if new.eta_at is distinct from old.eta_at and new.eta_at is not null then
    new.eta_requested_at := null;
  end if;

  -- A cleared date leaves no reason hanging behind it.
  if new.eta_at is null then
    new.eta_reason := '';
  end if;

  return new;
end;
$$;

-- Named so it sorts after tickets_stamp, which is what decides assigned_to on
-- a designer picking work up.
drop trigger if exists tickets_zz_guard_eta on tickets;
create trigger tickets_zz_guard_eta
  before update on tickets
  for each row execute function guard_eta();

-- ---------------------------------------------------------------------------
-- Keeping the record, and telling the people waiting
-- ---------------------------------------------------------------------------

create or replace function notify_on_eta()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor  uuid := auth.uid();
  v_ref    text := '#' || new.number || ' ' || new.title;
  v_when   text;
  v_late   int;
  v_title  text;
  v_body   text;
begin
  -- Somebody asked. The designer is the only one who can answer.
  if new.eta_requested_at is distinct from old.eta_requested_at
     and new.eta_requested_at is not null
     and new.assigned_to is not null
     and new.assigned_to is distinct from v_actor then
    insert into notifications (user_id, ticket_id, kind, title, body)
    values (new.assigned_to, new.id, 'eta_requested',
            'When will this land?', v_ref);
  end if;

  if new.eta_at is not distinct from old.eta_at then
    return new;
  end if;

  insert into eta_updates (ticket_id, eta_at, previous_eta_at, reason, set_by)
  values (new.id, new.eta_at, old.eta_at, coalesce(new.eta_reason, ''), v_actor);

  if new.eta_at is null then
    v_title := 'Delivery estimate withdrawn';
    v_body  := v_ref;
  else
    v_when := to_char(new.eta_at at time zone 'Asia/Kolkata', 'FMDay FMDD Mon, FMHH12:MIam');

    -- Whole days late against the promise, judged in the studio's own clock so
    -- an 11pm estimate on the due date doesn't read as a day over.
    v_late := case
      when new.due_at is null then 0
      else greatest(0, (new.eta_at at time zone 'Asia/Kolkata')::date
                       - (new.due_at at time zone 'Asia/Kolkata')::date)
    end;

    v_title := case
      when old.eta_at is null then 'Estimate: ' || v_when
      when new.eta_at > old.eta_at then 'Now landing ' || v_when
      else 'Landing earlier — ' || v_when
    end;

    v_body := v_ref
      || case
           when v_late > 0 then ' · ' || v_late || ' day' || case when v_late = 1 then '' else 's' end
                                || ' past the due date'
           else ''
         end
      || case when coalesce(new.eta_reason, '') <> '' then ' · ' || new.eta_reason else '' end;
  end if;

  -- Whoever raised the brief, and whoever asked, if that's somebody else.
  -- Distinct, so one person in both roles gets one notification, not two.
  insert into notifications (user_id, ticket_id, kind, title, body)
  select distinct person, new.id,
         case when old.eta_at is null then 'eta_set' else 'eta_moved' end,
         v_title, v_body
  from (
    select new.created_by as person
    union
    select new.eta_requested_by
    union
    select old.eta_requested_by
  ) waiting
  where person is not null
    and person is distinct from v_actor;

  return new;
end;
$$;

drop trigger if exists tickets_notify_eta on tickets;
create trigger tickets_notify_eta
  after update of eta_at, eta_requested_at on tickets
  for each row execute function notify_on_eta();
