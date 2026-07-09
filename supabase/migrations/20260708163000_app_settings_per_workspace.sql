-- Make app_settings per-workspace (org-scoped) instead of a single global row.
--
-- The baseline table had PRIMARY KEY (key) alone, so only ONE row per key could
-- exist across ALL organizations. In a multi-tenant product that is a
-- correctness bug: one workspace changing its accent / agent display name /
-- support email would overwrite the value for every other workspace. The table
-- already carries a NOT NULL org_id (default = the seeded org) and a per-org
-- SELECT RLS policy; this promotes org_id into the primary key so each workspace
-- keeps its own settings, and the app layer scopes every read/write by org_id
-- (writes go through the service-role client, which bypasses RLS, so the filter
-- must be explicit — mirroring the vault and other read-models).
--
-- Safe on existing data: any rows present were written with org_id defaulted to
-- the seeded org and carry distinct keys, so (org_id, key) is already unique.

alter table public.app_settings drop constraint app_settings_pkey;
alter table public.app_settings add constraint app_settings_pkey primary key (org_id, key);
