# Campaign Workflow Redesign + Seeded Test Campaign — Design

Date: 2026-06-02
Branch: feat/campaigns-tab
Status: Approved (design), pending implementation plan

## Problem

The app has two surfaces that overlap and compete:

- `/campaigns/[campaignId]` — the individual workspace already has an **Approvals tab**
  with inline approve / decline / archive.
- `/approvals` — a *separate* global queue that performs the same actions again.

The standalone Approvals page is half "my to-do list" and half "what already
happened." That blend is the core problem. Operators don't know which surface is
authoritative, and there is no clean, immutable record of decisions that the
Arc agent (surfaced as **Arc**) can cite when planning.

Separately, no single campaign is fully populated across all tabs, so the
individual view is hard to evaluate and demo.

## Goal

Separate the three distinct jobs the current UI conflates, give each one home,
and provide a fully-filled test campaign to evaluate the individual view.

| Job | Where it lives | Nature |
|---|---|---|
| **Triage** — "what needs me now?" | Today inbox + campaign-card pending badges | action |
| **Decide in context** | Campaign workspace (Approvals tab + Overview banner) | action |
| **History / ledger** | `/approvals` → renamed **Activity**, plus a read API | reference (read-only) |

`/approvals` stops being an action queue and becomes the immutable record of every
decision. Arc gains a programmatic way to reference that record.

## Non-goals

- Enabling any outbound send / publish / launch / spend. Approval flips approval
  status only; dispatch stays hard-locked (`launch_locked`, `dispatch_locked`).
- Reworking the campaign data model or the 5-tab structure of the workspace.
- Unrelated refactors outside the campaign/approval surfaces.

## Design

### 1. Today inbox — `src/app/page.tsx`

Replace the "Waiting on approval" `OpportunityBucket` with a real **Needs your
approval** list. Reuses the existing `listApprovalCards({ limit })` read-model
already loaded on this page. Each row shows: title · persona · risk pill · quick
actions.

Risk-gated one-click behavior:

- **low / medium risk** → inline `[✓ approve] [✗ decline]` buttons. Clicking
  fires a server action, optimistically removes the row, and shows an **undo
  toast**.
- **high / blocked risk** → action buttons are disabled and replaced with
  `[Open →]`, linking to the campaign workspace so the operator sees the full
  draft + reasoning before deciding.

Undo writes a **compensating `approval_decision`** (a reversal) rather than
hard-deleting history. History is append-only.

### 2. Campaign Overview inline decision banner

The workspace already has an Approvals tab. Add a compact approve / revise banner
to the **Overview** tab so the operator does not need to switch tabs. Driven by
the existing `DecisionControls` component and existing server actions. Gallery
cards (`campaign-gallery.tsx`) gain a `● N pending` badge.

### 3. `/approvals` → Activity Ledger — `src/app/approvals/page.tsx`

Rewrite as a read-only, reverse-chronological table sourced from
`approval_decisions` (not `approval_items`). Columns: *when · who · decision ·
item · campaign · notes*. Filterable by campaign, decision kind, and date. No
action buttons. Nav label "Approvals" → **"Activity"** in
`src/app/_data/growth-engine.ts`.

### 4. Read API for Arc — `GET /api/v1/approvals/history`

Bearer-gated via existing `checkBearerToken(request, "ARC_AGENT_API_TOKEN")`.
Returns `503 not_configured` if Supabase admin is not configured. Response is an
array of decisions:

```json
{
  "item_type": "campaign_email",
  "decision": "approved",
  "decided_by": "evan",
  "decided_at": "2026-05-28T15:04:00Z",
  "decision_notes": "Looks good",
  "campaign_id": "…",
  "risk_level": "medium"
}
```

Query params: `?campaign_id=` (filter) and `?limit=` (cap). Backed by a new
read-model function `listApprovalHistory(opts)` in
`src/lib/approvals/read-model.ts`.

### 5. Server actions — real state transitions

Extend `src/app/campaigns/actions.ts` (or a shared `src/lib/approvals/actions`)
with `approveFromInbox` / `declineFromInbox` / `undoDecision`. Each:

1. `requireOperator()`
2. `isSupabaseAdminConfigured()` guard
3. Write an `approval_decision` row recording `previous_status → next_status`
4. `revalidatePath('/')`, `'/approvals'`, `'/campaigns'`

Outbound stays locked throughout. Approval only flips approval status, never
dispatch. `undoDecision` writes a compensating decision row that returns the item
to its prior status.

### 6. Seed — fully-filled test campaign

New `scripts/seed-test-campaign.mjs` + `pnpm seed:test-campaign`. Scenario:
**"Spring Flood Recovery — North Shore Property Managers"**, persona =
property-manager partner, restoration focus = water backup / flood. Writes:

- **Overview**: all fields set (objective, audience_summary, offer_summary,
  persona, restoration_focus, owner, compliance_notes).
- **Creative**: 6–8 `campaign_assets` spanning every category group — landing
  page, search ad, social ad, email, SMS, video prompt, image prompt, one-pager.
- **Audience & Leads**: a `campaign_audiences` row + CRM company / contacts /
  leads and evidence URLs.
- **Reasoning**: rich `reasoning_payload` (why built, recommended action, tools
  used, guardrails, prompt inputs).
- **Approvals**: several `approval_items` of mixed risk, with **one already
  decided** (so the Activity ledger and history API are not empty).

Follows the existing `scripts/seed-arc-demo.mjs` conventions (manual
`.env.local` load, service-role client, deterministic suffix, draft/pending
states, outbound blocked).

### 7. Testing

- Read-model unit test: `listApprovalHistory` shaping / filtering.
- API route test: `401` without token, `200` with token, `503` when Supabase
  admin unconfigured.
- Action test: decision writes the correct state transition; `undoDecision`
  writes a compensating record and restores prior status.

## Affected files

- `src/app/page.tsx` (Today inbox)
- `src/app/campaigns/_components/campaign-gallery.tsx` (pending badge)
- `src/app/campaigns/_components/overview-tab.tsx` (inline banner)
- `src/app/approvals/page.tsx` (rewrite → ledger)
- `src/app/_data/growth-engine.ts` (nav label)
- `src/app/api/v1/approvals/history/route.ts` (new)
- `src/lib/approvals/read-model.ts` (`listApprovalHistory`)
- `src/app/campaigns/actions.ts` or `src/lib/approvals/actions.ts` (inbox actions + undo)
- `scripts/seed-test-campaign.mjs` + `package.json` script entry

## Constraints honored

- CLAUDE.md: approval actions are real backend state transitions; outbound stays
  locked; API routes carry their own bearer auth; persistence guarded by
  `isSupabaseAdminConfigured()`; new migration files only if schema changes are
  needed (none anticipated — `approval_decisions` already exists).
- DESIGN.md: reuse existing primitives (`PageHeader`, `StatusPill`,
  `WorkspacePanel`, `DecisionControls`); no emojis in product UI; no neon AI
  aesthetic.
