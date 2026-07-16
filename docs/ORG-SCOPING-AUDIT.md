# Org-scoping audit — how rows silently land in Big Shoulders

**Date:** 2026-07-16 · **Scope:** every `.insert()` / `.upsert()` into the 32 tables whose `org_id` defaults to BSR · **Method:** 3 parallel readers tracing each payload (inline objects, pre-built variables, spreads), verified against real Postgres.

> **Nothing here is hurting production today.** There is one tenant, and BSR *is* the correct answer, so every wrong answer is currently indistinguishable from the right one. This document exists because "make it multi-tenant" is exactly the change that converts these from harmless to silent data-mixing — and because the failure is **silent by construction**: there is no error to catch, no crash, no red test.

## STATUS: fixed — the default is gone

This audit has been acted on. `20260716140000_drop_bsr_org_default.sql` drops
`default default_organization_id()` from all 32 columns and drops the function
itself, so a missing `org_id` is now a not-null violation instead of a silent
misfile. Every live writer below was fixed **first** — the drop is the ratchet
that keeps them fixed, and it could not be the opening move: dropping the default
against the then-current code would have 500'd every Arc chat turn.

Proven on staging against real Postgres (`BEGIN … ROLLBACK`), which is the only
thing that actually demonstrates the change — the mock-based unit tests pass
either way, exactly as they did for months while the persona-intelligence insert
was misfiling:

| | `org_id` omitted | result |
|---|---|---|
| before the drop | insert succeeded | silently filled to `big-shoulders-restoration` |
| after the drop | raised `23502` | not-null violation — fails loudly |
| after, explicit `org_id` | insert succeeded | normal writes unaffected |

The sections below are kept as the record of what was wrong and why, since the
reasoning outlives the fix. Mechanism 3 was fixed by re-scoping the constraints
(`20260716150000_scope_agent_keys_per_org.sql`), not by threading `org_id`.

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

### 2. App-layer fallback — **invisible to that grep** — ✅ FIXED (#479, #480)
`getCurrentAgentTaskTenantFields()` → `getCurrentWorkspaceContext()`. With `userId = null` — *exactly the bearer-token case* — it resolved via `resolveWorkspaceContextForUser` → `fetchDefaultOrg()` → `slug = 'big-shoulders-restoration'`.

These sites **explicitly stamp BSR**. They pass `org_id`, they look correct, they'd pass any audit that checks for the column's presence. It did **not** throw — `getCurrentAgentTaskTenantFields` only throws on a null `workspaceId`, and BSR's default workspace exists.

