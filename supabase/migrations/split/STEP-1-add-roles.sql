-- =========================================================================
-- STEP 1 of 2 — run this on its own, first.
--
-- Postgres will not let a new enum value be USED in the same transaction
-- that adds it, and the Supabase editor runs a script as one transaction.
-- So the two new values get their own step, and their own commit.
--
-- This is tiny and safe to re-run.
-- =========================================================================

alter type user_role          add value if not exists 'operator';
alter type session_end_reason add value if not exists 'break';
