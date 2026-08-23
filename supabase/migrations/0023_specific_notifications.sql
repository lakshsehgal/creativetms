-- ===========================================================================
-- 0023 — Notifications that say what they're about
--
-- Every alert used to read the same: a three-word title and "#1204 Beard kit
-- carousel". That tells you something happened and makes you open the ticket
-- to find out what. Three or four of those in a morning and people stop
-- reading them, which is the failure mode that matters — a notification
-- nobody reads is worse than none, because everyone assumes it was seen.
--
-- Now each one carries, in the body, the things you would have opened the
-- ticket to learn:
--
--     Sana sent it back — round 2
--     #1204 Beard kit carousel · Bombay Shaving · 4 carousels · due Tue 26 Aug
--     "Logo lockup is too tight on the third slide"
--
-- Whose brand, how much work, when it's owed, and what was actually said. The
-- title names the person and the event, because "who is waiting on me" is the
-- first question and a title is all a desktop popup reliably shows.
--
-- Nothing about delivery changes: same rows, same `kind` values, same
-- triggers. Only the words.
--
-- Safe to run more than once. Needs 0017.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- The shared vocabulary
-- ---------------------------------------------------------------------------

/**
 * "6 statics", "1 carousel", "3 × UGC — 1 min".
 *
 * Plural on the count, because "6 static" reads as a typo and small wrongness
 * in something people see ten times a day is how a tool starts feeling cheap.
 */
create or replace function format_units(p_format creative_format, p_quantity int)
returns text language sql immutable as $$
  select case p_format
    when 'static'   then p_quantity || ' static'   || case when p_quantity = 1 then '' else 's' end
    when 'carousel' then p_quantity || ' carousel' || case when p_quantity = 1 then '' else 's' end
    when 'video'    then p_quantity || ' video'    || case when p_quantity = 1 then '' else 's' end
    when 'gif'      then p_quantity || ' GIF'      || case when p_quantity = 1 then '' else 's' end
    when 'ugc'      then p_quantity || ' × UGC — 1 min'
    when 'ugc_30s'  then p_quantity || ' × UGC — 30s'
    else p_quantity || ' × ' || p_format::text
  end;
$$;

/**
 * A deadline said the way somebody would say it out loud.
 *
 * Read in the studio's clock, so "today" means today in Mumbai and not
 * wherever the database happens to think it is.
 */
create or replace function due_phrase(p_due timestamptz)
returns text language plpgsql stable set search_path = public as $$
declare
  v_day  date;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_time text;
begin
  if p_due is null then return null; end if;
  v_day  := (p_due at time zone 'Asia/Kolkata')::date;
  v_time := to_char(p_due at time zone 'Asia/Kolkata', 'FMHH12:MIam');

  return case
    when v_day <  v_today     then 'was due ' || to_char(p_due at time zone 'Asia/Kolkata', 'FMDD Mon')
    when v_day =  v_today     then 'due today ' || v_time
    when v_day =  v_today + 1 then 'due tomorrow ' || v_time
    when v_day <= v_today + 6 then 'due ' || to_char(p_due at time zone 'Asia/Kolkata', 'FMDay') || ' ' || v_time
    else 'due ' || to_char(p_due at time zone 'Asia/Kolkata', 'FMDD Mon')
  end;
end;
$$;

/**
 * Everything you'd have opened the ticket to find out.
 *
 * "#1204 Beard kit carousel · Bombay Shaving · 4 carousels · due Tue 26 Aug"
 *
 * A brand with no name and a ticket with no deadline both just drop their
 * segment rather than leaving an empty one, so nothing ever reads like a
 * template that failed to fill in.
 */
