-- ===========================================================================
-- Profiles people can edit, and comments that can tag someone
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Avatars
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars are public to read" on storage.objects;
create policy "avatars are public to read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "people upload their own avatar" on storage.objects;
create policy "people upload their own avatar" on storage.objects
  for insert to authenticated with check (bucket_id = 'avatars');

drop policy if exists "people replace their own avatar" on storage.objects;
create policy "people replace their own avatar" on storage.objects
  for update to authenticated using (bucket_id = 'avatars' and owner = auth.uid());

drop policy if exists "people remove their own avatar" on storage.objects;
create policy "people remove their own avatar" on storage.objects
  for delete to authenticated using (bucket_id = 'avatars' and owner = auth.uid());

-- ---------------------------------------------------------------------------
-- Mentions
--
-- Comments are inserted by the client, so the mention ping needs a definer
-- function: notifications are deliberately not writable by end users, or
-- anyone could manufacture one.
-- ---------------------------------------------------------------------------
create table if not exists comment_mentions (
  comment_id uuid not null references comments (id) on delete cascade,
  user_id    uuid not null references profiles (id) on delete cascade,
  primary key (comment_id, user_id)
);

alter table comment_mentions enable row level security;

drop policy if exists mentions_read on comment_mentions;
create policy mentions_read on comment_mentions
  for select to authenticated using (true);

grant select on comment_mentions to authenticated;

create or replace function notify_mentions(
  p_comment_id uuid,
  p_user_ids   uuid[]
) returns int language plpgsql security definer set search_path = public as $$
declare
  v_comment comments%rowtype;
  v_ticket  tickets%rowtype;
  v_count   int := 0;
  v_user    uuid;
begin
  select * into v_comment from comments where id = p_comment_id;
  if not found or v_comment.author_id is distinct from auth.uid() then
    raise exception 'Not your comment';
  end if;

  select * into v_ticket from tickets where id = v_comment.ticket_id;

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
        'Mentioned you',
        '#' || v_ticket.number || ' ' || left(v_comment.body, 90)
      );
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

grant execute on function notify_mentions(uuid, uuid[]) to authenticated;
