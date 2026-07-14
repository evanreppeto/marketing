# Multi-Tenant Readiness → Chargeable SaaS — Reviewer's Guide

A 6-PR stack that takes the app from *"the multi-tenant design is real, but the
runtime enforcement isn't"* to a **chargeable multi-tenant SaaS**: multiple
companies can share one instance safely, the agent serves each as itself, and the
platform can meter, cap, and bill them.

This doc is the map. Each PR has its own detailed description; read this first to
understand how they fit and what to scrutinize.

---

## The three problems (from the readiness audit)

1. **Data would leak between companies.** RLS exists in the DB but the app runs on
   the RLS-bypassing service-role client, and several concrete holes were open
   (a table with no RLS, an anon-readable PII table, unscoped queries).
2. **The agent couldn't tell companies apart.** The shared Arc runner authenticated
   every callback with one token → every tenant's work collapsed to the *default*
   workspace. And nothing bounded concurrency, so one tenant could starve others.
3. **No way to charge or limit anyone.** Usage was metered but there were no plans,
   no enforced caps, and no billing.

---

## The stack (merge bottom-up)

```
#400  fix(tenancy): close Tier-1 data-isolation holes
  └ #405  feat(arc-runner): per-workspace runner identity
      └ #406  feat(arc-runner): bounded, per-tenant-fair run scheduler
          └ #409  feat(billing): plans + enforced usage quotas
              └ #411  feat(billing): plan-management UI in Settings
                  └ #414  feat(billing): Stripe subscriptions — checkout, portal, webhook
```

Each PR is **stacked** on the one below (its base branch is the previous branch,
not `main`). Merge in order; GitHub auto-retargets each base to `main` as its
parent merges. `#408` (per-workspace BYO Gemini media key) was opened then
**closed** — see "Decisions" below.

---

## PR-by-PR

### #400 — Close Tier-1 data-isolation holes
**Problem:** concrete ways one tenant's data reaches another (live in
`ARC_AUTH_MODE=supabase`, which prod runs).

**What changed**
- `campaign_shares` shipped with **no RLS** → added owner-scoped policies mirroring
  `arc_conversation_shares`.
- `public.audits` was **anon world-readable** (email + Stripe refs, no `org_id`) →
  dropped the permissive read policy, revoked anon privileges.
- `GET /api/v1/arc/persona-intelligence` read persona data with **no org filter**
  on the admin client (returned every org's rows) → switched to `arcGuard` and
  require an org in the read-model.
- The Resend **send path + connections layer** filtered only on `provider`, not
  `org_id` → org-scoped the lookup + every mutation, and re-scoped the
  `connections` UNIQUE from `(provider)` to `(org_id, provider)`.

**Review focus:** the new RLS policies (migration
`20260710180000_tier1_isolation_hardening.sql`); that the `health` route was
*correctly left alone* (it exposes no tenant data).

**Verified:** 1901 tests; migration applied + checked transactionally on real
Postgres 17.6.

---

### #405 — Per-workspace runner identity
**Problem:** the shared runner authenticated callbacks with one env token →
`arcGuard`'s env branch → `getCurrentWorkspaceContext()` → the **default**
workspace. Any tenant's run read/wrote the default workspace (and could be handed
its decrypted connector tokens). Usage metering was mis-attributed too.

**What changed (trusted first-party runner model)**
- Wakes carry the authoritative `{orgId, workspaceId}` (`notify.ts`).
- The runner echoes them on every callback as `X-Arc-Workspace-Id` /
  `X-Arc-Org-Id` (one `arc-client` per wake, from the payload).
- `arcGuard` validates the asserted workspace against the DB
  (`resolveWorkspaceScopeById`) and **derives the authoritative org** — a spoofed
  org header can't widen scope. Absent the header → historic default (back-compat).
- Because callback routes already thread `arcGuard`'s scope, **all 65 Arc routes**
  become correctly tenant-scoped with no per-route change.
- **LLM credential:** blessed `ANTHROPIC_API_KEY` (shared, platform-paid) as the
  runner's first-class credential.

