# Backend Workspace Data Boundary Audit

Last updated: 2026-07-05

## Product Boundary

Arc should be scoped to a workspace first. A workspace owns shared brand context,
campaign memory, library assets, CRM references, approvals, and Arc API tokens.
Users own their identity, membership, role, and personal preferences.

## Implemented Boundary

- `organizations`, `workspaces`, `workspace_memberships`, `arc_instances`, and
  `workspace_invites` exist as the product tenancy foundation.
- RLS is enabled on public tables and org-member read policies have been added
  for the current app-facing tables.
- App signup/login now provisions or joins workspaces.
- Settings exposes workspace invites and lets admins revoke unused invite codes.
- `/api/v1/arc/*` now has a central `arcGuard()` helper that resolves
  `ArcWorkspaceScope` for routes that need tenant context.
- DB-issued Arc API tokens preserve `org_id` and `workspace_id` through the API
  auth helper; legacy env-token mode is retained for local/back-compat routes.
- Arc brand context/profile and brain routes now pass the resolved org scope
  into their org-aware backend functions.
- `agent_tasks` now has an additive migration for `org_id` and UUID
  `workspace_id`, backfill logic, indexes, and workspace-member/admin RLS
  policies.
- Arc task list/detail/claim/log/complete/block routes now pass the resolved
  Arc workspace scope into task reads and mutations.
- Agent task creation, operator task-detail actions, and the agent operations
  read model now carry or enforce `org_id` + `workspace_id` on the
  service-role `agent_tasks` path.
- Agent Operations dashboard related reads now apply `org_id` filters to
  `approval_items`, `agent_outputs`, and `campaigns`.
- Campaign workspace list/detail reads now resolve the current org and pass
  `org_id` through the campaign, asset, approval, output, decision, and related
  CRM aggregation queries.
- Campaign creation/edit/decision/launch/dispatch write helpers now accept the
  active tenant context and stamp `org_id` onto new campaign, asset, approval,
  decision, dispatch, and campaign-event rows while applying `org_id` filters to
  service-role lookups and updates.
- Arc draft and approval-recommendation write routes now use `arcGuard()` and
  pass the resolved Arc workspace scope into persistence helpers so new
  `approval_items`, `agent_outputs`, and `approval_recommendations` rows carry
  `org_id`.
- Arc approval list/detail routes now use `arcGuard()` and pass the resolved
  org scope through approval item, recommendation, campaign, asset, CRM, and
  output reads.
- Arc approval recommendation read/write routes now use `arcGuard()` and pass
  the resolved org/workspace scope into recommendation helpers.
- Arc CRM list routes now use `arcGuard()` and pass the resolved org scope into
  company, contact, lead, job, property, and outcome reads.
- Arc CRM lead detail now passes the resolved org scope into the lead lookup.
- Arc CRM interaction writes now use `arcGuard()` and pass the resolved org
  scope into note, task, activity, and companion activity persistence.
- Arc campaign draft-asset writes now pass the resolved org/workspace scope into
  campaign shell creation, asset promotion, approval gates, events, and
  opportunity draft linking.
- Arc media reads now use DB-issued Arc token scope for `media_assets.org_id`
  filtering instead of falling back to the UI workspace context.
- Arc message inbox, claim, reclaim, reply-settle, and live-step writes now pass
  resolved org/workspace scope through `agent_tasks` queue helpers before
  reading or mutating pending Arc chat work.
- Arc partner campaign runs and social-ad ingest routes now use `arcGuard()`
  and pass the resolved token tenant into generator persistence so generated
  campaign, asset, approval, event, output, and task rows are org/workspace
  scoped.
- Arc competitor-intel ingest now uses `arcGuard()` and writes `org_id` to
  `competitor_campaigns`; migration `20260619124500_competitor_intel_org_scope.sql`
  adds the missing live-table boundary.
- Arc media generation and brand website analysis now use `arcGuard()`; generated
  media storage objects are partitioned under `arc-generated/{orgId}/{workspaceId}`.
- Arc performance slices now use `arcGuard()` and filter campaign results by the
  resolved Arc token `org_id`.
- `arcGuard()` now rejects malformed database-issued Arc tokens that are missing
  `org_id` or `workspace_id` instead of falling through to legacy env-token
  workspace resolution.
- Campaign results persistence is tenant-aware for scoped callers and applies
  `org_id` to lookup/update/insert paths.
- **DB-enforced isolation (first slice).** The CRM read-model
  (`src/lib/crm/read-model.ts`) now resolves reads through
  `resolveTenantReadHandle()` (`src/lib/supabase/tenant-client.ts`): in
  `supabase` auth mode with a live session it queries via the user's RLS-scoped
  client, so the *database* — not just the app filter — enforces org isolation.
  Open / operator / no-session paths degrade to the admin client with an
  explicit `org_id` filter, unchanged.
- Write-side RLS landed for the six CRM object tables (companies, contacts,
  properties, leads, jobs, outcomes) in
  `20260705120000_crm_object_write_policies.sql` — the first table group where a
  user-scoped client is isolated for INSERT/UPDATE/DELETE, not just SELECT.
- Slice 2 extends the same shape to the opportunities inbox:
  `20260705130000_opportunities_write_policies.sql` adds the write policies and
  `src/lib/opportunities/read-model.ts` now resolves reads through
  `resolveTenantReadHandle()`.
- Proof: `supabase/tests/rls_crm_isolation.sql` asserts cross-tenant read /
  insert / update / delete denial for `companies` (representative — every migrated
  table uses the same `is_org_member(org_id)` predicate);
  `src/lib/supabase/tenant-client.test.ts` covers the client selector. The
  pattern and rollout checklist live in [TENANCY.md](./TENANCY.md).

## Current Gaps

- The legacy campaign-results env-token ingest route cannot safely infer a
  workspace yet. It should be replaced by DB-issued workspace tokens or an
  explicit trusted integration scope before production multi-org usage.
- Local migration history and generated Supabase types need reconciliation for
  campaign-adjacent `org_id` columns such as `approval_recommendations` and any
  campaign tables that were patched live.
- Most service-role read models still bypass RLS. The CRM read-model is the
  first migrated onto the user-scoped client via `resolveTenantReadHandle()`
  (see [TENANCY.md](./TENANCY.md)); campaigns, opportunities, vault, personas,
  performance, and the agent-operations reads still need the same reroute, and
  their tables still need write-side policies.
- Legacy env-token Arc API mode is not workspace-specific. It should eventually
  be replaced by DB-issued workspace tokens only.

## Next Backend Slices

1. Verify the user-applied `20260618193000_agent_tasks_workspace_scope.sql`
   migration live: columns, indexes, policies, and no null task workspace
   backfill. Current Codex Supabase MCP access cannot query the project.
2. Cross-tenant isolation is now proven at the DB layer for CRM `companies`
   (`supabase/tests/rls_crm_isolation.sql`). Extend the same proof to tasks,
   approvals, brain nodes, campaigns, and media as each table group moves onto
   write-side RLS.
3. Decide whether `ping` and `health` should stay global diagnostics or require
   a resolved workspace scope like the data-bearing Arc routes.
4. In progress: `resolveTenantReadHandle()` is the shared authenticated-client
   boundary, and the CRM read-model now uses it. Roll it out to the remaining
   service-role UI read models per [TENANCY.md](./TENANCY.md).
