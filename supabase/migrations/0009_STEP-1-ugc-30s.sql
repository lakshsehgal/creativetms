-- ===========================================================================
-- 0009, STEP 1 of 2 — the UGC split: add the enum value
--
-- RUN THIS FILE ON ITS OWN AND LET IT FINISH BEFORE RUNNING STEP 2.
--
-- Postgres will not let a transaction use an enum value it added in that same
-- transaction (error 55P04). The Supabase SQL editor wraps whatever you paste
-- in one transaction, so adding 'ugc_30s' here and inserting a benchmark row
-- for it in the same paste would fail. Two files, two transactions.
--
-- The existing 'ugc' value now means the one-minute cut. It is deliberately
-- NOT renamed: every ticket, benchmark and scorecard already written carries
-- that label, and a rename would break any tab still running the old build
-- for as long as it takes the new one to deploy. The label people read lives
-- in src/lib/types.ts, where changing it costs nothing.
-- ===========================================================================

alter type creative_format add value if not exists 'ugc_30s';