create or replace function ticket_line(p_ticket_id uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  t       tickets%rowtype;
  v_brand text;
  v_parts text[];
begin
  select * into t from tickets where id = p_ticket_id;
  if not found then return ''; end if;

  select name into v_brand from brands where id = t.brand_id;

  v_parts := array['#' || t.number || ' ' || t.title];
  if v_brand is not null then v_parts := v_parts || v_brand; end if;
  v_parts := v_parts || format_units(t.format, t.quantity);
  if t.due_at is not null then v_parts := v_parts || due_phrase(t.due_at); end if;

  return array_to_string(v_parts, ' · ');
end;
$$;

/** Somebody's name, or their email, or a word that isn't blank. */
create or replace function person_name(p_id uuid, p_fallback text default 'Someone')
returns text language plpgsql stable security definer set search_path = public as $$
declare v_name text;
begin
  if p_id is null then return p_fallback; end if;
  select coalesce(nullif(full_name, ''), email) into v_name from profiles where id = p_id;
  return coalesce(v_name, p_fallback);
end;
$$;

/** A quoted note, trimmed to something a popup can show. */
create or replace function quoted(p_text text, p_limit int default 120)
returns text language sql immutable as $$
  select case
    when coalesce(trim(p_text), '') = '' then null
    when length(trim(p_text)) <= p_limit then '“' || trim(p_text) || '”'
    else '“' || left(trim(p_text), p_limit) || '…”'
  end;
$$;

-- ---------------------------------------------------------------------------
-- The handoffs
-- ---------------------------------------------------------------------------

/**
 * Same triggers, same rows, better words.
 *
 * The title names the person and what they did, because a desktop popup shows
 * the title reliably and the body only sometimes. The body carries the work
 * itself, and — for the two that come with something written — what was said.
 */
create or replace function notify_on_handoff()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_who   text := person_name(v_actor);
  v_line  text := ticket_line(new.id);
  v_notes text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Submitted → tell whoever raised it. The version number is the point: a
  -- second round landing looks identical to the first without it.
  if new.status = 'ready_for_approval' and new.created_by is distinct from v_actor then
    insert into notifications (user_id, ticket_id, kind, title, body)
    values (new.created_by, new.id, 'ready_for_approval',
            v_who || ' submitted '
              || case
                   when new.work_phase = 'revision'    then 'round ' || greatest(new.revision_count, 1) || ' for approval'
                   when new.work_phase = 'size_change' then 'the resizes for approval'
                   else 'this for approval'
                 end,
            v_line);
  end if;

  -- Sent back, or signed off → tell the designer.
  if new.assigned_to is not null and new.assigned_to is distinct from v_actor then
    if new.status = 'needs_edit' then
      -- The notes for this round are recorded BEFORE the status flips, so
      -- they are already here to quote. That ordering is deliberate and lives
      -- in requestRevisions(): writing the notes first also means a failure
      -- half way through loses the status change rather than what was said.
      select quoted(r.notes) into v_notes
      from ticket_revisions r
      where r.ticket_id = new.id and r.round = new.revision_count;

      insert into notifications (user_id, ticket_id, kind, title, body)
      values (new.assigned_to, new.id, 'needs_edit',
              v_who || ' sent it back — round ' || new.revision_count,
              v_line || coalesce(E'\n' || v_notes, ''));

    elsif new.status = 'size_changes' then
      insert into notifications (user_id, ticket_id, kind, title, body)
      values (new.assigned_to, new.id, 'size_changes',
              v_who || ' asked for resizes',
              v_line || E'\nThe build is signed off — this is the size matrix, not a revision.');

    elsif new.status = 'approved' then
      insert into notifications (user_id, ticket_id, kind, title, body)
      values (new.assigned_to, new.id, 'approved',
              v_who || ' approved it', v_line);

    elsif new.status = 'sent_to_client' then
      insert into notifications (user_id, ticket_id, kind, title, body)
      values (new.assigned_to, new.id, 'sent_to_client',
              v_who || ' sent it to the client', v_line);
    end if;
  end if;

  return new;
end;
$$;

/**
 * New work landing on somebody.
 *
 * This is the one that decides whether an afternoon has to be rearranged, so
 * it says who it came from, what it is and when it's owed — the three things
 * that were previously all behind a click.
 */
create or replace function notify_on_assign()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
begin
  if new.assigned_to is not null
     and new.assigned_to is distinct from old.assigned_to
     and new.assigned_to is distinct from v_actor then
    insert into notifications (user_id, ticket_id, kind, title, body)
    values (new.assigned_to, new.id, 'assigned',
            person_name(coalesce(new.created_by, v_actor)) || ' put a brief on you'
              || case when new.priority = 'urgent' then ' — urgent'
                      when new.priority = 'high'   then ' — high priority'
                      else '' end,
            ticket_line(new.id));
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Estimates
-- ---------------------------------------------------------------------------

create or replace function notify_on_eta()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor  uuid := auth.uid();
  v_line   text := ticket_line(new.id);
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
            person_name(coalesce(new.eta_requested_by, v_actor)) || ' asked when this lands',
            v_line);
  end if;

  if new.eta_at is not distinct from old.eta_at then
    return new;
  end if;

  insert into eta_updates (ticket_id, eta_at, previous_eta_at, reason, set_by)
  values (new.id, new.eta_at, old.eta_at, coalesce(new.eta_reason, ''), v_actor);

  if new.eta_at is null then
    v_title := person_name(v_actor) || ' withdrew their estimate';
    v_body  := v_line;
  else
    v_when := to_char(new.eta_at at time zone 'Asia/Kolkata', 'FMDay FMDD Mon, FMHH12:MIam');

    -- Whole days late against the promise, judged in the studio's own clock so
    -- an 11pm estimate on the due date doesn't read as a day over.
    v_late := case
      when new.due_at is null then 0
      else greatest(0, (new.eta_at at time zone 'Asia/Kolkata')::date
                       - (new.due_at at time zone 'Asia/Kolkata')::date)
    end;

    v_title := person_name(v_actor) || ' ' || case
      when old.eta_at is null      then 'expects this ' || v_when
      when new.eta_at > old.eta_at then 'moved this to ' || v_when
      else 'brought this forward to ' || v_when
    end;

    v_body := v_line
      || case
           when v_late > 0 then E'\n' || v_late || ' day' || case when v_late = 1 then '' else 's' end
                                || ' past the due date'
           else ''
         end
      || coalesce(E'\n' || quoted(new.eta_reason), '');
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
  ) people
  where person is not null and person is distinct from v_actor;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Same-day escalations
