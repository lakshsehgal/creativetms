-- ===========================================================================
-- 0019 — Remembering that the call sheet went out
--
-- Sending is the one thing this tool does that leaves the building. Once a
-- crew has the sheet in their inbox, the person who sent it needs to be able
-- to see that they did — and the next person opening the shoot needs to see
-- it too, or the crew gets the same call sheet three times from three people
-- on the morning of.
--
-- Safe to run more than once.
-- ===========================================================================

alter table shoots add column if not exists sent_at timestamptz;
alter table shoots add column if not exists sent_by uuid references profiles (id) on delete set null;

-- Who it actually reached, not who was on the list at the time. The two drift
-- the moment somebody joins the team or a crew email is corrected, and the
-- useful question afterwards is always "did it get to them", not "who would
-- it go to if I sent it now".
alter table shoots add column if not exists sent_to text[] not null default '{}';

comment on column shoots.sent_to is
  'The addresses the last send actually went to. A record, not a recipient list to reuse.';
