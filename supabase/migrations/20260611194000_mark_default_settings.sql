-- Operator defaults consumed by /mark when queuing new agent chat work.
insert into public.app_settings (key, value) values
  ('mark_default_mode',  '"act"'::jsonb),
  ('mark_default_route', '"fast"'::jsonb)
on conflict (key) do nothing;
