# AI Usage Tracker — Design

**Date:** 2026-06-22
**Status:** Approved (brainstorm) → ready for implementation plan

## Summary

Build an **in-app AI usage tracker**: a metering ledger and dashboard that captures
what the workspace (and individual users within it) consume across the AI services
the app actually runs — Arc's Claude calls and Gemini image/video generation —
scoped per workspace and per user.

The headline lens is **estimated cost ($)**, derived from real token counts × a
per-model pricing table, with volume (tokens, generations) and activity (runs per
user) available as drill-downs.

Scope is **AI the app runs**, not external AI subscriptions. This is pure
observability — it adds no outbound, send, publish, or approval behavior.

## Goals

- Capture real usage for every AI action the app performs, with workspace + user scoping.
- Present an at-a-glance estimated-cost view, with breakdowns by service/model and by user.
- Keep historical cost rows correct even if pricing changes later.
- Stay generic/multi-tenant — no hardcoded BSR personas or segments.

## Non-goals

- Tracking external AI tools/subscriptions (ChatGPT, Higgsfield, Midjourney, etc.).
- Real billed amounts — all figures are clearly labeled **estimated**.
- Any change to approval-gating or outbound behavior.

## Architecture (domain → lib → app)

- `src/domain/ai-usage.ts` — pure logic, no I/O, unit-tested:
  - Per-model **pricing table** (versioned), e.g. Opus 4.8, Haiku 4.5, Gemini image/video.
  - `estimateCostCents(model, inputTokens, outputTokens)`.
  - `estimateMediaCostCents(service, model, units)`.
  - Rollup/aggregation: group events → totals by workspace / user / service / model / day.
  - Safe fallback for unknown models (cost 0, flagged in metadata).
- `src/lib/ai-usage/persistence.ts` — `recordUsageEvent(...)`, guarded by
  `isSupabaseAdminConfigured()`; no-ops cleanly when Supabase is unset.
- `src/lib/ai-usage/read-model.ts` — query rollups for the dashboard, scoped by
  workspace + time range.
- `src/app/usage/` — server-component dashboard page (`requireOperator()`-gated) +
  colocated `_components`.

## Data model — new table `ai_usage_events`

One row per AI action; the single metering ledger every path writes to.

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `workspace_id` | uuid/text | active workspace (`signal_active_workspace`); indexed |
| `org_id` | uuid/text | from `getCurrentOrgId()` for tenant scoping |
| `actor_user` | text null | operator who triggered it; null for autonomous Arc runs |
| `service` | enum | `arc_claude` \| `gemini_image` \| `gemini_video` |
| `model` | text | e.g. `claude-opus-4-8`, `gemini-2.5-flash-image` |
| `input_tokens` | int null | Claude only |
| `output_tokens` | int null | Claude only |
| `units` | int null | media count; default 1 for media |
| `cost_estimate_cents` | int | computed at write time via the pricing module |
| `task_id` | uuid null | links to `agent_tasks` when present |
| `campaign_id` | uuid null | links spend to a campaign when present |
| `occurred_at` | timestamptz | default now(); indexed |
| `metadata` | jsonb | route, mode (ask/draft/scan), job id, pricing version, etc. |

Indexes: `(workspace_id, occurred_at)`, `(org_id, occurred_at)`, `service`.

**Why a new table, not `agent_run_logs`:** that table is per-task agent logging with
no workspace/actor dimension, and media generation has no table at all. A dedicated
ledger gives one clean read-model across all AI services with consistent scoping.
`agent_run_logs` is left unchanged.

New migration file under `supabase/migrations/` (timestamped; do not edit shipped ones),
including the `ai_usage_service` enum and the data-API role grants used by the other tables.

## Capture paths & data flow

Both paths compute cost at write time, so the dashboard never recomputes.

### Path 1 — Arc / Claude (cross-service)

- In `apps/arc-runner`, after each `query()` completes, extract the Agent SDK `usage`
  (input/output tokens — already returned, currently unused) and include
  `input_token_count` / `output_token_count` in the existing
  `POST /api/v1/arc/tasks/:id/log` call.
- The log route (`src/app/api/v1/arc/tasks/[id]/log/route.ts`) accepts the two new
  fields, keeps writing `agent_run_logs` as today, **and additionally** calls
  `recordUsageEvent({ service: 'arc_claude', model, input_tokens, output_tokens, ... })`.
- Workspace / org / actor are resolved **server-side from the task record** in the
  route — not trusted from the runner. Keeps the runner dumb and the scoping trustworthy.

### Path 2 — Gemini media

- In `generate-image/route.ts` and `generate-video/route.ts`, after a successful
  generation, call `recordUsageEvent({ service: 'gemini_image' | 'gemini_video',
  model, units: 1, ... })` with `workspace_id` / `actor_user` from the operator
  session + active-workspace cookie.

### Cost & safety

- `recordUsageEvent` calls the domain pricing functions and stores the resulting
  `cost_estimate_cents`; the pricing version is recorded in `metadata` so historical
  rows stay correct after price changes.
- Usage recording is **best-effort**: wrapped so a ledger write failure never breaks
  an Arc reply or a media generation. Logs and moves on.

## Dashboard UI & nav

- Route: top-level `/usage`, server component, `requireOperator()`-gated, scoped to
  the active workspace. Time range via `searchParams` (7d / 30d / 90d / custom) so
  it's linkable.
- Nav: register in **both** `console-frame.tsx` (the hardcoded array that actually
  renders — known silent-drop hotspot) and `growth-engine.ts`, in the Intelligence
  section near Analytics. Label: **Usage**.

Page sections (DESIGN.md: hairlines over card-soup, one editorial type moment,
accent ≤2×, no equal 3-column rows, no recharts):

1. **Header + controls** — `PageHeader` (title-first, no eyebrow) + time-range control.
2. **Hero stat** — estimated AI cost for the range as the confident type moment
   (Fraunces), small delta vs. previous period, deterministic inline-SVG sparkline.
3. **Breakdown by service/model** — hairline-ruled list: Arc (Claude Opus / Haiku),
   Gemini (image / video); each row shows cost, share, and volume.
4. **By user** — compact table of `actor_user` rows (cost, runs, tokens/gens);
   autonomous Arc runs roll up under "Arc (autonomous)".
5. **Recent activity** — short ledger tail of the last N usage events for
   auditability/debugging.

States: `EmptyState` when no events yet or Supabase unconfigured (local dev). All
cost figures labeled **"estimated"**.

## Testing

- `src/domain/__tests__/ai-usage.test.ts`: pricing math per model, media cost,
  rollup/aggregation correctness, edge cases (null tokens, zero usage, unknown model
  → safe fallback). This is the high-value surface.
- `recordUsageEvent` no-ops cleanly without Supabase.
- `pnpm build`/tsc after the migration (typed Supabase enums need literal unions).

## Rollout notes

- The migration must be applied to the prod DB **manually** (Vercel auto-deploys code,
  not migrations).
- The **arc-runner change requires a Cloud Run redeploy** before Claude token capture
  goes live. Gemini media usage starts flowing as soon as the Next app deploys.
