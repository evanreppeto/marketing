-- Connector cost governance (BSR-372): usage metering + spend caps for the
-- `metered` connector tier of the HYBRID cost model (BSR-363).
--
-- Only `metered` connectors (paid third-party data vendors — enrichment, permit /
-- property data) are governed. `free` and `byo_key` connectors never write here —
-- the app layer asserts it (src/lib/connectors/metering.ts) and this schema only
-- ever receives metered rows.
--
-- Two org-scoped tables, both written through the service-role admin client (which
-- bypasses RLS — the app filters by workspace_id / org_id in code) and readable by
-- org members via the go-forward `app.current_org` SELECT policy. No anon grants
-- (see the DB RPC grant footgun: anon-exposed writes are a leak vector).

-- ---------------------------------------------------------------------------
-- 1. Usage ledger — one row per billable metered call.
-- ---------------------------------------------------------------------------
create table if not exists public.connector_usage_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  connector_key text not null,
  units integer not null default 0,
  cost_estimate_cents integer not null default 0,
  context jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint connector_usage_events_connector_key_check check (length(btrim(connector_key)) > 0),
  constraint connector_usage_events_units_check check (units >= 0),
  constraint connector_usage_events_cost_check check (cost_estimate_cents >= 0)
);

create index if not exists connector_usage_events_workspace_occurred_idx
  on public.connector_usage_events using btree (workspace_id, occurred_at desc);
create index if not exists connector_usage_events_org_occurred_idx
  on public.connector_usage_events using btree (org_id, occurred_at desc);
create index if not exists connector_usage_events_connector_idx
  on public.connector_usage_events using btree (connector_key);

alter table public.connector_usage_events enable row level security;

drop policy if exists connector_usage_events_current_org on public.connector_usage_events;
create policy connector_usage_events_current_org on public.connector_usage_events
  as permissive for select to authenticated
  using ((org_id = (nullif(current_setting('app.current_org'::text, true), ''::text))::uuid));

grant select, insert, update, delete on public.connector_usage_events to service_role;
grant select on public.connector_usage_events to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Spend budget — one configurable cap per workspace. Absent row => the
--    app's DEFAULT_SPEND_CAP_CENTS applies. Raising the cap IS the operator's
--    explicit "approve $X more spend" decision that unlocks a refused call.
-- ---------------------------------------------------------------------------
create table if not exists public.connector_spend_budgets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  cap_cents integer not null default 5000,
  period text not null default 'monthly',
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connector_spend_budgets_cap_check check (cap_cents >= 0),
  constraint connector_spend_budgets_period_check check (period in ('monthly')),
  unique (workspace_id)
);

create index if not exists connector_spend_budgets_org_idx
  on public.connector_spend_budgets using btree (org_id);

alter table public.connector_spend_budgets enable row level security;

drop policy if exists connector_spend_budgets_current_org on public.connector_spend_budgets;
create policy connector_spend_budgets_current_org on public.connector_spend_budgets
  as permissive for select to authenticated
  using ((org_id = (nullif(current_setting('app.current_org'::text, true), ''::text))::uuid));

grant select, insert, update, delete on public.connector_spend_budgets to service_role;
grant select on public.connector_spend_budgets to authenticated;
