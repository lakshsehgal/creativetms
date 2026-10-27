-- ===========================================================================
-- 0026 — Any designer can hand work to any designer
--
-- 0024 gave one designer the power to reassign and called them the lead. In
-- practice the floor hands work around all day — "you're quicker at motion,
-- take this one" — and routing that through a single person, or a
-- strategist, was friction with no upside. So the flag goes, and the power it
-- guarded becomes ordinary.
--
-- What a designer may do to a ticket that isn't theirs is still narrow: move
-- the owner, nothing else. The brief is still a strategist's to write, the
-- four statuses a designer may use are unchanged, and nobody approves their
-- own work. What widens is reach: every designer now sees the whole floor,
-- because you cannot hand a ticket to somebody whose load you cannot see.
-- It does not open the clock — work_sessions keeps its own policy.
--
-- Safe to run more than once. Needs 0024.
-- ===========================================================================

/** Who may see a ticket: same as 0024, with designers in place of the lead. */
drop policy if exists tickets_read on tickets;
create policy tickets_read on tickets
  for select to authenticated using (
    (deleted_at is null or is_analyst())
    and (
      is_staff()
      or is_analyst()
      or auth_role() = 'designer'
      or assigned_to = auth.uid()
      or (assigned_to is null and status = 'new_request')
    )
  );

/** Who may reach a ticket to change it: same shape, same substitution. */
drop policy if exists tickets_update on tickets;
create policy tickets_update on tickets
  for update to authenticated using (
    is_staff()
    or auth_role() = 'designer'
    or assigned_to = auth.uid()
    or (assigned_to is null and status = 'new_request')
  ) with check (
    is_staff() or auth_role() = 'designer' or assigned_to = auth.uid()
  );

/**
 * Lifecycle stamps. Same as 0024 minus one clause: the rule that a designer
 * may only assign work to themselves is gone.
 */
create or replace function stamp_ticket()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role  user_role := auth_role();
  v_asked ticket_status := new.status;
begin
  new.updated_at := now();

  -- Clearing the owner puts the work back in the pool rather than handing it
  -- to whoever cleared it.
  if tg_op = 'UPDATE' and old.assigned_to is not null and new.assigned_to is null then
    new.status        := 'new_request';
    new.planned_for   := null;
    new.plan_position := null;
  elsif new.status <> 'new_request' and new.assigned_to is null then
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
      new.work_phase     := 'revision';
    elsif new.status = 'size_changes' then
      new.work_phase     := 'size_change';
      new.approved_at    := null;
    end if;
  end if;

  if new.review_url is distinct from old.review_url then
    if new.status is distinct from old.status and new.status = 'ready_for_approval' then
      new.review_url_edited_at := null;
      new.review_url_edited_by := null;
    elsif old.review_url is not null and new.review_url is not null then
      new.review_url_edited_at := now();
      new.review_url_edited_by := auth.uid();
    else
      new.review_url_edited_at := null;
      new.review_url_edited_by := null;
    end if;
  end if;

  if v_role = 'designer' then
    if v_asked is distinct from old.status
       and v_asked not in ('in_progress', 'ready_for_approval', 'awaiting_assets', 'on_hold') then
      raise exception 'A designer can move work to In Progress, Ready for Approval, Awaiting Assets or On Hold only';
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

/** The profile guard, back to 0015's shape: shoot ops is the only granted flag. */
create or replace function guard_profile_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_operator boolean;
begin
  if auth.uid() is null or is_admin() then
    return new;
  end if;

  if new.has_shoot_ops is distinct from old.has_shoot_ops then
    raise exception 'Only an admin can grant shoot ops';
  end if;

  v_operator := is_analyst();

  if v_operator then
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

-- The flag, its helper and its trigger have nothing left to do.
drop trigger if exists profiles_clear_design_lead on profiles;
drop function if exists clear_design_lead_on_role_change();
drop function if exists is_design_lead();
alter table profiles drop column if exists is_design_lead;
