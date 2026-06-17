# Opportunity Inbox — Sub-project 1 (design)

**Date:** 2026-06-17
**Status:** Approved design direction, pending spec review
**Scope:** Make Arc proactive: detect **source-backed opportunities** and surface them in an **Opportunity Inbox**, where one click turns an opportunity into an **Arc-authored, approval-gated campaign draft**. First detection source: **CRM inactivity (cold leads)**. Everything stays human-gated; nothing goes outbound.

This is sub-project 1 of the "Proactive Arc" effort (roadmap item #3). It builds on wired infrastructure: the `agent_tasks` queue, the approval/campaign-draft path (`src/lib/campaigns/create.ts` + `POST /api/v1/arc/campaigns/draft-asset`), Arc's `create_campaign_draft` tool, the agent-operations read-model, and the existing (unwired) `opportunity-command-center.tsx` component.

---

## Goal

Arc finds leads that have gone quiet and presents them as opportunities with evidence (last activity, score, persona, source links), a confidence/urgency read, and a recommended action. The operator reviews and, with one click, has **Arc draft a real approval-gated campaign package** for that lead — then approves/declines it in the existing campaigns flow.

## Non-goals (deliberate follow-ups)
- **Automatic scheduling / cron** detection — v1 detection is operator-triggered (on-demand "Scan"). A scheduled runner comes later.
- **Other detection sources** (weather, competitor, new-lead, performance anomalies) — same `opportunities` spine, added as follow-up plans.
- **Auto-drafting on detection** — v1 detects only; drafting is an explicit per-opportunity operator action (cost + control).
- **Outbound** — never. The draft lands in the existing approval gate.

---

## Core operating principle (unchanged)
Agent finds the work. Human approves decisions. Database remembers everything. Detection and drafting are both surfaced for human review; the draft is `pending_approval` + `dispatch_locked` like every other Arc draft.

---

## Architecture

### 1. Data model — `opportunities` table
Org-scoped (via `getCurrentOrgId()`, like interactions). A durable record of a detected opportunity:

- `id`, `org_id`
- `kind` — detection family; v1 = `"crm_inactivity"`
- `subject_type` / `subject_id` — what it's about (v1: `"lead"` + lead id)
- `title`, `summary` — human-readable
- `confidence` (0–100), `urgency` (`low` | `medium` | `high`)
- `evidence` (jsonb) — last-activity date, lead score, persona, source record links
- `recommended_action`, `recommended_campaign_type`
- `status` — `pending` → `drafting` → `drafted` | `dismissed` | `snoozed`
- `campaign_id` (nullable) — set when an Arc draft is created
- `agent_task_id` (nullable) — the proactive draft task
- `detected_by`, `created_at`, `updated_at`, `dismissed_at`, `snoozed_until`

**Dedup:** the detector does not create a new `pending` opportunity for a `(kind, subject_id)` that already has an open (`pending`/`drafting`/`drafted`) row. Re-scans refresh evidence on the existing open row instead of duplicating.

### 2. Detection — `src/domain/opportunity-detection.ts` (pure)
Deterministic, unit-tested. Input: lead records with recency (latest event/interaction timestamp), lead score, persona, and whether the lead has an active campaign. Output: `OpportunityCandidate[]` for leads that are **cold ≥ N days** (default 30), **not won/dismissed**, and have **no live campaign**. Confidence/urgency derived from `leadScore × daysCold` (high-value + long-cold = high urgency). No I/O.

### 3. Pipeline — `src/lib/opportunities/`
- `detector.ts` — pulls candidate CRM data (via repos/read side), runs the pure detection, and persists new/refreshed opportunities. Guarded by `isSupabaseAdminConfigured()`.
- `persistence.ts` — create/refresh (with dedup), `dismiss`, `snooze`, `markDrafting`, `markDrafted(campaignId)`.
- `read-model.ts` — list opportunities for the inbox, bucketed by urgency/kind, with counts.

### 4. Trigger (v1)
An operator-gated **"Scan for opportunities"** server action on the inbox runs `detector` + `revalidatePath`. (A bearer `POST /api/v1/opportunities/detect` for a future cron/runner is noted but deferred.)

### 5. Inbox UI — `/opportunities`
New route + `navItems` entry; a count chip on `/arc`. Wires the existing `opportunity-command-center.tsx` (adapting its props to the read-model). Each opportunity card: title, summary, evidence with a link to the source lead, confidence/urgency, recommended action, and actions: **Draft with Arc** · **Dismiss** · **Snooze**.

### 6. Opportunity → Arc-authored draft (the proactive loop)
On **Draft with Arc** (opportunity `pending` → `drafting`):
1. App server action inserts an `agent_task` (`source_type: "opportunity"`, `source_id: opportunity.id`), stamps `opportunities.agent_task_id`, and best-effort **wakes the runner** with a new payload type `arc_opportunity_draft` carrying the opportunity context (lead, persona, evidence, recommended angle). Best-effort like the chat wake — if it doesn't land, the task stays queued.
2. **Runner** handles `arc_opportunity_draft`: runs Arc in **draft mode** with a preamble built from the opportunity context, instructing it to produce a campaign **package** via `create_campaign_draft` (one or more channel assets). The draft-asset endpoint is extended to accept an optional `opportunity_id`; when present it links `opportunities.campaign_id` and flips status → `drafted`.
3. Runner completes the `agent_task` via the agent-task lifecycle API (no chat bubble involved).
4. The inbox shows the opportunity as **drafted** with a link to the campaign in `/campaigns`, where the operator approves/declines through the existing flow.

---

## Data flow (happy path)
operator clicks Scan → detector runs cold-lead detection over CRM data → `opportunities` rows (pending) → inbox renders with evidence → operator clicks **Draft with Arc** → agent_task + runner wake → Arc drafts approval-gated package (`create_campaign_draft`, linked to the opportunity) → opportunity = drafted, campaign in approval queue → operator approves in `/campaigns`.

## Error handling
- Supabase not configured → detector/persistence degrade gracefully (`not_configured`); inbox shows an empty/"connect" state.
- Runner wake fails → opportunity stays `drafting` with a queued `agent_task`; a re-try control resends the wake (the task is the source of truth).
- Draft failure in the runner → agent_task marked blocked; opportunity returns to `pending` with a note (no partial campaign left dangling beyond the standard non-transactional caveat already documented in `create.ts`).
- Dedup prevents re-scan from flooding the inbox.

## Testing
- **Domain:** `opportunity-detection` unit tests — cold/won/dismissed/has-campaign cases, threshold boundaries, confidence/urgency derivation.
- **Lib:** detector dedup + refresh; persistence dismiss/snooze/mark-drafted (mock Supabase).
- **API/runner:** draft-asset `opportunity_id` linkage; runner `arc_opportunity_draft` handler stub test (asserts it drafts + links + completes the task).
- **Manual:** Scan with seeded cold leads → opportunities appear with evidence; Draft with Arc → approval-gated campaign appears in `/campaigns` linked to the opportunity; Dismiss/Snooze remove it from the active inbox.

## Acceptance criteria
1. Scanning surfaces cold-lead opportunities with real evidence + source links; re-scanning doesn't duplicate.
2. Each opportunity shows confidence/urgency and a recommended action.
3. **Draft with Arc** produces a real, **Arc-authored, approval-gated** campaign draft linked to the opportunity; nothing goes outbound.
4. Dismiss/Snooze manage the inbox; a count chip shows on `/arc`.
5. No outbound path; all gated. Degrades gracefully without Supabase/runner.

---

## Suggested plan split (for the writing-plans stage)
Sub-project 1 is two shippable plans:
- **Plan 1 — Opportunity spine:** `opportunities` table + migration, `opportunity-detection` domain, `src/lib/opportunities/*`, the `/opportunities` inbox (wiring the existing component) + navItem + `/arc` count chip, Scan action, Dismiss/Snooze. Ships the discovery surface end-to-end (drafting button present but stubbed/disabled).
- **Plan 2 — Proactive Arc-authored drafting:** `agent_task` enqueue + `arc_opportunity_draft` wake-type + runner handler, draft-asset `opportunity_id` linkage, the live **Draft with Arc** action, task-completion + opportunity linkage.

## Open items for the plan stage
- Confirm how lead recency is sourced (latest `events` row vs the interactions timeline vs a lead column) and the cold-threshold default.
- Inspect `opportunity-command-center.tsx`'s current props to map the read-model onto it (adapt vs lightly refactor).
- Confirm the org-scoping helper (`getCurrentOrgId()` in `src/lib/auth/org.ts`) and the repos available for reading leads with score/persona/recency.
- Confirm the runner wake/bridge shape to add `arc_opportunity_draft` alongside `arc_chat_message`, and the agent-task lifecycle API for completion.
