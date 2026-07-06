-- ---------------------------------------------------------------------------
-- RLS cross-tenant isolation proof — CRM `companies` table.
-- ---------------------------------------------------------------------------
-- This is the guardrail for DB-enforced tenancy (see docs/TENANCY.md). It seeds
-- two organizations + two users, then runs queries AS each user (via the
-- Supabase `authenticated` role + a request.jwt.claims sub) and asserts that
-- neither can read or write the other's rows. RLS is the enforcement; the app's
-- org filters are just a UX pin on top.
--
-- Everything runs inside a transaction that ROLLS BACK — it leaves no data.
--
-- Prerequisites: a Supabase-flavored Postgres with ALL migrations applied
-- (a preview branch, or `supabase db reset` on a local stack). It relies on the
-- Supabase `auth` schema, the `authenticated` role, and `auth.uid()`.
--
-- Run it:
--   psql "$DATABASE_URL" -f supabase/tests/rls_crm_isolation.sql
--   -- or paste into the Supabase SQL editor / run via the Supabase MCP.
--
-- Expected final row:  result = 'PASS: rls_crm_isolation'
-- A failure raises a loud exception naming the leak and aborts.
-- ---------------------------------------------------------------------------

begin;

-- Fixed ids so we can reference them without RETURNING (portable across psql,
-- the SQL editor, and MCP execute_sql — no \set meta-commands).
-- org A / user A:  aaaa…    org B / user B:  bbbb…

-- Seed as the table owner (bypasses RLS). If your local auth.users has extra
-- NOT NULL columns, add them here — these are the cross-version-stable ones.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rls-user-a@example.test', '', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rls-user-b@example.test', '', now(), now());

insert into public.organizations (id, name, slug)
values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'RLS Test Org A', 'rls-test-org-a'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'RLS Test Org B', 'rls-test-org-b');

-- Each user is an active member of exactly one org.
insert into public.organization_memberships (org_id, user_id, role, status)
values
  ('aaaaaaaa-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'owner', 'active'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'owner', 'active');

-- One company in each org.
insert into public.companies (org_id, name)
values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'Org A Company'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'Org B Company');

-- ---------------------------------------------------------------------------
-- Act as user A (member of org A only).
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;

-- Read isolation: sees org A, cannot see org B.
do $$
declare
  visible_a int;
  visible_b int;
begin
  select count(*) into visible_a from public.companies where org_id = 'aaaaaaaa-0000-0000-0000-000000000000';
  select count(*) into visible_b from public.companies where org_id = 'bbbbbbbb-0000-0000-0000-000000000000';

  if visible_a < 1 then
    raise exception 'FAIL: user A cannot read its own org A companies (saw %)', visible_a;
  end if;
  if visible_b <> 0 then
    raise exception 'LEAK: user A can read % of org B''s companies through RLS', visible_b;
  end if;
end $$;

-- Write isolation: inserting into org B must be blocked by the WITH CHECK policy.
do $$
begin
  insert into public.companies (org_id, name)
  values ('bbbbbbbb-0000-0000-0000-000000000000', 'cross-tenant-insert');
  raise exception 'LEAK: user A inserted a company into org B';
exception
  when insufficient_privilege then null; -- expected: RLS blocked the write
end $$;

-- Positive control: user A CAN write to its own org.
do $$
begin
  insert into public.companies (org_id, name)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'same-tenant-insert');
exception
  when insufficient_privilege then
    raise exception 'FAIL: user A was blocked from writing to its own org A';
end $$;

-- Cross-tenant UPDATE/DELETE must affect zero rows (RLS filters them out).
do $$
declare
  touched int;
begin
  update public.companies set name = 'hijacked'
  where org_id = 'bbbbbbbb-0000-0000-0000-000000000000';
  get diagnostics touched = row_count;
  if touched <> 0 then
    raise exception 'LEAK: user A updated % of org B''s rows', touched;
  end if;

  delete from public.companies where org_id = 'bbbbbbbb-0000-0000-0000-000000000000';
  get diagnostics touched = row_count;
  if touched <> 0 then
    raise exception 'LEAK: user A deleted % of org B''s rows', touched;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Symmetry: act as user B, confirm the mirror image.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  visible_a int;
  visible_b int;
begin
  select count(*) into visible_a from public.companies where org_id = 'aaaaaaaa-0000-0000-0000-000000000000';
  select count(*) into visible_b from public.companies where org_id = 'bbbbbbbb-0000-0000-0000-000000000000';

  if visible_b < 1 then
    raise exception 'FAIL: user B cannot read its own org B companies (saw %)', visible_b;
  end if;
  if visible_a <> 0 then
    raise exception 'LEAK: user B can read % of org A''s companies through RLS', visible_a;
  end if;
end $$;

reset role;

select 'PASS: rls_crm_isolation' as result;

rollback;