-- ---------------------------------------------------------------------------

create or replace function notify_on_rush()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_old   text := case when tg_op = 'UPDATE' then old.rush_state else null end;
  v_line  text := ticket_line(new.id);
begin
  -- Asked for, and waiting on somebody.
  if new.rush_state = 'pending' and v_old is distinct from 'pending' then
    insert into notifications (user_id, ticket_id, kind, title, body)
    select p.id, new.id, 'rush_requested',
           person_name(new.rush_requested_by) || ' wants this today — yes or no?',
           v_line || coalesce(E'\n' || quoted(new.rush_reason), '')
    from profiles p
    where p.is_active
      and p.role::text in ('admin', 'operator')
      and p.id is distinct from v_actor;

    return null;
  end if;

  if new.rush_state is not distinct from v_old then
    return null;
  end if;

  if new.rush_state = 'approved' then
    -- The designer. This is the one that matters: somebody has agreed their
    -- afternoon changes shape.
    if new.assigned_to is not null and new.assigned_to is distinct from v_actor then
      insert into notifications (user_id, ticket_id, kind, title, body)
      values (new.assigned_to, new.id, 'rush_approved',
              person_name(new.rush_decided_by, 'An operator') || ' agreed this is needed today',
              v_line || coalesce(E'\n' || quoted(new.rush_reason), ''));
    end if;

    if new.rush_requested_by is not null and new.rush_requested_by is distinct from v_actor then
      insert into notifications (user_id, ticket_id, kind, title, body)
      values (new.rush_requested_by, new.id, 'rush_approved',
              person_name(new.rush_decided_by, 'An operator') || ' approved your same-day brief',
              v_line);
    end if;

  elsif new.rush_state = 'declined' then
    if new.rush_requested_by is not null and new.rush_requested_by is distinct from v_actor then
      insert into notifications (user_id, ticket_id, kind, title, body)
      values (new.rush_requested_by, new.id, 'rush_declined',
              person_name(new.rush_decided_by, 'An operator') || ' moved this to tomorrow',
              v_line || coalesce(E'\n' || quoted(new.rush_note), ''));
    end if;
  end if;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Mentions
-- ---------------------------------------------------------------------------

/**
 * Being tagged in a comment.
 *
 * The whole value here is reading what was said without opening anything, so
 * the comment gets the room and the ticket line sits under it.
 */
create or replace function notify_mentions(p_comment_id uuid, p_user_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare
  v_comment comments%rowtype;
  v_user    uuid;
  v_count   int := 0;
begin
  select * into v_comment from comments where id = p_comment_id;
  if not found or v_comment.author_id is distinct from auth.uid() then
    raise exception 'Not your comment';
  end if;

  foreach v_user in array p_user_ids loop
    -- Never ping yourself, and never invent a person.
    if v_user is distinct from auth.uid()
       and exists (select 1 from profiles where id = v_user and is_active) then
      insert into comment_mentions (comment_id, user_id)
      values (p_comment_id, v_user)
      on conflict do nothing;

      insert into notifications (user_id, ticket_id, kind, title, body)
      values (
        v_user,
        v_comment.ticket_id,
        'mention',
        person_name(v_comment.author_id) || ' mentioned you',
        coalesce(quoted(v_comment.body, 140) || E'\n', '') || ticket_line(v_comment.ticket_id)
      );
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

grant execute on function notify_mentions(uuid, uuid[]) to authenticated;
grant execute on function ticket_line(uuid) to authenticated;
grant execute on function person_name(uuid, text) to authenticated;
grant execute on function due_phrase(timestamptz) to authenticated;
grant execute on function format_units(creative_format, int) to authenticated;
grant execute on function quoted(text, int) to authenticated;
