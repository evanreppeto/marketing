-- supabase/migrations/20260710190000_org_plans.sql
--
-- Per-org billing plan + monthly usage cap (Tier-3). The platform pays all
-- provider API credits (Claude + Gemini) and bills each tenant; a plan sets the
-- monthly spend cap enforced against the ai_usage_events ledger
-- (src/lib/billing/entitlements.ts). An org with no row defaults to the 'free'
-- tier. `monthly_cap_cents` is an optional per-org override of the tier default.

create table if not exists public.org_plans (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  plan_tier text not null default 'free' check (plan_tier in ('free', 'starter', 'pro', 'scale')),
  monthly_cap_cents integer check (monthly_cap_cents is null or monthly_cap_cents > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger org_plans_set_updated_at
  before update on public.org_plans
  for each row execute function public.set_updated_at();

alter table public.org_plans enable row level security;

-- Any org member can see their plan; only owners/admins can change it.
create policy org_plans_member_select on public.org_plans
  as permissive for select to authenticated
  using (( select app_private.is_org_member(org_plans.org_id) ));

create policy org_plans_admin_write on public.org_plans
  as permissive for all to authenticated
  using (( select app_private.is_org_admin(org_plans.org_id) ))
  with check (( select app_private.is_org_admin(org_plans.org_id) ));

-- No anon access — plans are operator/admin data only.
grant select, insert, update, delete on public.org_plans to authenticated;
grant select, insert, update, delete on public.org_plans to service_role;
