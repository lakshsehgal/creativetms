-- ===========================================================================
-- 0021 — Who may remove a ticket
--
-- Operators run the floor day to day and were the one role that couldn't
-- remove anything they hadn't raised themselves, which meant every duplicate
-- brief and every mis-filed ticket went to an admin. They get the same reach
-- as an admin here.
--
-- And a strategist's own brief is genuinely theirs. The old rule let them
-- remove it only while it was still in New Request with nobody on it, so the
-- moment a designer claimed a brief the strategist had raised in error, it
-- needed somebody else to clean up.
--
-- One guard survives, and it is the one that matters: nobody outside an admin
-- or an operator can remove a ticket a clock has ever run against. Removal is
-- a soft delete, so the time isn't destroyed — but it stops counting, and a
-- designer's day quietly changing because somebody tidied up a brief is
-- exactly the kind of silent number this tool exists not to produce. When it
-- does need to go, an admin or an operator can still do it.
--
-- Safe to run more than once. Needs 0011.
-- ===========================================================================

/**
 * Remove a ticket.
 *
 * Admins and operators can remove anything. Anyone else can remove a brief
 * they raised themselves, as long as no work has been logged against it.
 */
create or replace function delete_ticket(p_ticket_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ticket   tickets%rowtype;
  v_sessions int;
begin
  select * into v_ticket from tickets where id = p_ticket_id;
  if not found then
    raise exception 'That ticket no longer exists';
  end if;
  if v_ticket.deleted_at is not null then
    return; -- already gone; deleting twice is not an error
  end if;

  if not is_analyst() then
    if v_ticket.created_by <> auth.uid() then
      raise exception 'Only an admin or an operator can remove a brief somebody else raised';
    end if;
    select count(*) into v_sessions from work_sessions where ticket_id = p_ticket_id;
    if v_sessions > 0 then
      raise exception 'Someone has already worked on this. Ask an admin or an operator to remove it';
    end if;
  end if;

  update tickets
     set deleted_at = now(),
         deleted_by = auth.uid()
   where id = p_ticket_id;

  insert into ticket_events (ticket_id, actor_id, kind, from_value, to_value)
  values (p_ticket_id, auth.uid(), 'deleted', v_ticket.status::text, null);
end;
$$;

/**
 * Put a removed ticket back.
 *
 * Whoever may remove it may put it back — otherwise an operator who removes
 * the wrong ticket has to find an admin to undo their own click.
 */
create or replace function restore_ticket(p_ticket_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (
    is_analyst()
    or exists (
      select 1 from tickets
      where id = p_ticket_id and deleted_by = auth.uid()
    )
  ) then
    raise exception 'Only an admin, an operator, or whoever removed it, can restore a ticket';
  end if;

  update tickets set deleted_at = null, deleted_by = null where id = p_ticket_id;

  insert into ticket_events (ticket_id, actor_id, kind, from_value, to_value)
  values (p_ticket_id, auth.uid(), 'restored', null, null);
end;
$$;

/**
 * Removed tickets are visible to whoever can remove them.
 *
 * Without this an operator could delete a ticket and then not see it — the
 * read policy still hid removed rows from everyone but an admin, so their own
 * Removed list would come back empty and the restore would silently match no
 * rows. A delete you cannot undo is a delete nobody presses.
 */
drop policy if exists tickets_read on tickets;
create policy tickets_read on tickets
  for select to authenticated using (
    (deleted_at is null or is_analyst())
    and (
      is_staff()
      or is_analyst()
      or assigned_to = auth.uid()
      or (assigned_to is null and status = 'new_request')
    )
  );
