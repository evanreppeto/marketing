# Proactive Arc — Opportunity Generation, Slice 1 (Design)

**Date:** 2026-06-20
**Status:** Approved (design) — pending spec review
**Scope:** Let the operator trigger Arc to **survey its vision (CRM, personas, brand, activity, the current inbox) and propose source-backed opportunities** into the existing opportunity inbox, `pending` approval. Operator-initiated via a button on `/opportunities`. No outbound, no scheduling.

> First slice of "Proactive Arc." **Slice 2 (deferred):** scheduled autonomy (a cron wake so Arc scans unprompted). This SP delivers the generation *capability* + an explicit operator trigger.

## Problem

A deterministic detector (`runColdLeadDetection` → `detectColdLeadOpportunities` → `upsertOpportunities`) already finds cold-lead opportunities and persists them `pending`, triggered by a manual scan button on `/opportunities`. But it's a single rigid rule, and **Arc has no way to put its own findings into the inbox** — it can read opportunities (`list_opportunities`) and draft *from* them, but cannot *generate* them. Now that Arc has rich read vision (CRM, brand, brand documents, personas, persona-intelligence, vault, activity), it can spot opportunities the rule can't: persona-segment gaps, a dormant company worth re-engaging, a competitor signal, a newly-approved asset suggesting a campaign. This slice gives Arc that generation path, approval-gated.

## What exists (reuse, no rebuild)

- `upsertOpportunities(candidates: OpportunityCandidate[], client?)` (`src/lib/opportunities/persistence.ts`): inserts `status:"pending"`, `detected_by:"arc"`; **dedupes** by `subject_id` within open statuses (`pending|drafting|drafted`) for the candidate `kind`; org-scoped via `getCurrentOrgId()`. Returns `{ ok, count } | { ok:false, error }`.
- `OpportunityCandidate` (`@/domain`): `{ kind, subjectType, subjectId, title, summary, confidence, urgency, evidence, recommendedAction, recommendedCampaignType }`. Opportunities columns include `evidence jsonb`.
- Runner wake dispatch: `apps/arc-runner/src/handler.ts` already routes `arc_chat_message` → `runArcTurn` and `arc_opportunity_draft` → `runArcOpportunityDraft` (the precedent for a non-chat Arc wake).
- App→runner notify: `src/lib/arc-chat/notify.ts` POSTs the wake to the runner webhook; `src/lib/arc-chat/enqueue.ts` is the enqueue precedent (creates an `agent_tasks` row with tenant fields via `getCurrentAgentTaskTenantFields()`, then notifies).
- Arc API route helpers: `arcGuard`/`guard`/`ok`/`fail`/`readJson` (`src/app/api/v1/arc/_lib/http.ts`); runner tool helpers `tool()` + `runTool` (`apps/arc-runner/src/tools/helpers.ts`); `ArcClient.apiPost`.
- `/opportunities` page + `actions.ts` already host the deterministic scan button (the `OperatorBar`/`ActionFeedback` pattern).

## Architecture

### a. App — propose route (the write path)
`POST /api/v1/arc/opportunities/propose` (`src/app/api/v1/arc/opportunities/propose/route.ts`), bearer-gated (`guard`):
- `readJson` → validate the body into one `OpportunityCandidate` (a domain validator `parseOpportunityProposal(raw): OpportunityCandidate | error`, so validation stays pure/testable): require `kind`, `subjectType`, `subjectId`, `title`, `summary`; clamp `confidence` (0–100), default `urgency` to `medium` if absent/invalid; `evidence` is an object (source links/refs); `recommendedAction`/`recommendedCampaignType` optional strings.
- Call `upsertOpportunities([candidate])` → `ok({ created: result.count })` (0 when deduped), `fail(...,502)` on persist error, `fail("invalid", ...,400)` on validation error.
- Returns the dedup result so Arc learns when a proposal was a duplicate.

