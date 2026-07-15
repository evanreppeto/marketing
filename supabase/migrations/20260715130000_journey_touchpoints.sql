-- Journey layer P1 — durable anonymous touch capture + identity stitch.
--
-- P0 (#446) assembles per-contact journeys from data already recorded
-- (engagement_events, leads, jobs, outcomes) — but only for KNOWN contacts.
-- P1 adds the anonymous pre-lead half of the ladder: a first-party collector
-- records touches against an anonymous_id BEFORE the visitor is a known contact,
-- and the identity is stitched onto a contact at identification (lead/form/signup).
--
-- Writes go through the service-role client (anonymous browsers have no session),
-- exactly like lead ingest. RLS + app_private.is_org_member gate the authenticated
-- UI reads; there are deliberately NO anon grants (see the DB RPC grant footgun —
-- anon-exposed writes are a leak vector). The public collector endpoint resolves
-- the org from a signed campaign token before writing, so it never trusts a
-- client-supplied org_id.

create table if not exists public.journey_identities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  -- First-party visitor id minted by the collector (a random token, not PII).
  anonymous_id text not null,
  -- Set when the anonymous identity is stitched onto a known CRM contact.
  contact_id uuid,
  resolution text not null default 'anonymous',
  first_seen_at timestamp with time zone not null default now(),
  last_seen_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint journey_identities_resolution_check check (resolution in ('anonymous', 'stitched', 'known')),
  constraint journey_identities_org_anon_uniq unique (org_id, anonymous_id)
);
create index if not exists journey_identities_org_contact_idx on public.journey_identities (org_id, contact_id);

create table if not exists public.journey_touchpoints (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  identity_id uuid not null references public.journey_identities (id) on delete cascade,
  -- Denormalized after a stitch so per-contact reads don't need the join.
  contact_id uuid,
  occurred_at timestamp with time zone not null default now(),
  kind text not null,
  direction text not null default 'inbound',
  channel text,
  campaign_id uuid,
  campaign_asset_id uuid,
  summary text,
  -- The public collector NEVER sets this true — conversions come from server-side
  -- outcomes, so a spoofed request can't fabricate revenue.
  is_conversion boolean not null default false,
  value_cents bigint,
  source text not null default 'collector',
  -- Optional idempotency key (org-scoped) so a retried beacon doesn't double-count.
  external_ref text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  constraint journey_touchpoints_direction_check check (direction in ('inbound', 'outbound', 'system'))
);
create index if not exists journey_touchpoints_identity_idx on public.journey_touchpoints (org_id, identity_id, occurred_at);
create index if not exists journey_touchpoints_contact_idx on public.journey_touchpoints (org_id, contact_id);
create unique index if not exists journey_touchpoints_external_ref_uidx
  on public.journey_touchpoints (org_id, external_ref)
  where external_ref is not null;

alter table public.journey_identities enable row level security;
alter table public.journey_touchpoints enable row level security;

create policy journey_identities_org_member_select on public.journey_identities
  as permissive for select to authenticated
  using ((select app_private.is_org_member(journey_identities.org_id)));
create policy journey_touchpoints_org_member_select on public.journey_touchpoints
  as permissive for select to authenticated
  using ((select app_private.is_org_member(journey_touchpoints.org_id)));

grant select, insert, update, delete on public.journey_identities to service_role;
grant select, insert, update, delete on public.journey_touchpoints to service_role;
grant select on public.journey_identities to authenticated;
grant select on public.journey_touchpoints to authenticated;
