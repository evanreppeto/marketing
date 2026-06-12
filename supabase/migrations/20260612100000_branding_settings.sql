-- User/company branding consumed by the app shell, metadata, and chat labels.
insert into public.app_settings (key, value)
values
  ('product_label',     '"Marketing"'::jsonb),
  ('assistant_name',    '"Mark"'::jsonb),
  ('brand_short_name',  '"BS"'::jsonb),
  ('brand_logo_url',   '""'::jsonb),
  ('brand_favicon_url','"/icon.svg"'::jsonb)
on conflict (key) do nothing;

update public.app_settings
set value = '"Big Shoulders"'::jsonb
where key = 'workspace_name'
  and value = '"Big Shoulders Restoration M&P"'::jsonb;
