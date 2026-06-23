-- Provenance + review gate for Arc-created/updated CRM records.
-- Defaults preserve existing human-ingest behavior: every current row and the
-- /api/v1/leads/ingest path stays origin='operator', review_status='active'.

alter table public.companies
  add column if not exists origin text not null default 'operator'
    check (origin in ('operator', 'agent')),
  add column if not exists review_status text not null default 'active'
    check (review_status in ('active', 'proposed', 'dismissed'));

alter table public.contacts
  add column if not exists origin text not null default 'operator'
    check (origin in ('operator', 'agent')),
  add column if not exists review_status text not null default 'active'
    check (review_status in ('active', 'proposed', 'dismissed'));

alter table public.properties
  add column if not exists origin text not null default 'operator'
    check (origin in ('operator', 'agent')),
  add column if not exists review_status text not null default 'active'
    check (review_status in ('active', 'proposed', 'dismissed'));

alter table public.leads
  add column if not exists origin text not null default 'operator'
    check (origin in ('operator', 'agent')),
  add column if not exists review_status text not null default 'active'
    check (review_status in ('active', 'proposed', 'dismissed')),
  add column if not exists agent_confidence numeric
    check (agent_confidence is null or (agent_confidence >= 0 and agent_confidence <= 1));

comment on column public.leads.origin is 'operator (human) or agent (Arc) that created the record.';
comment on column public.leads.review_status is 'active = live; proposed = awaiting human confirm; dismissed = rejected.';
comment on column public.leads.agent_confidence is 'Arc self-rated confidence 0-1 when origin=agent.';