**Review focus:** the trust model — is it OK for a first-party runner to *assert*
its workspace (validated) rather than hold a per-workspace secret? (Rationale
below.) No schema change.

**Verified:** app 1905 + runner 150 tests; `resolveWorkspaceScopeById` query
validated on staging.

---

### #406 — Bounded, per-tenant-fair run scheduler
**Problem:** wakes were ack'd then run **fire-and-forget** (`void handle(...)`), so
background Arc runs were unbounded — N simultaneous wakes = N concurrent Agent-SDK
runs on one process, no fairness.

**What changed:** an in-memory scheduler (`apps/arc-runner/src/scheduler.ts`) with
a **global cap** (`ARC_MAX_CONCURRENT_RUNS`, default 4) and a **per-workspace cap +
round-robin** (`ARC_MAX_CONCURRENT_RUNS_PER_WORKSPACE`, default 2). Durable-safe:
the `agent_tasks` inbox is the real queue (claim + stale-reclaim), so a
dropped/pending job is never lost.

**Review focus:** the fairness logic (`scheduler.test.ts` covers global cap,
per-workspace cap, cross-tenant fairness, full drain); in-memory-per-instance is
acceptable given the durable inbox.

**Verified:** runner 152 tests.

---

### #409 — Plans + enforced usage quotas
**Problem:** metering existed (`ai_usage_events`) but no plans and no enforcement
(a hardcoded, display-only `$80` cap).

**What changed**
- Plan catalog (`src/domain/plans.ts`): free / starter / pro / scale, each a
  monthly spend cap in cents.
- `org_plans` table (tier + optional cap override) with RLS (member read, admin
  write, no anon); no row → free.
- `checkUsageAllowed` (`entitlements.ts`): resolves the plan + sums month-to-date
  `ai_usage_events` cost. **Dark by default** — computes always, only *blocks* when
  `ARC_BILLING_ENFORCEMENT=1` (same posture as `ARC_SEND_ENABLED`).
- Wired the real spend gates: the Arc chat send action (Claude) refuses over-cap;
  `generate-image` / `generate-video` (start only) return **402**.
- Settings shows the real resolved plan cap + tier (replaced the hardcoded `$80`).

**Review focus:** the dark-by-default gate (nothing blocks until armed); the
enforcement points (chat + media) are the real cost origins.

**Verified:** 1916 tests; `org_plans` migration verified transactionally on
Postgres 17.6.

---

### #411 — Plan-management UI
**What changed:** `getSettingsBillingView` (current tier + cap, `canManage` =
owner/admin, selectable tiers) + `updateOrgPlanAction` (admin-gated here **and** by
`org_plans` RLS) + a "Plan" panel in Settings → Usage & billing (tier `<select>`,
mirroring the proven `TeamMembers` optimistic-select). Replaced the dead
"Manage plan" button.

**Review focus:** admin gating is enforced in both the action and RLS.
**Verified:** 1919 tests; **rendered live** in the demo preview.

---

### #414 — Stripe subscriptions (checkout, portal, webhook)
**What changed**
- `org_plans` gains `stripe_customer_id` / `stripe_subscription_id` /
  `subscription_status` / `current_period_end` (+ unique index: one customer/org).
- Price mapping (`stripe-plans.ts`): tier ↔ Stripe Price id via env; prices live in
  the Stripe dashboard; free has no price.
- Webhook `POST /api/webhooks/stripe`: signature-verified, syncs
  `customer.subscription.*` → `org_plans`. The money-critical mapping is a **pure,
  unit-tested** function: `active`/`trialing`/`past_due` keep the price's tier;
  anything else → free; an unknown price → free even when active. Idempotent.
- Checkout + Customer Portal actions (owner/admin), one customer per org carrying
  `metadata.org_id`.
- Plan panel gains a Stripe path (Choose plan → Subscribe/Upgrade + Manage billing)
  when configured; keeps the manual override otherwise.
