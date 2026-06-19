# Arc Intelligence Reads — Broaden Arc's Vision (Design)

**Date:** 2026-06-19
**Status:** Approved (design) — pending spec review
**Scope:** Give Arc read access to four product surfaces it's currently blind to — **opportunities, persona-intelligence, vault, activity** — via the established CRM-read pattern. (Partners / loss-routing / agent-operations deferred; same pattern, addable later.)

## Problem

Arc reads CRM, the brain, campaigns/approvals, performance, and the brand profile — but is blind to several intelligence surfaces that exist in the product and have working read-models: the **opportunity inbox**, **persona-intelligence**, the **vault**, and the **activity timeline**. It can be *triggered* to draft from a single opportunity but can't survey the inbox; it can't read persona-intelligence, vault notes, or the activity feed at all. Broadening its vision improves its reasoning and is squarely the product's "Persona Revenue Intelligence Layer / Opportunity Inbox" direction.

## What exists (no rebuild)

Each surface already has a read-model in `src/lib/<surface>/read-model.ts`:
- `opportunities`: `listOpenOpportunities(...)`, `getOpportunityForDraft(...)`, `countPendingOpportunities()`.
- `persona-intelligence`: `getPersonaIntelligenceData(client?)`.
- `vault`: `getVaultNotes()`, `getVaultNote(slug)`.
- `activity`: `getRecentActivity(query?, client?)`.

The Arc API + runner already have the read-tool pattern (`crm.ts` → `/api/v1/arc/crm/*`), the shared route helpers (`guard`/`ok`/`fail`/`readJson` in `_lib/http.ts`), org resolution via `getCurrentOrgId()`, and the runner's `readTools()` set + `ArcClient.apiGet`.

## Architecture (uniform per surface)

Three pieces per surface, all following the existing CRM-read shape:

1. **App route** — bearer-gated `GET /api/v1/arc/<surface>` (flat route, like `performance/route.ts`): `guard(request)` → call the existing read-model (which resolves org internally, as the other read-models do) → `ok({ ... })`; `fail(..., 502)` on error. Vault detail uses a `?slug=` query param on the same route (returns the single note when `slug` is present, else the list).

2. **Runner read-tool** — in a new `apps/arc-runner/src/tools/intelligence.ts`, each tool calls the route via `client.apiGet` and returns the result through the shared `runTool` helper (live step trace + 8000-char bound + never-throws). Registered in `readTools()` (`tools/index.ts`) so they're available in **every mode** (ask/act/draft) — read-only and safe, exactly like the CRM/brain/campaign reads.

3. **Prompt mention** — one block in `ARC_SYSTEM_PROMPT` describing the new read tools and when to use them.

### The tools (v1)
- **`list_opportunities`** (optional `status`, `persona` filters) → `listOpenOpportunities`. Browse the source-backed opportunity inbox.
- **`read_persona_intelligence`** → `getPersonaIntelligenceData`. The persona revenue-intelligence overview (segments, scores, signals).
- **`list_vault_notes`** → `getVaultNotes`; **`get_vault_note`** (`slug`) → `getVaultNote`. Arc's vault knowledge (frontmatter, backlinks).
- **`read_recent_activity`** (optional filters) → `getRecentActivity`. Cross-system activity timeline for situational awareness.

## Data flow

```
Arc turn (any mode) → tool call (e.g. list_opportunities)
  → client.apiGet("/api/v1/arc/opportunities?status=open")
  → route: guard → listOpenOpportunities(orgId) → ok({ opportunities })
  → runTool bounds + returns JSON → Arc reasons with it
```

## Deploy

- **App routes → Vercel auto-deploys.**
- **Runner tools → `apps/arc-runner/**` change → the Cloud Build trigger auto-deploys the runner.** This is the trigger's first real exercise; if it hiccups, fall back to `bash apps/arc-runner/deploy-cloud-run.sh`.

## Safety

- All four are **read-only**, **org-scoped**, **bearer-gated**, **bounded** (8000-char tool cap) — identical posture to the existing CRM read tools. No writes, no outbound, no new guardrail surface.
- Added to `readTools()` → present in all modes; consistent with how CRM/brain/campaign/performance reads already work.

## Testing

Per surface:
- **Route test** — 401 without token; returns the read-model's data for the current org (read-model mocked); 502 on read-model error. (Mirrors `campaigns/route.test.ts`.)
- **Tool test** — the tool calls the expected route and returns the bounded result (mock `ArcClient`). (Mirrors the runner tool tests.)
- **Registration** — update `index.test.ts` if it snapshots the read-mode tool-name set (add the new tool names; mirrors the SP1 brand-tools change).
- Full runner suite + `pnpm build`.

## Out of scope

- **Partners, loss-routing, agent-operations** reads (deferred; same pattern).
- Any **write** access to these surfaces (read-only v1).
- **Proactive/auto-surfacing** of opportunities (that's the separate "proactive Arc" capability — this only lets Arc *read* the inbox on demand).
- Auto-injecting these surfaces into the prompt every turn (they're on-demand tools, not always-on context like brand/recall).
