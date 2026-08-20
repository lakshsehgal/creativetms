-- Frame.io review links on tickets.
--
-- Only needed if you already ran 0001_init.sql before this column existed —
-- 0001 now includes it, so a fresh project can skip this file entirely.
-- Safe to run either way.

alter table tickets add column if not exists review_url text;

-- Designers were blocked from editing a ticket whose status wasn't one of
-- their own lanes — which meant they couldn't post a review link on a ticket
-- sitting in Revisions. The lane check now only applies when the status is
-- actually changing.

create or replace function stamp_ticket()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role user_role := auth_role();
begin
  new.updated_at := now();

  -- A designer picking work up owns it.
  if new.status in ('assigned', 'in_progress') and new.assigned_to is null then
    new.assigned_to := auth.uid();
  end if;

  if new.status is distinct from old.status then
    if new.status = 'in_progress' and new.started_at is null then
      new.started_at := now();
    elsif new.status = 'in_review' then
      new.submitted_at := now();
    elsif new.status = 'approved' then
      new.approved_at := coalesce(new.approved_at, now());
    elsif new.status = 'delivered' then
      new.delivered_at := coalesce(new.delivered_at, now());
      new.approved_at  := coalesce(new.approved_at, now());
    elsif new.status = 'revisions' then
      -- Kicking it back opens a new round and un-does any sign-off.
      new.revision_count := old.revision_count + 1;
      new.approved_at    := null;
    end if;
  end if;

  -- Designers drive their own lane and nothing else. Everything a strategist
  -- owns — the brief, the brand, the deadline, sign-off — stays put.
  if v_role = 'designer' then
    -- Only police the lane when the lane actually changes. Otherwise a
    -- designer couldn't touch a ticket parked in revisions or approved at
    -- all — including posting the new review link, which is the one thing
    -- they need to do there.
    if new.status is distinct from old.status
       and new.status not in ('assigned', 'in_progress', 'in_review') then
      raise exception 'A designer can move a ticket to assigned, in progress or in review only';
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
