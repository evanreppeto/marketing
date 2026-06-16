-- Operator defaults consumed by /arc when queuing new agent chat work.
insert into public.app_settings (key, value) values
  ('arc_default_mode',  '"act"'::jsonb),
  ('arc_default_route', '"fast"'::jsonb)
on conflict (key) do nothing;
