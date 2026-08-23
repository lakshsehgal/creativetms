-- ===========================================================================
-- 0022 — Size edits after sign-off, and an honest review link
--
-- Two things, both about what happens after a creative is approved.
--
-- 1. Resizes usually arrive AFTER the client has signed off: the ad works, so
--    now they want it in nine more placements. Approving a ticket closed every
--    door — the strategist had nothing left to press, and the only way back was
--    to raise a duplicate brief, which loses the history and double-counts the
--    work. Approved tickets can now go back for size changes or for edits,
--    exactly as they could from Sent to Client.
--
--    Reopening also clears approved_at, the way Needs Edit already does. The
--    scorecards count a ticket as delivered on that stamp, and a ticket that
--    has gone back out for resizing is not delivered. It gets stamped again,
--    with the real date, when it is approved a second time.
--
-- 2. The review link can be changed in place, by the designer who owns the
--    ticket or by an admin fixing a bad paste. Until now that happened in
--    silence: a strategist who had already opened V2 had no way to know the
--    link they were sent now points somewhere else. Every in-place change is
--    stamped and shows as "edited" on the ticket, and lands in the activity
--    feed with the old link, so the previous cut stays reachable.
--
--    Submitting a fresh version is NOT an edit — that already announces itself
--    as V3, and the stamp is cleared when it happens.
--
-- Safe to run more than once. Needs 0005.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Who last changed the review link, and when
-- ---------------------------------------------------------------------------
alter table tickets add column if not exists review_url_edited_at timestamptz;
alter table tickets add column if not exists review_url_edited_by uuid references profiles (id) on delete set null;

/**
 * Lifecycle stamps.
 *
 * Same as 0005 with two additions: size_changes clears approved_at, and any
 * in-place change to the review link is stamped.
 */
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
      -- Coming back from Approved, this ticket is owed again. Leaving the old
      -- sign-off stamp on it would keep it counted as delivered on a day it
      -- wasn't, and the second approval would never be recorded at all.
      new.approved_at    := null;
    end if;
  end if;

  -- The review link, changed in place rather than by submitting a new cut.
  if new.review_url is distinct from old.review_url then
    if new.status is distinct from old.status and new.status = 'ready_for_approval' then
      -- A fresh submission. It announces itself as a new version; calling that
      -- an edit would cry wolf on every single round.
      new.review_url_edited_at := null;
      new.review_url_edited_by := null;
    elsif old.review_url is not null and new.review_url is not null then
      new.review_url_edited_at := now();
      new.review_url_edited_by := auth.uid();
    else
      -- First link on the ticket, or the link being cleared. Neither is an
      -- edit of something somebody has already been sent.
      new.review_url_edited_at := null;
      new.review_url_edited_by := null;
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

/**
 * Activity feed.
 *
 * Same as 0001, plus the review link. The old link goes in from_value so the
 * cut somebody was already reviewing stays reachable from the ticket — that is
 * the whole point of saying it was edited.
 */
create or replace function log_ticket_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into ticket_events (ticket_id, actor_id, kind, to_value)
    values (new.id, auth.uid(), 'created', new.status::text);
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into ticket_events (ticket_id, actor_id, kind, from_value, to_value)
    values (new.id, auth.uid(), 'status', old.status::text, new.status::text);
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    insert into ticket_events (ticket_id, actor_id, kind, from_value, to_value)
    values (new.id, auth.uid(), 'assigned', old.assigned_to::text, new.assigned_to::text);
  end if;

  if new.review_url is distinct from old.review_url
     and new.review_url_edited_at is not null
     and new.review_url_edited_at is distinct from old.review_url_edited_at then
    insert into ticket_events (ticket_id, actor_id, kind, from_value, to_value)
    values (new.id, auth.uid(), 'review_link', old.review_url, new.review_url);
  end if;

  return new;
end;
$$;
