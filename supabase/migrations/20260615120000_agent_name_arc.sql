-- The configurable agent display name was seeded as "Mark" in
-- 20260612100000_branding_settings.sql. Default it to "Arc" instead. Operators
-- can still override this per-tenant in Settings → Branding (app_settings is the
-- source of truth; this only changes the seeded default, not a custom name).
update public.app_settings
set value = '"Arc"'::jsonb
where key = 'assistant_name'
  and value = '"Mark"'::jsonb;

-- Ensure the row exists for installs that skipped the branding seed.
insert into public.app_settings (key, value)
values ('assistant_name', '"Arc"'::jsonb)
on conflict (key) do nothing;
