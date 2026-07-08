-- Partner Directory sync: idempotency keys for BS → Arc upserts.
-- A synced partner is identified by (org_id, metadata->>'source_plumber_id').
-- Partial unique indexes make the upsert race-safe and dup-proof while leaving
-- rows that did NOT come from the sync (no source_plumber_id) unconstrained.

create unique index if not exists companies_source_plumber_idx
  on public.companies (org_id, (metadata ->> 'source_plumber_id'))
  where metadata ->> 'source_plumber_id' is not null;

create unique index if not exists contacts_source_plumber_idx
  on public.contacts (org_id, (metadata ->> 'source_plumber_id'))
  where metadata ->> 'source_plumber_id' is not null;
