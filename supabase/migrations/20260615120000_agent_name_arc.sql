-- The configurable agent display name was originally seeded from the old agent
-- identity. Default it to "Arc" instead. Operators
-- can still override this per-tenant in Settings → Branding (app_settings is the
-- source of truth; this only changes the seeded default, not a custom name).
update public.app_settings
set value = '"Arc"'::jsonb
where key = 'assistant_name'
  and value in ('"Mark"'::jsonb, '"Hermes"'::jsonb);

-- Ensure the row exists for installs that skipped the branding seed.
insert into public.app_settings (key, value)
values ('assistant_name', '"Arc"'::jsonb)
on conflict (key) do nothing;