### b. App — scan trigger (enqueue + button)
- `enqueueArcOpportunityScan()` (`src/lib/opportunities/scan-enqueue.ts`, modeled on `enqueueArcChatTask`): insert an `agent_tasks` row with tenant fields, `task_type: "arc_opportunity_scan"`, `status: "queued"`, a system objective ("Survey current signals and propose source-backed opportunities."), `source_type: "operator_scan"`; then call the existing runner-notify with the new task id. No conversation/message rows (it's not a chat).
- Server action `requestArcOpportunityScanAction` in `src/app/opportunities/actions.ts` (gated by `requireOperator()` + `isSupabaseAdminConfigured()`), then `revalidatePath("/opportunities")`.
- Button on `/opportunities` next to the deterministic scan, with `ActionFeedback` ("Arc is scanning for opportunities — new ones will appear here for approval.").

### c. Runner — scan wake + narrow tool set
- `handler.ts`: dispatch `arc_opportunity_scan` → new `runArcOpportunityScan(payload, client)`.
- `runArcOpportunityScan` (`apps/arc-runner/src/arc.ts`): an Arc turn with a **scan-focused system directive** and a **narrow tool set — the read/vision tools (`readTools`) + only `propose_opportunity`** (NOT the campaign-draft/act tools). Standard route (Opus; reasoning-heavy). Returns a summary (how many proposed).
- New tool `propose_opportunity` (`apps/arc-runner/src/tools/opportunities.ts` or added to an existing tool module): schema mirrors the route body (kind, subject_type, subject_id, title, summary, confidence, urgency, evidence, recommended_action, recommended_campaign_type); calls `client.apiPost("/api/v1/arc/opportunities/propose", args)` via `runTool`.
- Prompt: a scan directive describing the goal — survey CRM/personas/brand/activity/inbox, propose only well-evidenced, non-duplicate opportunities, each with concrete evidence/source refs; emphasize everything stays `pending` for human approval.

## Data flow

```
Operator clicks "Ask Arc to find opportunities" (/opportunities)
  → requestArcOpportunityScanAction → enqueueArcOpportunityScan()
      → agent_tasks row (task_type=arc_opportunity_scan) → notify runner webhook
  → runner handler: arc_opportunity_scan → runArcOpportunityScan
      → Arc turn (scan prompt; readTools + propose_opportunity only)
      → for each finding: propose_opportunity → POST /api/v1/arc/opportunities/propose
          → parseOpportunityProposal → upsertOpportunities([candidate])  (dedup, pending, detected_by=arc)
  → opportunities appear pending in the inbox, beside the deterministic ones, awaiting approval
```

## Safety & scope

- **Approval-gated:** every proposal is `status:"pending"` — nothing drafts, sends, publishes, or spends. The scan tool set is read + a single approval-safe write (`propose_opportunity`); campaign-draft/act tools are deliberately excluded from the scan.
- **No flooding:** reuses `upsertOpportunities`' dedup (skips subjects with an open opportunity of that kind), so repeated scans don't pile up.
- **Bearer-gated, org-scoped** route; tenant-stamped enqueue (consistent with `agent_tasks` tenancy).
- **No schema change** (opportunities table + `detected_by` already exist). No scheduling (Slice 2).

## Testing

- **Domain `parseOpportunityProposal`** (pure): valid → candidate; missing required → error; confidence clamp; urgency default.
- **Propose route:** 401 without token; valid → `created` count via mocked `upsertOpportunities`; dedup (count 0) passes through; validation error → 400; persist error → 502.
- **`enqueueArcOpportunityScan`:** inserts an `agent_tasks` row with `task_type:"arc_opportunity_scan"` + tenant fields and calls notify (mock Supabase + notify).
- **Runner:** `propose_opportunity` calls the route with its args; `handler` dispatches `arc_opportunity_scan` → `runArcOpportunityScan`; the scan tool set includes `propose_opportunity` and excludes act/draft tools.
- **App action:** gated by `requireOperator`; revalidates.
- Full app + runner suites + `pnpm build`.

## Out of scope

- **Slice 2:** scheduled/automatic scans (cron wake on the runner).
- New deterministic detector rules.
- Arc auto-drafting campaigns from the opportunities it just proposed (stays a separate, human-approved step).
- Editing/scoring opportunities from the scan.
