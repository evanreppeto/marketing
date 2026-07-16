# Org-scoping audit — how rows silently land in Big Shoulders

**Date:** 2026-07-16 · **Scope:** every `.insert()` / `.upsert()` into the 32 tables whose `org_id` defaults to BSR · **Method:** 3 parallel readers tracing each payload (inline objects, pre-built variables, spreads), verified against real Postgres.

> **Nothing here is hurting production today.** There is one tenant, and BSR *is* the correct answer, so every wrong answer is currently indistinguishable from the right one. This document exists because "make it multi-tenant" is exactly the change that converts these from harmless to silent data-mixing — and because the failure is **silent by construction**: there is no error to catch, no crash, no red test.

---

## The root cause

```sql
-- baseline.sql:194
CREATE FUNCTION public.default_organization_id() RETURNS uuid STABLE AS $$
  select id from public.organizations where slug = 'big-shoulders-restoration'
$$;
```

**32 of 66** `org_id` columns carry `NOT NULL DEFAULT default_organization_id()`. That default is doing something specific and dangerous: it **removes the safe failure mode**. Without it, a forgotten `org_id` throws a not-null violation the first time you run it. With it, the row is written — to the wrong tenant — and everything looks fine.

Proven on staging with a real second org (rolled back):

| path | `org_id` written | lands in |
|---|---|---|
| insert without `org_id` | `default_organization_id()` | **BSR** ❌ |
| insert with explicit `org_id` | Acme's id | **Acme** ✅ |

---

## Three mechanisms, not one

A grep for "missing `org_id`" only finds the first.

### 1. Column default (the obvious one)
Payload omits `org_id` → Postgres fills BSR.

### 2. App-layer fallback — **invisible to that grep**
`getCurrentAgentTaskTenantFields()` → `getCurrentWorkspaceContext()`. With `userId = null` — *exactly the bearer-token case* — it resolves via `resolveWorkspaceContextForUser` → `fetchDefaultOrg()` → `slug = 'big-shoulders-restoration'` (`src/lib/auth/workspace.ts:242`).

These sites **explicitly stamp BSR**. They pass `org_id`, they look correct, they'd pass any audit that checks for the column's presence. It does **not** throw — `getCurrentAgentTaskTenantFields` only throws on a null `workspaceId`, and BSR's default workspace exists.

