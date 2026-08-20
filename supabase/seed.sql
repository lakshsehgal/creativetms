-- Optional starter data. Run it after 0001_init.sql if you want the board to
-- have something in it on day one. Benchmarks are already seeded by the
-- migration itself — adjust those from the Team page once you have real
-- numbers to go on.

insert into brands (name, color) values
  ('Acme Skincare', '#3987e5'),
  ('Bolt Energy',   '#d95926'),
  ('Terra Foods',   '#199e70')
on conflict (name) do nothing;
