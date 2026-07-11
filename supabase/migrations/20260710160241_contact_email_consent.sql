-- Per-contact email unsubscribe / consent flag for the outbound send path.
-- `email_unsubscribed_at` records when a contact opted out; NULL = emailable.
-- The partial index `contacts_emailable_idx` keeps the "who can we still email in
-- this persona segment" query cheap by indexing only currently-emailable rows.
--
-- Provenance: this change was applied to the marketing-staging DB out-of-band via
-- the Supabase MCP (recorded as migration 20260710160241) but its file was never
-- committed. Adopted into the repo on 2026-07-10 during migration-history
-- reconciliation so supabase/migrations/ is the single source of truth — the
-- version matches staging's ledger row exactly, and the DDL matches what staging
-- has materialized. See docs/staging-migration-reconciliation.md.

alter table public.contacts add column if not exists email_unsubscribed_at timestamptz;

create index if not exists contacts_emailable_idx
  on public.contacts (org_id, persona)
  where email_unsubscribed_at is null;
