# Making Arc fully functional for a single workspace

This is the operator runbook for turning Arc on end-to-end for **one workspace**
(e.g. Big Shoulders Restoration). Multi-tenant isolation and billing are **out of
scope here** — they ship dark and don't block a single workspace (see
`MULTITENANT-STACK.md`). The goal is: Arc chats, remembers, finds opportunities,
drafts approval-gated campaigns, prepares assets, and (when you're ready) sends.

The core loop is already wired in code. What's left is almost entirely
**configuration + seeding**. Do these in order; each step lights up more of the loop.

---

## 0. Prerequisite — persistence

Without Supabase env, the app validates/scores but persists nothing.

| Var | Unlocks |
|-----|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | all reads/writes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client auth |
| `SUPABASE_SERVICE_ROLE_KEY` | server-side persistence / read-models |
| `ARC_AUTH_MODE` | `supabase` (real accounts), `operator`, or `open` (local) |
| `DEFAULT_ORG_SLUG` | `big-shoulders-restoration` — cosmetic (demo-context naming) only; it does **not** select the tenant |

**Migrations must be applied to the workspace's DB.** As of this writing, the
three most recent schema migrations (`tier1_isolation_hardening`, `org_plans`,
`org_billing_stripe`) are applied to **staging** but **not** to the prod BSR DB
(`marketing-engine`). Apply the repo's `supabase/migrations/` to whichever DB the
deployed app serves before relying on the newest features. (`org_plans` is
billing-only, so its absence degrades gracefully — but apply everything for
correctness.)

---

## 1. Connect the runner  → Stages: chat, memory, campaign drafting

This is the keystone. Arc's replies, drafting, and opportunity/campaign work all
run in the `apps/arc-runner` service; the app wakes it and it posts back.

**Runner env** (`apps/arc-runner/src/config.ts`):

| Var | Purpose |
|-----|---------|
| `APP_API_BASE_URL` | where the runner calls back (the app's URL) |
| `ARC_AGENT_API_TOKEN` | shared bearer, must match the app |
| `ANTHROPIC_API_KEY` **or** `CLAUDE_CODE_OAUTH_TOKEN` | the Claude credential (API key for prod; OAuth fine for a solo pilot) |
| `ARC_WEBHOOK_SECRET` | HMAC on wakes (optional but recommended) |

**App env** (`src/lib/agent/connection.ts`):

| Var | Purpose |
|-----|---------|
| `ARC_AGENT_API_TOKEN` | same shared bearer |
| `ARC_RUNNER_URL` | the runner's webhook URL — **or** an `agent_connections` row with `webhook_url` + `enabled=true` |
| `ARC_WEBHOOK_SECRET` | must match the runner |

An `agents` row must exist for the workspace (created by the seed scripts below).

**Verify:** `pnpm diagnose:arc`, then open Arc in the
workspace and send a message. A reply = the runner is live. (This is also the
ground-truth test for *which* DB the deployed app serves.)

> Note: BSR's workspace already shows a runner-connection row but **0 live
> connections** in the DB — confirm chat actually replies; if not, enable the
> connection or set `ARC_RUNNER_URL`.

---

## 2. Seed the workspace  → Stage: business context

So Arc has real BSR data to reason over (personas, CRM, brand, recall).

```bash
node scripts/seed-personas.mjs        # 12-persona contract
pnpm seed:arc-demo                    # BSR org + agents row + company/lead/campaign/opportunity
# (or) node scripts/seed-test-workspace.mjs   # BSR-scoped workspace + users
pnpm seed:brand-kit-bsr               # brand colors/logo for the renderer
pnpm seed:brain                       # seed Brain recall
```

> BSR's prod workspace is already seeded (≈200 leads, 10 companies, 11 campaigns,
> 7 agents), so you likely only need to top up brand kit + Brain.

---

## 3. Arm media generation  → Stage: assets  (also enables semantic Brain recall)

Gated in `src/lib/media/index.ts` (`isMediaGenEnabled()`):

| Var | Unlocks |
|-----|---------|
| `ARC_MEDIA_ENABLED=1` | the media-gen master switch |
| `GEMINI_API_KEY` | Engine A (Imagen/Veo) **and** semantic (pgvector) Brain recall |
| `GEMINI_IMAGE_MODEL` / `GEMINI_VIDEO_MODEL` | optional model overrides |

Higgsfield (Engine B) is onboarded per-workspace as a Vault connector credential
(no env var). Self-test: **Settings → Media**.

---

## 4. Arm real sending  → Stage: send  (do carefully; everything upstream gates on approval)

`src/lib/dispatch/execute-resend.ts` + kill-switch `src/lib/dispatch/live-send.ts`.
**All required together:**

| Var / state | Purpose |
|-------------|---------|
| `RESEND_API_KEY` | Resend API |
| `RESEND_FROM` | a **verified-domain** from-address |
| `ARC_SEND_ENABLED=1` | master kill-switch (dark by default) |
| `connections` row | `provider=resend`, `enabled`, `config.fromEmail` — via `pnpm configure:resend` |

Then send one test to yourself from the Outbox before anything real.

---

## 5. Turn on the opportunity inbox  → Stage: detect

Cold-lead detection already works off your CRM. To make the inbox fill proactively:

| Var / action | Unlocks |
|--------------|---------|
| enable `weather-signals` connector (per-workspace, BSR service area) | free NWS weather opportunities (no key) |
| `CRON_SECRET` + `OPPORTUNITY_SCAN_CRON_ENABLED=1` | the daily auto-scan (`/api/cron/opportunity-scan`) |

Reviews / competitor-ad connectors need their own creds + per-workspace enablement.

---

## 6. Performance loop  (optional)

`CAMPAIGN_RESULTS_API_TOKEN` gates external posting to `POST /api/v1/campaigns/results`
(open in dev). Outcomes feed back into the Brain so Arc learns.

---

## End-to-end verification checklist

1. **Chat** — message Arc in the workspace → it replies.
2. **Memory** — reference an earlier fact → Arc recalls it (semantic if `GEMINI_API_KEY` set).
3. **Opportunities** — click "Scan" (or wait for cron) → the inbox fills from CRM + weather.
4. **Draft** — "Ask Arc to draft it" on an opportunity → an approval-gated campaign package appears.
5. **Assets** — from Studio's Arc composer or a draft run, Arc generates a provenance-tagged asset.
6. **Approve** — approve the draft → it unlocks; outbound stays locked.
7. **Send** — from the Outbox, confirm one real send to yourself (only after step 4 above).

---

## Explicitly out of scope (until launch)

`STRIPE_*`, `ARC_BILLING_ENFORCEMENT`, plans/quotas — billing is non-blocking
until armed (`checkUsageAllowed` returns allowed). Social channels
(`META_*`/`LINKEDIN_*`/`X_*`) and Google Drive are peripheral to the core loop.
