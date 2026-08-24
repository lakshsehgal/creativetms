-- ===========================================================================
-- 0024 — The design lead
--
-- One designer on the floor is the person who actually knows who has capacity
-- for what: who is quick at motion, who has three SuperBottoms briefs already,
-- who is on a shoot on Thursday. Until now they could not act on any of it —
-- moving a ticket from one designer to another needed a strategist or an
-- admin, so the decision was made by whoever was nearest a laptop rather than
-- by the person who knew.
--
-- This adds a flag an admin grants, and one power: a design lead can assign
-- work to anybody, not only to themselves.
--
-- Everything else about being a designer is unchanged. A lead still cannot
-- edit a brief, still cannot approve their own work, and still moves tickets
-- only through the four statuses a designer may. What widens is reach — a lead
-- can act on a ticket that isn't theirs, which is what reassigning one means.
--
-- Safe to run more than once. Needs 0015.
-- ===========================================================================

alter table profiles
  add column if not exists is_design_lead boolean not null default false;

comment on column profiles.is_design_lead is
  'Granted by an admin. Lets this designer assign work to other designers.';

/**
 * Whether the person acting is a design lead.
 *
 * Deliberately restricted to designers. Handing it to a strategist would be a
 * no-op — they can already assign — and a flag that does nothing on some rows
 * is a flag somebody eventually reads the wrong way.
 */
create or replace function is_design_lead()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and is_active
      and role::text = 'designer'
      and is_design_lead
  )
$$;

grant execute on function is_design_lead() to authenticated;

/**
 * Who may see a ticket.
 *
 * Same as 0021 plus the design lead, and this is the half that actually
 * mattered: a designer only ever saw their own work and the free briefs in
 * New Request, so a lead could not see the board they are meant to be
 * balancing. Without this the reassignment right below is unreachable —
 * you cannot hand out a ticket you cannot find.
 *
 * It does not open the clock. Time lives in work_sessions, which has its own
 * policy (your own rows, or an analyst's), and ticket_time reads through it as
 * the caller — so a lead sees who is carrying what, and still not how long
 * anybody took. That distinction is the whole promise of this tool and it
 * survives here intact.
 */
drop policy if exists tickets_read on tickets;
create policy tickets_read on tickets
  for select to authenticated using (
    (deleted_at is null or is_analyst())
    and (
      is_staff()
      or is_analyst()
      or is_design_lead()
      or assigned_to = auth.uid()
      or (assigned_to is null and status = 'new_request')
    )
  );

/**
 * Who may reach a ticket to change it.
 *
 * Same as before plus the design lead, who has to be able to touch a ticket
 * that belongs to somebody else — that is the whole point. The WITH CHECK
 * matters as much as the USING: reassigning means the row lands with a
 * different assigned_to than the person doing it, and the old check refused
 * exactly that.
 */
drop policy if exists tickets_update on tickets;
create policy tickets_update on tickets
  for update to authenticated using (
    is_staff()
    or is_design_lead()
    or assigned_to = auth.uid()
    or (assigned_to is null and status = 'new_request')
  ) with check (
    is_staff() or is_design_lead() or assigned_to = auth.uid()
  );

/**
 * Lifecycle stamps.
 *
 * Same as 0022, with one line changed: the rule that a designer may only
 * assign work to themselves now exempts a design lead.
 */
create or replace function stamp_ticket()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role user_role := auth_role();
  -- What the caller actually asked for, captured before this function starts
  -- adjusting it. The designer rule below has to grade the request, not the
  -- result, or it refuses moves this trigger made itself.
  v_asked ticket_status := new.status;
begin
  new.updated_at := now();

  -- Clearing the owner puts the work back in the pool.
  --
  -- Without this, the next rule hands it straight to whoever cleared it — so
  -- a lead taking a ticket off a designer ended up holding it themselves, and
  -- a strategist unassigning one became its designer. Neither is what the
  -- word "unassign" means to the person clicking it. Anything past New
  -- Request still has an owner; it just goes back to being unclaimed.
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
      -- Everything the designer does from here is revision work.
      new.work_phase     := 'revision';
    elsif new.status = 'size_changes' then
      -- Resizes are their own kind of work: not a revision round, but real
      -- hours that the Google Ads size matrix eats and nobody was counting.
      new.work_phase     := 'size_change';
      -- Coming back from Approved, this ticket is owed again.
      new.approved_at    := null;
    end if;
  end if;

  -- The review link, changed in place rather than by submitting a new cut.
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
    -- A design lead hands work out; every other designer only picks it up.
    if new.assigned_to is distinct from old.assigned_to
       and new.assigned_to is distinct from auth.uid()
       and not is_design_lead() then
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
 * Who may grant it.
 *
 * Same as 0015 with one more guarded flag. A lead granting themselves the
 * power to hand work around would make the grant meaningless.
 */
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

  -- Past this line nobody is an admin, so the two granted powers are settled
  -- in one place rather than repeated down each branch.
  if new.has_shoot_ops is distinct from old.has_shoot_ops then
    raise exception 'Only an admin can grant shoot ops';
  end if;
  if new.is_design_lead is distinct from old.is_design_lead then
    raise exception 'Only an admin can make someone a design lead';
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

/**
 * The flag only means something on a designer.
 *
 * Somebody moved from designer to strategist keeps a true flag that no longer
 * does anything, and it would come back the day they moved back — a power
 * nobody remembers granting. Clearing it on the way out is the honest thing.
 */
create or replace function clear_design_lead_on_role_change()
returns trigger language plpgsql as $$
begin
  if new.role::text <> 'designer' then
    new.is_design_lead := false;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_clear_design_lead on profiles;
create trigger profiles_clear_design_lead
  before update of role on profiles
  for each row execute function clear_design_lead_on_role_change();
