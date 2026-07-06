# Tenant Isolation: RLS Playbook

Last updated: 2026-07-05

How the app keeps one workspace's data invisible to another — and how to extend
that guarantee, table group by table group. This is the pattern reference; the
running status log is [backend-workspace-data-boundary-audit.md](./backend-workspace-data-boundary-audit.md).

## The problem this closes

Historically every query ran through the **service-role admin client**
(`getSupabaseAdminClient()`), which **bypasses row-level security**. Isolation
lived entirely in application code: each read/write had to remember
`.eq("org_id", orgId)`. One forgotten filter = a cross-tenant leak, with nothing
in the database to stop it. That is fine for an internal tool; it is not
safe enough to put two real customers on.

## The two-client model

| Client | Built from | RLS | Used by |
| --- | --- | --- | --- |
| **Admin** (`getSupabaseAdminClient`) | service-role key | **bypassed** | System actors: lead ingestion, the Arc runner, `/api/v1` bearer routes, background jobs |
| **User** (`createSupabaseAuthServerClient`) | anon key + session JWT | **enforced** | Signed-in human requests (server components / actions) in `supabase` auth mode |

The security property we want: **a signed-in user physically cannot read or
write a row whose `org_id` they are not a member of**, even if the app forgets a
filter. That only holds when the query runs through the *user* client. The admin
client stays for system actors that legitimately act across the whole tenant set.

## What the database enforces

- **Membership predicate:** `app_private.is_org_member(org_id)` (and
  `is_org_admin` / `is_workspace_member` / `is_workspace_admin`), `security
  definer`, defined in `20260618120000_product_tenancy_foundation.sql`.
- **SELECT** policies on ~45 product tables — `20260618185612_org_member_read_policies.sql`.
- **INSERT / UPDATE / DELETE** policies on the six CRM object tables (companies,
  contacts, properties, leads, jobs, outcomes) —
  `20260705120000_crm_object_write_policies.sql`; on `opportunities` —
  `20260705130000_opportunities_write_policies.sql`; and across the campaign /
  approval surface (campaigns, campaign_assets, approval_items,
  approval_decisions, approval_recommendations, agent_outputs, campaign_events,
  campaign_dispatches, campaign_results) —
  `20260705140000_campaign_surface_write_policies.sql`; and on the wired
  human-editable surfaces — vault_notes, crm_notes, crm_tasks, crm_activities,
  media_assets, media_folders — `20260706120000_human_surface_write_policies.sql`.
  With that, **every wired human-editable surface is write-isolated at the DB.**
  The tables still on admin-only writes are system-owned / derived (guardrail
  rules, routing decisions, integrity findings, persona intelligence) and want
  role-gating before member-write. Every policy uses the identical
  `is_org_member(org_id)` predicate, so the `companies` isolation test below is
  representative of them all.
- Credential-bearing tables (connectors, API tokens) intentionally stay
  **service-role-only** — never granted to `authenticated`.

## The app seam

Every org-scoped read helper already accepts an optional client and, when one is
passed, drops its manual org filter and trusts RLS:

```ts
// repo / read-model shape (leads.ts, crm/read-model.ts, …)
const orgId = client ? null : await getCurrentOrgId();
const supabase = client ?? getSupabaseAdminClient();
// … if (orgId) query = query.eq("org_id", orgId);
```

`resolveTenantReadHandle()` (`src/lib/supabase/tenant-client.ts`) is the chokepoint
that picks the right client:

- **`supabase` mode + live session** → the user client **plus** the active-workspace
  `orgId`. RLS enforces "only orgs you belong to" (a user may be in several); the
  `orgId` narrows the view to the active workspace. Same rows as before, now with
  a DB-level backstop underneath.
- **open / operator mode, or no request scope / no session** → the admin client +
  `orgId`. Behavior is identical to before — this keeps local dev and the
  single-operator deployment working. It never throws for auth reasons; it
  degrades to the admin path.

Call sites resolve the handle instead of reaching for the admin client directly:

```ts
const { client: supabase, orgId } = client ? { client, orgId: null } : await resolveTenantReadHandle();
const data = await getCrmTableBundle(supabase, orgId);
```

## Rollout checklist — extend to the next table group

Do this per feature (campaigns, opportunities, vault, personas, …):

1. **Confirm the DB side.** The table has a non-null `org_id` and a SELECT policy
   (most do, from the read-policy migration). If not, add them first.
2. **Add write policies.** Copy `20260705120000_crm_object_write_policies.sql`,
   swap the table list. Keep the `is_org_member(org_id)` predicate and the
   `authenticated` grants.
3. **Reroute reads.** In that feature's read-model / repo, replace the
   `getSupabaseAdminClient()` + `getCurrentOrgId()` idiom with
   `resolveTenantReadHandle()` (see the CRM read-model for the reference edit).
4. **Leave system writes on the admin client.** Arc-runner and `/api/v1` bearer
   routes are tenant-wide actors — they should keep bypassing RLS and stamping
   `org_id` explicitly. Only move *human* write paths onto the user client, and
   only once step 2 is in place.
5. **Prove it.** Extend `supabase/tests/rls_crm_isolation.sql` (or add a sibling)
   to cover the new table, and run it against a migrated stack.

## Proving isolation

- **App-side (runs in CI):** `pnpm test src/lib/supabase/tenant-client.test.ts`
  proves the selector routes to the user client in `supabase` mode and degrades
  safely otherwise.
- **DB-side (needs a real Postgres):** `supabase/tests/rls_crm_isolation.sql`
  seeds two orgs/users and asserts cross-tenant read/insert/update/delete denial.
  Run it against a **preview branch** or a local `supabase db reset` stack — not
  the shared project — via `psql`, the SQL editor, or the Supabase MCP. Expected
  final row: `result = 'PASS: rls_crm_isolation'`.

## Known follow-ups

- **Campaigns read reroute is caller-layer.** The campaign-surface write policies
  are in place, but the campaigns read-model takes `org_id` as a parameter from
  its callers (via `applyOrgScope`), so moving its reads onto the user client is a
  change at the call sites, not the read-model — a separate follow-up from the
  DB-truth migration.
- **Stale generated types.** `database.types.ts` does not list `org_id` for the
  campaign-adjacent tables even though the columns exist (added in
  `20260619113000` / `20260615161347`). A `supabase gen types` refresh is overdue;
  it doesn't affect the SQL migrations, which run against the real columns.
- **Live migration lag.** The shared project is only migrated through mid-June;
  the tenancy foundation, read policies, and this write-policy migration must be
  applied there before RLS is live in production. Validate on a branch first.
- **Role-gating.** Current write policies let any active org member write. Layer
  role checks (`is_org_admin`, or reviewer-vs-marketer rules) on top where a
  feature needs them.
- **Multi-org active workspace.** RLS permits every org a user belongs to; the
  app still pins the active workspace with an explicit `orgId`. If we later want
  RLS alone to scope to the active workspace, thread the workspace id into a
  policy predicate.
- **Turn `supabase` auth mode on.** This slice only changes behavior when
  `ARC_AUTH_MODE=supabase`. Until then RLS sits dormant beneath the admin path.
