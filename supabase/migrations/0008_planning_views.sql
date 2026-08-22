-- ---------------------------------------------------------------------------
-- 0008 — Planning views
--
-- Workload and Timeline join Board and List as layouts a saved view can point
-- at. `saved_views.layout` was created with a two-value CHECK, so the constraint
-- has to be widened before either can be stored.
--
-- Safe to run more than once.
-- ---------------------------------------------------------------------------

alter table saved_views
  drop constraint if exists saved_views_layout_check;

alter table saved_views
  add constraint saved_views_layout_check
  check (layout in ('board', 'list', 'workload', 'timeline'));

-- ---------------------------------------------------------------------------
-- Workload charges a ticket's estimated effort to the day it is due, so an
-- undated brief is invisible load. The board reads its own rows, but the
-- planning queries filter hard on due_at and status, and the existing index
-- only covers due_at.
-- ---------------------------------------------------------------------------

create index if not exists tickets_planning_idx
  on tickets (assigned_to, due_at)
  where status in (
    'new_request',
    'in_progress',
    'size_changes',
    'needs_edit',
    'awaiting_assets'
  );
