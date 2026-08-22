-- ===========================================================================
-- 0012 — Signing in with Google
--
-- No new tables. The one thing that actually breaks with OAuth is the profile
-- trigger: it only ever looked for `full_name` in the user metadata, which is
-- what an invite writes. Google sends `name`, `given_name`/`family_name` and
-- a `picture`, so a Google sign-in landed as a profile named after the left
-- half of the email with no avatar.
--
-- The invite path is untouched, and so is the rule that matters: a new
-- account is inactive until an admin lets it in, whichever way it signed in.
-- Someone finding the URL and clicking "Continue with Google" gets a pending
-- profile and nothing else.
--
-- Safe to run more than once.
-- ===========================================================================

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_invite    invites%rowtype;
  v_role      user_role := 'designer';
  v_active    boolean   := false;
  v_name      text;
  v_avatar    text;
  v_bootstrap text := current_setting('app.bootstrap_admin_email', true);
begin
  select * into v_invite from invites
   where lower(email) = lower(new.email) and accepted_at is null;

  if found then
    v_role   := v_invite.role;
    v_active := true;
    update invites set accepted_at = now() where id = v_invite.id;
  elsif v_bootstrap is not null and lower(v_bootstrap) = lower(new.email) then
    v_role   := 'admin';
    v_active := true;
  elsif not exists (select 1 from profiles) then
    -- Empty instance: whoever gets there first owns it.
    v_role   := 'admin';
    v_active := true;
  end if;

  -- An invite's name wins: it's what a colleague typed on purpose. After that,
  -- whatever the identity provider gave us, under any of the keys it might
  -- use. The email's local part is the last resort, not the first guess.
  v_name := coalesce(
    nullif(v_invite.full_name, ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    nullif(
      trim(
        coalesce(new.raw_user_meta_data ->> 'given_name', '') || ' ' ||
        coalesce(new.raw_user_meta_data ->> 'family_name', '')
      ),
      ''
    ),
    split_part(new.email, '@', 1)
  );

  -- Supabase normalises Google's `picture` to `avatar_url`, but not always,
  -- and other providers use one or the other. Take whichever is there.
  v_avatar := coalesce(
    nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
    nullif(new.raw_user_meta_data ->> 'picture', '')
  );

  insert into profiles (id, email, full_name, role, is_active, avatar_url)
  values (new.id, new.email, v_name, v_role, v_active, v_avatar)
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill: anyone who already signed in with Google before this ran is
-- sitting there named "rohan" with no picture. Only fills blanks — a name
-- somebody has since edited on their profile is left alone.
-- ---------------------------------------------------------------------------

update profiles p
   set full_name = coalesce(
         nullif(u.raw_user_meta_data ->> 'full_name', ''),
         nullif(u.raw_user_meta_data ->> 'name', ''),
         p.full_name
       ),
       avatar_url = coalesce(
         p.avatar_url,
         nullif(u.raw_user_meta_data ->> 'avatar_url', ''),
         nullif(u.raw_user_meta_data ->> 'picture', '')
       )
  from auth.users u
 where u.id = p.id
   and (
     -- Untouched name: still just the email's local part.
     p.full_name = split_part(p.email, '@', 1)
     or p.avatar_url is null
   );
