-- The engagement dedupe key was a PARTIAL unique index (WHERE source_system IS
-- NOT NULL AND external_event_id IS NOT NULL). Postgres cannot match a plain
-- ON CONFLICT (source_system, external_event_id) — the form PostgREST/supabase-js
-- upserts generate — against a partial index, so every idempotent engagement
-- write failed at runtime: the Resend webhook receiver (#586) and the BYO
-- external-send recorder (#595). Found live-testing the BYO loop on prod.
--
-- Replace it with a FULL unique index on the same columns. NULLs are distinct
-- under the default semantics, so the many rows without a provider key are
-- unaffected; uniqueness for keyed rows is unchanged (the partial index already
-- enforced it, so this creation cannot fail on existing data).
drop index if exists public.engagement_events_source_external_unique_idx;
create unique index engagement_events_source_external_unique_idx
  on public.engagement_events (source_system, external_event_id);
