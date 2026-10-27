-- ===========================================================================
-- 0028 — Removing a person outright
--
-- Revoke closes the door and keeps the history. That is right for anybody who
-- has done work here. It is wrong for a test account, a mistyped invite, or
-- somebody who left before touching anything — those just clutter the Team
-- page forever, with no history worth keeping.
--
-- Two functions. The first says what deleting somebody would take with it,
-- so the admin sees the consequence before the click rather than after. The
-- second does it — and refuses when the person has history the schema will
-- not let go of, because quietly rewriting who raised a brief to make a
-- delete succeed would falsify the very record this tool exists to keep.
--
-- Safe to run more than once.
-- ===========================================================================

/**
 * What goes if this person goes.
 *
 * "blocking" is history the foreign keys refuse to orphan: tickets they
 * raised, comments they wrote, revision notes, attachments. While any of it
 * exists, the person cannot be deleted — only revoked.
 *
 * "cascading" is what would silently disappear with them: logged work
 * sessions, scorecards, notifications, saved views. Work sessions are the
 * one that matters, because they are what Analytics is built on, and an
 * admin should know that deleting a designer rewrites last quarter.
 */
create or replace function user_footprint(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v jsonb;
begin
  if not is_admin() then
    raise exception 'Only an admin can look this up';
  end if;

  select jsonb_build_object(
    'tickets_raised',   (select count(*) from public.tickets where created_by = p_user),
    'comments',         (select count(*) from public.comments where author_id = p_user),
    'revision_notes',   (select count(*) from public.ticket_revisions where requested_by = p_user),
    'attachments',      (select count(*) from public.attachments where uploaded_by = p_user),
    'work_sessions',    (select count(*) from public.work_sessions where designer_id = p_user),
    'work_seconds',     (select coalesce(sum(duration_seconds), 0) from public.work_sessions where designer_id = p_user),
    'tickets_assigned', (select count(*) from public.tickets where assigned_to = p_user and deleted_at is null)
  ) into v;

  return v;
end;
$$;

grant execute on function user_footprint(uuid) to authenticated;

/**
 * Delete the profile. The auth account is removed by the server action
 * afterwards — that lives outside SQL's reach — and only once this has
 * succeeded, so a refusal here leaves everything exactly as it was.
 */
create or replace function delete_user(p_user uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_me     uuid := auth.uid();
  v_target public.profiles%rowtype;
  v_print  jsonb;
  v_block  text[] := '{}';
begin
  if not is_admin() then
    raise exception 'Only an admin can delete a person';
  end if;
  if p_user = v_me then
    raise exception 'You cannot delete yourself';
  end if;

  select * into v_target from public.profiles where id = p_user;
  if not found then
    raise exception 'That person is already gone';
  end if;

  -- Never remove the last working admin: a studio with nobody who can grant
  -- access is a studio that is locked out of its own tool.
  if v_target.role::text = 'admin'
     and (select count(*) from public.profiles where role::text = 'admin' and is_active and id <> p_user) = 0 then
    raise exception 'That is the only other admin. Make somebody else an admin first';
  end if;

  v_print := user_footprint(p_user);

  if (v_print->>'tickets_raised')::int > 0 then
    v_block := v_block || format('%s brief%s raised', v_print->>'tickets_raised',
                                 case when (v_print->>'tickets_raised')::int = 1 then '' else 's' end);
  end if;
  if (v_print->>'comments')::int > 0 then
    v_block := v_block || format('%s comment%s', v_print->>'comments',
                                 case when (v_print->>'comments')::int = 1 then '' else 's' end);
  end if;
  if (v_print->>'revision_notes')::int > 0 then
    v_block := v_block || format('%s round%s of notes', v_print->>'revision_notes',
                                 case when (v_print->>'revision_notes')::int = 1 then '' else 's' end);
  end if;
  if (v_print->>'attachments')::int > 0 then
    v_block := v_block || format('%s attachment%s', v_print->>'attachments',
                                 case when (v_print->>'attachments')::int = 1 then '' else 's' end);
  end if;

  if array_length(v_block, 1) > 0 then
    raise exception 'This person has history the record keeps: %. Revoke their access instead',
      array_to_string(v_block, ', ');
  end if;

  -- Anything still on them goes back to the pool rather than vanishing.
  update public.tickets set assigned_to = null where assigned_to = p_user and deleted_at is null;

  delete from public.profiles where id = p_user;
end;
$$;

grant execute on function delete_user(uuid) to authenticated;
