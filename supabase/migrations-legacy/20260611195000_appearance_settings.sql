-- Operator-controlled UI preferences consumed by RootLayout.
insert into public.app_settings (key, value) values
  ('appearance_accent',  '"gold"'::jsonb),
  ('appearance_density', '"comfortable"'::jsonb),
  ('appearance_motion',  '"standard"'::jsonb)
on conflict (key) do nothing;