> This is the same bug fixed in lead ingest (#466): a shared token proves *"you're allowed"* but not *"you're Acme"*, so the org gets guessed from a session that isn't there.

### 3. Global unique constraints — **`org_id` cannot fix these**
- `agents_key_key UNIQUE (key)` (baseline:1415) — global, not `(org_id, key)`. Every `upsert({key:'arc'}, {onConflict:'key'})` resolves to **one shared agent row database-wide**. Tenants' correctly-org'd `agent_tasks` would then carry a **cross-tenant `agent_id` FK**.
- `guardrail_rules` `onConflict: "rule_key"` — same shape.

---

## Live today (real production callers)

| site | table | why it matters |
|---|---|---|
| `dispatch/execute-resend.ts:59` | `campaign_events` | **The live send path.** The file's header calls it "the ONLY place the app performs a real send." Every `dispatch_sent`/`dispatch_failed` files into BSR — while the `engagement_events` insert **165 lines below** does it correctly from `dispatch.org_id`, already in scope at both callers. |
| `arc-chat/persistence.ts:769, 791, 811` | `arc_messages` | Never org-stamped. `insertPendingArcMessage` fires on **every chat turn** (`enqueue.ts:126`, `campaigns/queue.ts:83`) → all tenants' chat bodies accumulate in BSR. |
| `arc-api/tasks.ts:290, 367, 422` · `arc-chat/inbox.ts:203` | `agent_run_logs` | Bearer-reachable routes that **already hold a validated `scope`**. `applyAgentTaskScope` is threaded through the reads and updates — and never onto the insert payload. |
| `campaigns/revisions.ts:48, 79, 140` | `approval_decisions`, `campaign_events`, `agent_task_inputs` | **Split-brain in one operation.** 3 of 4 rows go to BSR while `agent_tasks:116` gets the right org — the same `tenant` variable is in scope **24 lines above** and simply isn't spread at `:140`. Live via `campaigns/[campaignId]/actions.ts:59` and `arc/actions.ts:432`. |
| `arc/orchestrator.ts:130` | `persona_snapshots` | Every sibling insert in that function is `withOrg`-wrapped; **this one alone isn't**. Live via `POST /api/v1/arc/runs`. |
| `arc/orchestrator.ts:240, 275` | `agent_task_inputs`, `agent_run_logs` | Plain objects, no org. |
| `arc-chat/enqueue.ts:102` · `campaigns/arc-conversation.ts:73` | `agent_task_inputs` | Same missed-spread shape as `revisions.ts:140`. |
| `gallery/results-persistence.ts:46` | `campaign_results` | Nominally CONDITIONAL, **UNSAFE in practice**: its only prod caller — bearer route `api/v1/campaigns/results/route.ts:57` — passes no tenant. |

### Worse than a misfiled insert
`gallery/results-persistence.ts:20-35` — `applyOrgScope(..., undefined)` also **drops the org filter from the natural-key SELECT**, so the update branch (`:39-43`) can match and **overwrite another tenant's `campaign_results` row**. That's a cross-tenant *write*, not just a misfile.

### Not only writes
Unscoped reads with the same root cause: `revisions.ts:35` (`approval_items` by `campaign_asset_id`), `revisions.ts:100` / `arc-conversation.ts:31` (`agents` by `key='arc'`).

---

## Latent (no production callers — will fire when wired)

- `arc/demo-workflow.ts` — **11** UNSAFE sites, zero callers anywhere. Dead code.
- `campaigns/queue.ts:108` — `agents` upsert; worst-*shaped* (mechanism 3) but unwired.
- `lib/approvals/decisions.ts:72, 234` — no production importer; the live path is `campaigns/decisions.ts`.
- `campaigns/draft-editing.ts:118`, `launch.ts:205`, `manage.ts:59/103`, `decisions.ts` reopen/undo paths.
- `agent/tokens.ts:122` — the legacy retry path drops `org_id` entirely.

## Conditional — correct today, fail-open by design

`orgTenantFields(tenant?)` returns `{}` when the arg is missing, so a forgotten argument is **silently correct-looking** and the column default covers it. Every conditional site with a live caller does pass a tenant today (`decisions.ts`, `launch.ts:127`, and the `arcGuard`-scoped Arc routes). These are latent regression risks, not active leaks.

⚠️ `arc-chat/persistence.ts:577` (`arc_conversations`) takes `getCreationTenancy().orgId`, **which is null in open/dev mode**.

## The safety net is a test, not a runtime check

`src/app/api/v1/arc/__tests__/safety.test.ts` structurally bars the Arc API routes from importing `campaigns/{decisions,revisions,launch}`. **That assertion is the only thing** keeping a session-less API caller away from the mechanism-2 fallback.

---

## Recommendations

1. **Don't fix these one by one.** 63 sites, three mechanisms, and the dangerous one is invisible to grep. Piecemeal fixes leave mechanism 2 everywhere.
2. **Make the failure loud.** The single highest-value change is dropping `DEFAULT default_organization_id()` from those 32 columns. A missing `org_id` should be a not-null violation — caught by the first test that runs — not a silent misfile. Do this *before* a second tenant exists; afterwards it's a data-cleanup problem, not a code one.
3. **Make `getCurrentWorkspaceContext()` refuse to guess.** A session-less caller should get an error, not BSR. The BSR fallback is a single-tenant convenience that becomes a data-mixing bug the moment it isn't.
4. **Re-scope the global uniques** — `agents(key)` → `(org_id, key)`; same for `guardrail_rules(rule_key)`. No amount of `org_id` threading fixes a constraint that permits only one row per key database-wide.
5. **Delete `arc/demo-workflow.ts`** if it's genuinely dead — 11 of the findings evaporate.
6. **Fix the live list above** in priority order: send path → arc_messages → agent_run_logs → revisions split-brain.
