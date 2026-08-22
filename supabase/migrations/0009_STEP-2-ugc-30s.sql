-- ===========================================================================
-- 0009, STEP 2 of 2 — the UGC split: give the new format a benchmark row
--
-- Run only after STEP 1 has finished. Safe to run more than once.
--
-- The row is created with no target, the same way the one-minute cut was.
-- A 30-second UGC edit is a different job from a 60-second one — fewer
-- clips to place, the same grade — but guessing a number before the studio
-- has done a few would produce a target nobody trusts, and pace comparisons
-- sit out until there is one.
-- ===========================================================================

insert into format_benchmarks (format, target_minutes_per_unit)
values ('ugc_30s', null)
on conflict (format) do nothing;
