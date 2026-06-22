# Proactive Arc — Scheduled Autonomy, Slice 2 (Design)

**Date:** 2026-06-20
**Status:** Approved (design) — pending spec review
**Scope:** Run the opportunity scan **unprompted on a daily schedule** via a Vercel Cron → a `CRON_SECRET`-gated app route that reuses Slice 1's `enqueueOpportunityScanTask`. **Off by default** (enable flag), with a frequency guard. No outbound, no schema change.

> Slice 2 of Proactive Arc. **Slice 1 (merged, #157)** gave Arc the generation capability + an operator button. This slice makes it autonomous.

## Problem

Slice 1 only fires when an operator clicks "Ask Arc to find opportunities." For Arc to be genuinely proactive it must scan on its own cadence. The whole Slice 1 path (`enqueueOpportunityScanTask` → `notifyOpportunityScan` → runner `arc_opportunity_scan` wake → `propose_opportunity` → `upsertOpportunities`) is reusable; we only need a scheduled, session-less trigger.

## What exists (reuse, no rebuild)

- `enqueueOpportunityScanTask({ operator })` (`src/lib/opportunities/enqueue.ts`, Slice 1): resolves tenant via `getCurrentAgentTaskTenantFields()`, inserts the `arc_opportunity_scan` `agent_tasks` row, notifies the runner. Returns `{ ok, error? }`.
- `getCurrentWorkspaceContext()` (`src/lib/auth/workspace.ts`): resolves the workspace from the session cookie **or**, with `userId: null` (no operator session), falls back to the **default org's default workspace** (`fetchDefaultOrg` by `DEFAULT_ORG_SLUG` → `fetchDefaultWorkspace`, `source: "default-org"`). So `getCurrentAgentTaskTenantFields()` works from a session-less cron route.
- `getSupabaseAdminClient()` / `isSupabaseAdminConfigured()`.
- No `vercel.json` exists yet (this introduces it). No existing cron routes.

## Architecture

### a. Cron config — `vercel.json` (new)
```json
{ "crons": [{ "path": "/api/cron/opportunity-scan", "schedule": "0 13 * * *" }] }
```
Daily at 13:00 UTC (≈ early-morning America/Chicago). Vercel Cron runs only on the production deployment and issues a `GET` to the path. (Schedule is the one tunable knob; daily is the chosen default.)

### b. Route — `GET /api/cron/opportunity-scan` (`src/app/api/cron/opportunity-scan/route.ts`)
Gates in order, then reuse Slice 1:
1. **Auth.** Require `CRON_SECRET` to be set AND `request.headers.authorization === \`Bearer ${process.env.CRON_SECRET}\`` (the header Vercel Cron auto-sends when `CRON_SECRET` is configured). Otherwise → `401`. If `CRON_SECRET` is unset, treat as unauthorized (fail closed) — never run unauthenticated.
2. **Enable flag.** If `process.env.OPPORTUNITY_SCAN_CRON_ENABLED !== "1"` → `200 { ok: true, skipped: "disabled" }`. The cron still fires daily but no-ops until the env var is set in prod.
3. **Supabase guard.** If `!isSupabaseAdminConfigured()` → `200 { ok: true, skipped: "not_configured" }`.
4. **Frequency guard.** If `hasRecentOpportunityScan(20)` (a scan task created in the last ~20h — covers accidental double-fires and a recent manual scan, while still letting the daily cron run since >20h elapses) → `200 { ok: true, skipped: "recent" }`.
5. **Run.** `const r = await enqueueOpportunityScanTask({ operator: "Scheduled scan" })` → `200 { ok: r.ok, queued: r.ok }` (include `r.error` when `!ok`). Best-effort; the route never throws to Vercel.

### c. Recent-scan guard — `hasRecentOpportunityScan(withinHours)` (`src/lib/opportunities/recent-scan.ts`)
- Resolve the default tenant (`getCurrentAgentTaskTenantFields()`); query `agent_tasks` for `task_type = "arc_opportunity_scan"`, `org_id`/`workspace_id` = resolved tenant, `created_at >= now - withinHours`, `limit 1`. Returns `true` if any row exists. `false` when Supabase unconfigured or on read error (fail-open to running is acceptable — the upsert dedup still bounds flooding; but log the error).

### d. Config — `.env.example`
Document:
- `CRON_SECRET` — set in Vercel; the cron route requires it.
- `OPPORTUNITY_SCAN_CRON_ENABLED` — `"1"` to enable scheduled scans (default off).

## Data flow

```
Vercel Cron (daily, prod) → GET /api/cron/opportunity-scan  (Authorization: Bearer CRON_SECRET)
  → auth ok? → enabled? → configured? → no recent scan?
  → enqueueOpportunityScanTask({ operator: "Scheduled scan" })
      → resolves default workspace (session-less) → arc_opportunity_scan task → notify runner
  → runner runArcOpportunityScan → propose_opportunity → upsertOpportunities (pending, dedup)
  → pending opportunities appear in the inbox for approval
```

## Safety & scope

- **Off by default** (enable flag) — nothing autonomous until the operator flips `OPPORTUNITY_SCAN_CRON_ENABLED` in prod.
- **`CRON_SECRET`-gated, fail-closed** — only Vercel's scheduler can trigger it; an unset secret means it never runs.
- **Frequency guard** prevents double-runs / redundant scans.
- Everything produced is still **`pending`** (Slice 1's approval gate) with `upsertOpportunities` dedup — no flooding, nothing outbound.
- **No schema change.** Reuses the Slice 1 task/wake/persistence entirely.

## Testing

- **Route** (`route.test.ts`): `401` when no/!matching `CRON_SECRET`; `disabled` flag → `skipped:"disabled"` + `enqueue` NOT called; `not_configured` → skipped; recent-scan → `skipped:"recent"` + enqueue not called; authorized + enabled + configured + no-recent → `enqueueOpportunityScanTask` called, `queued:true`. (Mock `enqueueOpportunityScanTask`, `hasRecentOpportunityScan`, `isSupabaseAdminConfigured`, and env.)
- **`hasRecentOpportunityScan`**: returns true when a recent row exists, false when none / unconfigured (mock Supabase).
- `pnpm build`.

## Out of scope

- Per-org / multi-tenant scheduling (single default tenant for now).
- Operator-configurable cadence UI (schedule is fixed in `vercel.json`; tune by editing it).
- Auto-drafting from scheduled proposals (stays a human-approved step).
- Cloud Scheduler / runner-side cron (Vercel Cron + the existing enqueue is sufficient).
