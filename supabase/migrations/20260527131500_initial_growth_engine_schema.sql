-- Growth Engine core schema for Big Shoulders Restoration.
-- This migration creates the six-object CRM foundation:
-- companies, contacts, properties, leads, jobs, and outcomes.

create extension if not exists pgcrypto;

create type public.persona_mapping as enum (
  'persona_homeowner_emergency',
  'persona_homeowner_preventative',
  'persona_homeowner_rebuild',
  'persona_landlord',
  'persona_hoa_board',
  'persona_property_manager',
  'persona_insurance_agent',
  'persona_listing_agent',
  'persona_buyers_agent',
  'persona_plumbing_partner',
  'persona_hvac_roof_electrical_partner',
  'persona_gc_remodeler_partner',
  'unassigned_persona'
);

create type public.company_status as enum (
  'active',
  'inactive',
  'archived'
);

create type public.contact_status as enum (
  'active',
  'inactive',
  'do_not_contact',
  'archived'
);

create type public.lead_status as enum (
  'new',
  'validated',
  'needs_review',
  'qualified',
  'converted',
  'lost',
  'archived'
);

create type public.routing_recommendation as enum (
  'target',
  'elevated',
  'downgraded',
  'isolated',
  'archived'
);

create type public.job_status as enum (
  'pending',
  'scheduled',
  'in_progress',
  'completed',
  'canceled'
);

create type public.outcome_status as enum (
  'pending',
  'won',
  'lost',
  'paid',
  'written_off'
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  persona public.persona_mapping not null default 'unassigned_persona',
  status public.company_status not null default 'active',
  website_url text,
  phone text,
  email text,
  partner_tier text check (partner_tier is null or partner_tier in ('A', 'B', 'C')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  persona public.persona_mapping not null default 'unassigned_persona',
  status public.contact_status not null default 'active',
  first_name text,
  last_name text,
  full_name text generated always as (
    nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
  ) stored,
  email text,
  phone text,
  title text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_name_or_channel_check check (
    length(btrim(coalesce(first_name, ''))) > 0
    or length(btrim(coalesce(last_name, ''))) > 0
    or length(btrim(coalesce(email, ''))) > 0
    or length(btrim(coalesce(phone, ''))) > 0
  )
);

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  persona public.persona_mapping not null default 'unassigned_persona',
  street_line_1 text not null check (length(btrim(street_line_1)) > 0),
  street_line_2 text,
  city text not null check (length(btrim(city)) > 0),
  state text not null check (length(btrim(state)) = 2),
  postal_code text not null check (length(btrim(postal_code)) > 0),
  property_type text check (
    property_type is null
    or property_type in ('single_family', 'multi_family', 'condo', 'commercial', 'industrial', 'hoa', 'other')
  ),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  persona public.persona_mapping not null,
  status public.lead_status not null default 'new',
  routing_recommendation public.routing_recommendation not null default 'target',
  source text not null check (length(btrim(source)) > 0),
  external_lead_id text,
  loss_summary text,
  loss_signals text[] not null default '{}'::text[],
  matched_target_keywords text[] not null default '{}'::text[],
  matched_non_target_keywords text[] not null default '{}'::text[],
  lead_score integer not null default 0 check (lead_score between 0 and 100),
  received_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_persona_not_unassigned_check check (persona <> 'unassigned_persona'),
  constraint leads_relationship_present_check check (
    contact_id is not null
    or property_id is not null
    or company_id is not null
  )
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  persona public.persona_mapping not null default 'unassigned_persona',
  status public.job_status not null default 'pending',
  job_number text unique,
  scheduled_at timestamptz,
  completed_at timestamptz,
  estimated_revenue_cents bigint check (estimated_revenue_cents is null or estimated_revenue_cents >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_completion_after_schedule_check check (
    completed_at is null
    or scheduled_at is null
    or completed_at >= scheduled_at
  )
);

create table public.outcomes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  persona public.persona_mapping not null default 'unassigned_persona',
  status public.outcome_status not null default 'pending',
  gross_revenue_cents bigint check (gross_revenue_cents is null or gross_revenue_cents >= 0),
  gross_margin_cents bigint,
  closed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outcomes_source_present_check check (
    job_id is not null
    or lead_id is not null
  )
);

create index companies_persona_idx on public.companies(persona);
create index companies_status_idx on public.companies(status);

create index contacts_company_id_idx on public.contacts(company_id);
create index contacts_persona_idx on public.contacts(persona);
create index contacts_status_idx on public.contacts(status);
create index contacts_email_idx on public.contacts(email) where email is not null;
create index contacts_phone_idx on public.contacts(phone) where phone is not null;

create index properties_company_id_idx on public.properties(company_id);
create index properties_contact_id_idx on public.properties(contact_id);
create index properties_persona_idx on public.properties(persona);
create index properties_address_idx on public.properties(city, state, postal_code);

create index leads_company_id_idx on public.leads(company_id);
create index leads_contact_id_idx on public.leads(contact_id);
create index leads_property_id_idx on public.leads(property_id);
create index leads_persona_idx on public.leads(persona);
create index leads_status_idx on public.leads(status);
create index leads_routing_recommendation_idx on public.leads(routing_recommendation);
create index leads_received_at_idx on public.leads(received_at desc);
create unique index leads_source_external_id_idx
  on public.leads(source, external_lead_id)
  where external_lead_id is not null;

create index jobs_lead_id_idx on public.jobs(lead_id);
create index jobs_company_id_idx on public.jobs(company_id);
create index jobs_contact_id_idx on public.jobs(contact_id);
create index jobs_property_id_idx on public.jobs(property_id);
create index jobs_persona_idx on public.jobs(persona);
create index jobs_status_idx on public.jobs(status);

create index outcomes_job_id_idx on public.outcomes(job_id);
create index outcomes_lead_id_idx on public.outcomes(lead_id);
create index outcomes_company_id_idx on public.outcomes(company_id);
create index outcomes_contact_id_idx on public.outcomes(contact_id);
create index outcomes_property_id_idx on public.outcomes(property_id);
create index outcomes_persona_idx on public.outcomes(persona);
create index outcomes_status_idx on public.outcomes(status);
create index outcomes_closed_at_idx on public.outcomes(closed_at desc) where closed_at is not null;

create trigger companies_set_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

create trigger contacts_set_updated_at
before update on public.contacts
for each row execute function public.set_updated_at();

create trigger properties_set_updated_at
before update on public.properties
for each row execute function public.set_updated_at();

create trigger leads_set_updated_at
before update on public.leads
for each row execute function public.set_updated_at();

create trigger jobs_set_updated_at
before update on public.jobs
for each row execute function public.set_updated_at();

create trigger outcomes_set_updated_at
before update on public.outcomes
for each row execute function public.set_updated_at();

alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.properties enable row level security;
alter table public.leads enable row level security;
alter table public.jobs enable row level security;
alter table public.outcomes enable row level security;
