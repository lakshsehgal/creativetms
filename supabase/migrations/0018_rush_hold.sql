-- ===========================================================================
-- 0018 — A pending escalation is nobody's work, and now it actually holds
--
-- 0017 kept a pending rush out of the designer's hands by leaving assigned_to
-- empty until somebody approved it. That covers the path the tool offers: it
-- isn't in their day, it doesn't count against capacity, and nobody is told.
--
-- It does not cover the board.
--
-- An unassigned brief sitting in New Request is, by design, something any
-- designer can claim — that is how the backlog works and it is a good rule.
-- Which means a designer scrolling the board could pick up an escalation
-- nobody had agreed to yet and start the clock on it. The approval would still
-- be sitting in an operator's bar, now describing work already underway.
--
-- Nothing announces that. The strategist gets what they asked for, the
-- operator's yes or no stops mattering, and the one guarantee the whole flow
-- rests on quietly stops being true.
--
-- So the hold moves from "we don't show it" to "the database refuses it".
--
-- Safe to run more than once. Needs 0017.
-- ===========================================================================

create or replace function guard_rush()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old text := case when tg_op = 'UPDATE' then old.rush_state else null end;
begin
  if auth.uid() is null then
    return new;
  end if;

  -- ---------------------------------------------------------------------
  -- The hold.
  --
  -- While it stays pending, nobody may take it and nobody may start it.
  -- Checked before anything else, because this is the invariant the rest of
  -- the flow depends on — and it has to hold against someone claiming it off
  -- the board, not merely against a screen that doesn't list it.
  --
  -- Note this runs after tickets_stamp, which is what turns "I moved it to In
  -- Progress" into an assignment. By the time we get here that has already
  -- happened, so testing assigned_to catches both moves at once.
  -- ---------------------------------------------------------------------
  if v_old = 'pending' and new.rush_state = 'pending' then
    -- Status first, so the message matches what the person actually did.
    -- Clicking Start trips both (tickets_stamp assigns them on the way past),
    -- and "nobody can start it yet" is the true sentence for that click.
    if new.status is distinct from old.status then
      raise exception 'That brief is still waiting on approval — nobody can start it yet'
        using errcode = 'check_violation';
    end if;
    if new.assigned_to is not null then
      raise exception 'That brief is still waiting on approval — nobody can pick it up yet'
        using errcode = 'check_violation';
    end if;
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