- Everything is `isStripeConfigured()`-gated — inert until `STRIPE_SECRET_KEY` set.

**Review focus:** the webhook (signature verification, status→tier mapping,
idempotency, org lookup via metadata *or* stored customer id). **⚠️ Payments were
not live-tested** — needs a real Stripe account + card; the pure logic, webhook
wiring, and UI are all tested.

**Verified:** 1933 tests; migration verified on Postgres 17.6; Stripe UI branch
rendered live in the demo preview.

---

## Cross-cutting design decisions (the "why")

- **Trusted first-party runner (no per-workspace callback secrets).** The runner is
  a service *we* deploy; the shared env token proves "this is our runner," and the
  workspace it acts for is *validated* against the DB, not blindly trusted. That's
  why #405 needs no Vault-stored per-workspace callback tokens and why the shared
  inbound webhook secret is fine (both ends are first-party). Per-workspace inbound
  secrets / BYO runners would be the point to revisit this.
- **Dark-by-default enforcement.** Both quota blocking (`ARC_BILLING_ENFORCEMENT`)
  and live sending (`ARC_SEND_ENABLED`) compute + display but do nothing until
  explicitly armed. The stack is safe to merge inert and turn on deliberately.
- **Platform pays, tenants pay us.** The platform holds the Anthropic + Gemini keys
  and bills tenants for metered usage — *not* bring-your-own-key. This is why
  `#408` (per-workspace BYO Gemini media key) was **closed**: media stays on the
  shared key, metered per workspace, billed uniformly.
- **Reuse over rebuild.** RLS policies mirror existing proven ones; the Settings
  plan picker reuses the `TeamMembers` pattern; connector onboarding is unchanged.

---

## What's intentionally NOT in this stack (follow-ups)

- **Migrate reads onto the RLS-enforcing client.** #400 closed the concrete holes,
  but the app still uses the service-role admin client for most reads — RLS is the
  *backstop*, not yet the runtime enforcement layer. Moving reads onto the
  user-scoped client (table by table) is the larger Tier-1 follow-up.
- **Live payment testing** (needs a real Stripe account + card).
- **Per-tenant sending domains** (each tenant sending from its own verified domain).
- **Per-tenant queue durability across instances** (the scheduler is per-instance;
  the inbox is the durable layer).

---

## Verification at a glance

| PR | Tests | Typecheck / Lint | Real Postgres (staging) | Live preview |
|----|-------|------------------|-------------------------|--------------|
| #400 | 1901 | clean | migration verified (txn) | — |
| #405 | app 1905 + runner 150 | clean | resolver query verified | — |
| #406 | runner 152 | clean | — | — |
| #409 | 1916 | clean | migration verified (txn) | — |
| #411 | 1919 | clean | — | ✅ Settings plan panel |
| #414 | 1933 | clean | migration verified (txn) | ✅ Stripe branch |

All DB migrations were applied inside `BEGIN … ROLLBACK` against real Postgres 17.6
(staging) — schema/RLS/constraints confirmed, then rolled back so staging is
untouched.

---

## Go-live checklist (turning each capability on)

1. **Multi-tenant enforcement:** ensure `ARC_AUTH_MODE=supabase` (RLS active).
2. **Runner identity:** deploy the runner with `ANTHROPIC_API_KEY`; the app stamps
   wake identity automatically.
3. **Concurrency:** tune `ARC_MAX_CONCURRENT_RUNS` /
   `ARC_MAX_CONCURRENT_RUNS_PER_WORKSPACE` if needed (defaults 4 / 2).
4. **Billing (Stripe):** create one monthly Price per paid tier →
   `STRIPE_PRICE_STARTER/PRO/SCALE`; set `STRIPE_SECRET_KEY`; add the webhook
   endpoint → `STRIPE_WEBHOOK_SECRET`; set `NEXT_PUBLIC_APP_URL`.
5. **Enforce caps:** flip `ARC_BILLING_ENFORCEMENT=1` when you want over-cap usage
   to actually block.

See `.env.example` (updated in #414) for the full list with inline setup notes.
