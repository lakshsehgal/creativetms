-- ===========================================================================
-- 0010 — Working files become links
--
-- Source files for this studio already live somewhere: project files on
-- Drive, raw UGC on Frame.io or Dropbox, a font pack on WeTransfer. Uploading
-- a second copy into this tool made it a place where files go stale and
-- storage quietly grows — the tool's job is to say *where* the work is, not
-- to hold it.
--
-- The table is widened rather than replaced, so every file already uploaded
-- keeps its row, stays downloadable, and nothing has to be migrated or
-- deleted. A row is now either a link (url set) or an upload (storage_path
-- set), and the constraint makes "neither" impossible.
--
-- Safe to run more than once.
-- ===========================================================================

alter table attachments alter column storage_path drop not null;
alter table attachments alter column file_name    set default '';

alter table attachments add column if not exists url   text;
alter table attachments add column if not exists label text not null default '';

-- A row has to point at something.
alter table attachments drop constraint if exists attachments_has_target;
alter table attachments
  add constraint attachments_has_target
  check (url is not null or storage_path is not null);

-- Only http(s). Without this, `javascript:` and `data:` URLs would be stored
-- and then rendered as clickable links on a page other people open.
alter table attachments drop constraint if exists attachments_url_scheme;
alter table attachments
  add constraint attachments_url_scheme
  check (url is null or url ~* '^https?://[^\s]+$');

-- The activity feed already logs 'attachment'; links are the same event.
comment on column attachments.url is
  'Where the working file actually lives. Mutually inclusive with storage_path only in the sense that exactly one is normally set.';
comment on column attachments.label is
  'What the person called it. Falls back to the URL host when blank.';
