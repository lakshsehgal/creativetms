-- ===========================================================================
-- 0027 — The strategists' own task list
--
-- Tickets are work a designer does. Around every ticket there is work a
-- strategist does — chase the client for the logo, write the brief, send the
-- deck, follow up on feedback — and until now it lived in each person's notes
-- app, where nobody else could pick a task up when they were out. This gives
-- it one place, visible only to strategists and admins.
--
-- Deliberately not a ticket and not on the board: it carries no format, no
-- clock, no benchmark, and designers never see it. It is a list.
--
-- Safe to run more than once.
-- ===========================================================================

do $$ begin
  create type task_status as enum ('todo', 'doing', 'done');
exception when duplicate_object then null; end $$;

create table if not exists strategist_tasks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (length(trim(title)) > 0),
  notes        text not null default '',
  status       task_status not null default 'todo',
  due_on       date,
  -- Whose list it is on. Null is the shared pile anyone can take from.
  assigned_to  uuid references profiles (id) on delete set null,
  created_by   uuid not null references profiles (id) on delete restrict,
  position     double precision not null default extract(epoch from now()),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists strategist_tasks_owner_idx
  on strategist_tasks (assigned_to, status, position);
create index if not exists strategist_tasks_due_idx
  on strategist_tasks (due_on) where status <> 'done';

alter table strategist_tasks enable row level security;

/**
 * Strategists and admins, nobody else.
 *
 * is_staff() is exactly that set. Operators read analytics and don't carry
 * tasks; designers have the board. Every strategist sees every task — the
 * whole point is being able to pick up what a colleague left — so there is
 * no per-owner read restriction.
 */
drop policy if exists strategist_tasks_read on strategist_tasks;
create policy strategist_tasks_read on strategist_tasks
  for select to authenticated using (is_staff());

drop policy if exists strategist_tasks_insert on strategist_tasks;
create policy strategist_tasks_insert on strategist_tasks
  for insert to authenticated with check (is_staff() and created_by = auth.uid());

drop policy if exists strategist_tasks_update on strategist_tasks;
create policy strategist_tasks_update on strategist_tasks
  for update to authenticated using (is_staff()) with check (is_staff());

drop policy if exists strategist_tasks_delete on strategist_tasks;
create policy strategist_tasks_delete on strategist_tasks
  for delete to authenticated using (
    -- Your own, or anybody's if you are an admin. Deleting a colleague's task
    -- is not "picking it up"; that is what reassigning is for.
    is_admin() or created_by = auth.uid()
  );

grant select, insert, update, delete on strategist_tasks to authenticated;

/** Stamps: updated_at always, completed_at when it crosses into done. */
create or replace function stamp_strategist_task()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();

  -- A task can only be handed to somebody who could see it. Checked first,
  -- on insert and update alike — a check that only runs on update is a check
  -- that misses the most common way of getting it wrong.
  if new.assigned_to is not null and not exists (
    select 1 from profiles
    where id = new.assigned_to and is_active and role::text in ('strategist', 'admin')
  ) then
    raise exception 'Tasks can only be assigned to a strategist or an admin';
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'done' then new.completed_at := coalesce(new.completed_at, now()); end if;
    return new;
  end if;
  if new.status is distinct from old.status then
    new.completed_at := case when new.status = 'done' then now() else null end;
  end if;
  return new;
end;
$$;

drop trigger if exists strategist_tasks_stamp on strategist_tasks;
create trigger strategist_tasks_stamp
  before insert or update on strategist_tasks
  for each row execute function stamp_strategist_task();

-- Realtime, so a task a colleague hands you appears without a refresh.
do $$ begin
  alter publication supabase_realtime add table strategist_tasks;
exception when duplicate_object then null; end $$;
