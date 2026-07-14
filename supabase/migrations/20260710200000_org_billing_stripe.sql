-- supabase/migrations/20260710200000_org_billing_stripe.sql
--
-- Stripe subscription state on the per-org plan row (Tier-3 billing). The
-- platform bills each tenant; the Stripe webhook (POST /api/webhooks/stripe)
-- syncs the subscription's price → plan_tier and its status here, and the
-- Settings billing UI drives Checkout / Customer Portal. RLS already governs
-- org_plans (member read, admin write); the webhook writes via the service role.

alter table public.org_plans
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status text,
  add column if not exists current_period_end timestamptz;

-- One Stripe customer per org; fast webhook lookups by customer/subscription id.
create unique index if not exists org_plans_stripe_customer_idx
  on public.org_plans (stripe_customer_id)
  where stripe_customer_id is not null;

create index if not exists org_plans_stripe_subscription_idx
  on public.org_plans (stripe_subscription_id)
  where stripe_subscription_id is not null;
