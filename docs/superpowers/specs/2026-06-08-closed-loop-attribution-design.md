# Closed-Loop Attribution — Design Spec

**Date:** 2026-06-08
**Status:** Approved (design); pending implementation plan
**Topic:** Per-lead, last-touch campaign attribution with CRM-proven ROAS

## Problem

Attribution today is **aggregate and self-reported**. Mark posts `campaign_results`
rows (impressions, clicks, leads, jobs, `won_revenue_cents`, `spend_cents`) per
campaign/period via `POST /api/v1/campaigns/results`. But individual records are
not linked:

- `leads` carry a free-text `source` + `metadata`, but **no structured link** to a
  campaign / asset / channel.
- `jobs.estimated_revenue_cents` and `outcomes.gross_revenue_cents` are tied to a
  `lead_id` — real ground-truth money — but there is **no path from that revenue
  back up to the campaign that produced the lead**.

Consequence: a campaign's won revenue is whatever Mark *says* it is, not what the
CRM *proves*. Mark has no trustworthy feedback signal on what actually worked.

## Goal

Close the loop: **tag a lead with its originating campaign at ingest → roll that
lead's won outcome revenue up to the campaign → compute ROAS from CRM-proven money,
shown alongside the self-reported number.**

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Attribution model | **Last-touch, per-lead** | Deterministic, unit-testable, matches "app layer owns routing/scoring logic." Simplest real closed loop. Multi-touch can layer on later. |
| Capture mechanism | **Ingest-borne UTM + link builder** | Self-contained in the existing ingest pipeline; no new public infra (no redirect endpoint). |
| Revenue rule | **Realized only (won outcomes)** for headline ROAS | CRM-proven money in the door. Pipeline (open jobs) shown separately, never blended into ROAS. |
| Storage | **Nullable columns on `leads`** | Last-touch is naturally one-per-lead; trivial joins, FK-enforced, indexable. Matches the durable-records posture. |

## The Chain (data flow)

1. Mark mints a tagged link via `buildCampaignLink` (utm params + `bsg_at` token).
2. Prospect clicks the link, lands, and converts (form submit / call).
3. The external system posts to `POST /api/v1/leads/ingest` with an `attribution`
   block.
4. `parseLeadIngestionPayload` runs `resolveAttribution`, stamping the lead with its
   campaign (best-effort).
5. `persistLeadIngestion` writes the attribution columns (Supabase guard unchanged).
6. Later, a `job` / `outcome` is recorded against that `lead_id`.
7. The attribution read-model rolls won outcome revenue up to the campaign.
8. The campaign detail page shows CRM-proven ROAS next to the self-reported number.

## Components

### 1. Domain — `src/domain/attribution.ts` (pure, fully unit-tested; no I/O)

