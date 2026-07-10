-- supabase/migrations/20260710180000_tier1_isolation_hardening.sql
--
-- Tier-1 multi-tenant data-isolation hardening. Three independent DB-level holes
-- that let data cross the tenant boundary once >1 org shares the instance:
--
--   1. campaign_shares shipped with NO row-level security (20260708140000) while
--      the baseline blanket-grants CRUD to anon/authenticated on public tables —
--      so in supabase auth mode the share list was readable/writable cross-tenant
--      over PostgREST. Mirror the arc_conversation_shares policies (owner-managed,
--      shared-with user can see their own row).
--
--   2. public.audits was anon world-readable (`audits_public_read ... using (true)`)
--      and holds PII + payment references (email, stripe_* ids, subscription_id)
--      with no org_id. No code in this app reads or writes it (legacy table), so
--      lock it down: drop the permissive read policy and revoke anon privileges.
--      RLS stays enabled; service_role still reaches it for backups/admin.
--
--   3. connections had a GLOBAL `unique (provider)` constraint — only ONE org
--      could ever hold a 'resend' (or any) connection across the whole database,
--      a hard multi-tenant break. Re-scope uniqueness to (org_id, provider).

-- 1. campaign_shares RLS ------------------------------------------------------
alter table public.campaign_shares enable row level security;

create policy campaign_shares_select on public.campaign_shares
  as permissive for select to authenticated
  using (
    (user_id = (select auth.uid()))
    or exists (
      select 1
      from public.campaigns c
      where c.id = campaign_shares.campaign_id
        and c.owner_id = (select auth.uid())
    )
  );

create policy campaign_shares_owner_write on public.campaign_shares
  as permissive for all to authenticated
  using (
    exists (
      select 1
      from public.campaigns c
      where c.id = campaign_shares.campaign_id
        and c.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.campaigns c
      where c.id = campaign_shares.campaign_id
        and c.owner_id = (select auth.uid())
    )
  );

-- 2. audits: close the anon PII/payment read hole ------------------------------
drop policy if exists audits_public_read on public.audits;
revoke all privileges on public.audits from anon;

-- 3. connections: scope uniqueness per org ------------------------------------
alter table public.connections drop constraint if exists connections_provider_key;
alter table public.connections
  add constraint connections_org_provider_key unique (org_id, provider);
