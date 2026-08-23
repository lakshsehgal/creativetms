-- ===========================================================================
-- 0020 — A brand is more than a name and a colour
--
-- Everything a designer needs to start work on a client — the brand brief, the
-- logo and font files, what the client said on the onboarding form, and the
-- one line about what to avoid — currently lives in somebody's Drive, or in a
-- WhatsApp message from six weeks ago, or in the head of whoever onboarded
-- them. The cost of that lands on the designer at the worst moment: they've
-- picked the ticket up, the clock is running, and they're asking in a group
-- chat where the logo lives.
--
-- Links rather than uploads, deliberately. The files already live in Drive and
-- they change; a copy in this tool would be a stale copy within a month, and a
-- stale brand kit is worse than no brand kit because somebody will use it.
--
-- All four are optional. A brand added in ten seconds during a brief must stay
-- a brand added in ten seconds — the profile is something you fill in when you
-- have it, not a gate in front of raising work.
--
-- Safe to run more than once.
-- ===========================================================================

alter table brands add column if not exists brief_url      text not null default '';
alter table brands add column if not exists assets_url     text not null default '';
alter table brands add column if not exists onboarding_url text not null default '';
alter table brands add column if not exists notes          text not null default '';

comment on column brands.brief_url is
  'Where the brand brief lives. A link, because the document keeps moving.';
comment on column brands.assets_url is
  'Logos, fonts, brand kit — the folder, not a copy of it.';
comment on column brands.onboarding_url is
  'What the client themselves said when they signed.';
comment on column brands.notes is
  'The house rules for this brand. Usually what to avoid, which is the thing nobody writes down and everybody finds out the hard way.';

-- Nothing to do for row-level security: brands_read is already open to every
-- signed-in person (0001), which is what makes the profile reachable from a
-- ticket by the designer working it, and brands_staff_update (0014) already
-- says who may write. Neither needs widening.