- **`buildCampaignLink({ destinationUrl, campaignId, assetId?, channel })`** → a URL
  stamped with `utm_source` / `utm_medium` / `utm_campaign` plus a compact `bsg_at`
  token encoding `{campaignId, assetId?, channel}`. Deterministic. The token is the
  authoritative signal; raw `utm_*` are the human-readable / fallback signal.
  - Token format: URL-safe base64 of a minimal JSON `{c, a?, ch}`. **Not signed** —
    attribution is non-security-sensitive and best-effort. (If tamper-resistance is
    ever needed, an HMAC like the existing webhook signing can be added without
    changing the resolver's precedence.)
- **`resolveAttribution(input)`** → `{ campaignId, assetId, channel, utm, method }`
  by precedence:
  1. explicit `campaign_id` (valid UUID) → `method: "explicit"`
  2. `bsg_at` token (decodes to a UUID) → `method: "token"`
  3. `utm_campaign` that *is* a campaign UUID → `method: "utm"`
  4. `source` → campaign rule map (configurable, may be empty initially) → `method: "source_rule"`
  5. otherwise → `{ campaignId: null, method: "unattributed" }`
  - Pure and total: never throws on unknown/unresolvable input; records *which*
    method won, for trust/debugging.
- **`computeCampaignEconomics({ attributedLeads, wonRevenueCents, wonCount, openPipelineCents, spendCents })`**
  → `{ roas, cac, cpl, realizedRevenueCents, pipelineRevenueCents }`. All
  division-by-zero edges handled here (zero spend → `roas: null`; zero won → `cac:
  null`; zero leads → `cpl: null`) so they are unit-tested in one place.

### 2. Ingest contract extension — `src/domain/lead-ingestion.ts`

- Accept an **optional** `attribution` block on the ingest payload (utm fields,
  optional explicit `campaign_id` / `campaign_asset_id`, optional `bsg_at` token).
- `parseLeadIngestionPayload` runs `resolveAttribution` and returns the normalized
  attribution alongside the parsed lead.
- **Best-effort, never breaks capture:** a malformed or unknown attribution block
  degrades to `unattributed` with a recorded reason — the lead still ingests. The
  load-bearing ingest response codes (`400` validation, `202` not-configured, `201`
  persisted, `502` persistence error) are **untouched**: attribution is additive and
  can never reject a lead or change a response code.

### 3. Migration — new timestamped file in `supabase/migrations/`

Add to `public.leads` (no edits to shipped migrations):

- `attributed_campaign_id uuid references public.campaigns(id) on delete set null`
- `attributed_asset_id uuid references public.campaign_assets(id) on delete set null`
- `attribution_channel text`
- `attribution_method text`
- `attribution_utm jsonb not null default '{}'::jsonb`
- index on `attributed_campaign_id`

A deleted campaign nulls attribution via the FK (no orphan rows, no integrity break).

### 4. Persistence — `src/lib/lead-ingestion/persistence.ts`

- Write the new attribution columns when persisting a lead, guarded by
  `isSupabaseAdminConfigured()`. Unchanged graceful-degrade behavior otherwise.

### 5. Read-model — `src/lib/performance/attribution-read-model.ts`

- Per campaign, join attributed `leads` → `jobs` / `outcomes`:
  - **Realized revenue** = `sum(outcomes.gross_revenue_cents WHERE status = 'won')`
    for leads attributed to the campaign.
  - **Pipeline revenue** (open `jobs.estimated_revenue_cents`) computed
    **separately** — never folded into ROAS.
  - **Spend** = `sum(campaign_results.spend_cents)` for the campaign.
  - **Counts**: attributed leads, won count.
- Calls `computeCampaignEconomics` for ROAS / CAC / CPL. I/O lives here; the math
  lives in `domain/attribution.ts`.

### 6. UI — campaign detail (`src/app/campaigns/[campaignId]/page.tsx`)

- A **"Realized performance"** panel (reusing `Panel` / `StatusPill` from
  `_components/page-header.tsx`): attributed leads, won count, realized revenue,
  **ROAS / CAC / CPL**, with pipeline as a clearly-labeled secondary line.
- A **CRM-proven vs self-reported** comparison: realized numbers next to the
  matching `campaign_results` figures, so divergence is visible.
- A copy-able **tracked-link builder** widget (calls `buildCampaignLink`) for the
  campaign / its assets.
- Follows `DESIGN.md` (Command Charcoal / Canvas White / Restoration Red; no emojis,
  no equal 3-column rows).

### 7. Tests

- **Domain unit tests** (`src/domain/__tests__/attribution.test.ts`):
  - `resolveAttribution` — each precedence tier wins in order; unknown UUID →
    unattributed; malformed token → unattributed; empty input → unattributed.
  - `buildCampaignLink` — deterministic output; token round-trips through
    `resolveAttribution`; existing query params on `destinationUrl` preserved.
  - `computeCampaignEconomics` — normal case; zero spend; zero won; zero leads.
- **Persistence / read-model tests** follow the existing
  `src/lib/performance/read-model.test.ts` pattern, behind the Supabase guard.

## Error Handling Principles

- Attribution is **additive and best-effort**: it can never reject a lead or change
  an ingest response code.
- A malformed attribution block is dropped to `unattributed` with a recorded reason,
  not surfaced as a `400`.
- A deleted campaign nulls attribution via the FK on-delete rule.

## Non-Goals (this iteration)

- Multi-touch attribution / credit splitting. (Upgrade path: a `lead_touches` table,
  documented in the migration the way `outbound_dispatches` documents its successor.)
- App-served redirect links / click tracking.
- Pipeline-weighted or probability-weighted ROAS.
- Signed/tamper-resistant attribution tokens.
- Editing or replacing the existing self-reported `campaign_results` flow — this sits
  beside it for comparison.

## Upgrade Path to Multi-Touch (future, out of scope)

Add a `lead_touches` table (lead_id, campaign_id, asset_id, channel, touched_at,
method) capturing every touch. The last-touch columns on `leads` remain as the
denormalized fast path / fallback. `computeCampaignEconomics` gains a weighting
parameter (first / last / linear / position-based). No breaking change to this
iteration's surfaces.