> Same bug as lead ingest (#466): a shared token proves *"you're allowed"* but not *"you're Acme"*, so the org got guessed from a session that isn't there.

**The fix** keys on **count**, not name: one org is the only thing the call could mean, so answering is a fact; two or more is a guess, so it refuses. `DEFAULT_ORG_SLUG` deliberately does *not* rescue the ambiguous case — an env var that silently picks a winner among real tenants is the same hidden default wearing a different hat. It now survives only as cosmetic naming for the offline demo context.

The slug lookup was wrong in **two** directions at once, which is worth remembering:
- **multi-tenant** — every session-less write silently landed in BSR, whoever the caller was;
- **single-tenant, non-BSR** — it didn't even misfile, it *threw*. Any deployment not literally slugged `big-shoulders-restoration` got `No organization found for slug "big-shoulders-restoration"`. **BSR is a tenant of this product, not the product.**

The same rule applies one level down: `fetchDefaultWorkspace` resolves the sole *active* workspace and refuses when several exist, rather than letting the `"default"` key break the tie — that was the last silent guess on this path.

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

## Recommendations — and what was done

1. ~~**Don't fix these one by one.**~~ Correct in spirit, wrong as sequencing. The default *is* the fix, but it could not go first: the live writers had to be corrected before the drop, or production would 500 on the first chat turn. Fix the writers → drop the default. The drop is the ratchet, not the opening move.
2. ✅ **Make the failure loud.** Done — `20260716140000_drop_bsr_org_default.sql`. Dropped from all 32 columns, and `default_organization_id()` itself dropped so it can't be reintroduced by copy-paste. **Deploy code before applying it** — it's breaking for any build still relying on the default.
3. ✅ **Make `getCurrentWorkspaceContext()` refuse to guess.** Done (#479, #480). `fetchDefaultOrg` keys on org **count** instead of a hardcoded slug, and `fetchDefaultWorkspace` does the same for the sole *active* workspace. A session-less caller gets an answer only when there is exactly one, and an error otherwise. `getCreationTenancy()`'s private second copy of that rule now defers to the shared `resolveSoleOrgId` — two copies of "when may I pick an org" is how they drift apart.
4. ✅ **Re-scope the global uniques** — done in `20260716150000_scope_agent_keys_per_org.sql`: `agents(key)` → `(org_id, key)`, `guardrail_rules(rule_key)` → `(org_id, rule_key)`, with the upserts' `onConflict` moved in the same change. Threading `org_id` alone would have been *worse than nothing*: with the global constraint still in place, org B's `upsert({key:'arc'}, {onConflict:'key'})` would match and **update org A's row**.
5. ✅ **Delete `arc/demo-workflow.ts`** — confirmed zero callers, deleted. 446 lines, 11 findings gone.
6. ✅ **Fix the live list** — send path, `arc_messages` (derived from the parent conversation, not threaded through callers), `agent_run_logs` (from the parent task row, which is provably NOT NULL — *not* from the optional `scope`, which would have been fail-open), and the `revisions.ts` split-brain.

### Mechanism 3, swept exhaustively

Every `UNIQUE` constraint on an org-scoped table whose definition omits `org_id`, from the live catalog:

| constraint | verdict |
|---|---|
| `agents_key_key UNIQUE (key)` | ❌ bug — **fixed** → `(org_id, key)` |
| `guardrail_rules_rule_key_key UNIQUE (rule_key)` | ❌ bug — **fixed** → `(org_id, rule_key)` |
| `jobs_job_number_key UNIQUE (job_number)` | ❌ **bug, NOT fixed** — see below |
| `agent_api_tokens_token_hash_key UNIQUE (token_hash)` | ✅ correct — a secret hash *must* be globally unique |
| `workspace_invites_code_hash_key UNIQUE (code_hash)` | ✅ correct — same reason |
| `arc_instances (workspace_id, key)`, `workspace_connectors (workspace_id, connector_key)`, `connector_spend_budgets (workspace_id)`, `workspace_media_config (workspace_id)` | ✅ correct — scoped by `workspace_id`, which is itself org-scoped |

**`jobs.job_number` is globally unique.** `job_number` is a per-company business identifier, so two tenants both wanting `JOB-1001` is *expected*, and today the second one is rejected. It does not block the default drop (`jobs.org_id` is not one of the 32 defaulted columns) so it is deliberately out of scope here, but it is a genuine multi-tenant defect and should be re-scoped to `(org_id, job_number)` before tenant #2.

### Known-remaining
- **Shared env tokens still can't name a tenant.** Mechanism 2's *resolver* is fixed, but `ARC_AGENT_API_TOKEN`, `LEADS_INGEST_API_TOKEN` and `CAMPAIGN_RESULTS_API_TOKEN` remain shared secrets carrying no identity. They work today only because there is one org for the resolver to return; each turns into a hard 409/502 at tenant #2. The real fix is per-workspace hashed tokens (`checkWorkspaceBearer` already exists — `/api/v1/leads/ingest` is the reference) and retiring the env vars. That is now a **loud** migration rather than a silent misfile, which was the point.
- **`/api/v1/leads/ingest` and `/api/v1/campaigns/results` surface the refusal as a 502** via their existing catch — semantically wrong (nothing failed to *persist*; the tenant just can't be named), but loud, data-safe, and unreachable until a second org exists. Widening the ingest response contract, which CLAUDE.md calls load-bearing, was deliberately left alone. `arcGuard` already converts it to a clean 409.
- **`campaign_results` via the shared env token.** The cross-tenant *overwrite* is closed (the natural-key SELECT is now unconditionally org-filtered, and omitting the org is a type error). But `CAMPAIGN_RESULTS_API_TOKEN` is a shared secret with no identity, so that path still resolves the org from a session that isn't there. Closing it means issuing per-workspace tokens scoped `campaign-results:ingest` and retiring the env var — the `.env.example` / go-live docs still describe the shared-token contract.
- **`listAgentTokens` / `hasActiveAgentTokens`** drop the `org_id` filter on their pre-`scopes` legacy retry. Reads only, so nothing misfiles, but on a pre-scopes DB they can over-return another org's tokens.
- **`arc_conversations` created by a session-less caller** still has no org to derive.
