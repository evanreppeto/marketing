# Arc Web Access + Discovery → Propose — Phase 2a Design

**Date:** 2026-06-23
**Status:** Approved (design), pending implementation plan
**Depends on:** PR #194 (Arc CRM write capability — `create_lead`/`update_record`, `origin`/`review_status` columns)

## Problem

Arc can now create CRM records (PR #194), but it still can't *find* anything outside the app — it has no web access, so when asked to "find plumbers and insurance agents in these zip codes" it can only report the CRM is empty and ask the operator to supply a list. Evan's direction: **"Arc should have access to the internet or whatever it needs to find information. It shouldn't just be tied down to searching the information in our app."**

The Arc runner (`apps/arc-runner/`, Cloud Run) makes **no arbitrary outbound web calls** — even the existing `analyze_website` tool delegates to an app route (`POST /api/v1/arc/brand/analyze-website`); the app does the fetch. The runner's SDK call (`apps/arc-runner/src/arc.ts:95`) restricts tools to an allowlist of `mcp__arc__*` tools only. So adding web access means adding app routes + runner tools, not opening the runner to the internet directly.

## Goal

Give Arc general web access (search + read pages) so it can ground decisions in current information AND prospect for net-new leads — every external call mediated by the app (auditable, metered, guardrailed), and every discovered lead landing as a **proposed** record for human review. Nothing reaches the outside world; discovery produces review-gated proposals, never contact.

## Approach

App-mediated, mirroring `analyze_website`. The app owns the external calls (provider secrets server-side, SSRF guards, logging, metering); the runner gets thin delegating tools. Chosen over Anthropic's native `web_search`/`web_fetch` server tools because it preserves this product's deliberate boundary (runner only talks to the app + Anthropic) and its "everything auditable" ethos.

## The discovery loop (what success looks like)

Operator: "Find plumbers and insurance agents in 60614 and 60618."
Arc (act/draft mode): `web_search("plumbing contractors 60614")` → `web_fetch` the promising directory/listing pages → extract business name + phone + address → for each candidate, `create_lead({ persona: persona_plumbing_partner, source: "arc_web_discovery", company_name, ..., review_status: "proposed", agent_confidence })` → `cite_sources` with the pages used → summarize. The leads appear under a **Proposed** filter; the operator **Confirms** or **Dismisses** each. No new "discovery engine" is built — the loop emerges from `web_search` + `web_fetch` + the existing `create_lead`, guided by the prompt.

## Components

### 1. Search provider module (`src/lib/web-search/`)
Thin wrapper over a search provider (default **Tavily** — agent-oriented, returns clean title/url/snippet/optional content, free tier ~1k/mo). Config: `WEB_SEARCH_API_KEY` (+ optional `WEB_SEARCH_PROVIDER`, default `tavily`). `isWebSearchConfigured()` guards everything; unset → graceful `not_configured` (mirrors `isSupabaseAdminConfigured`). Provider call returns a normalized `WebSearchResult[]` (`{ title, url, snippet, publishedAt? }`).

### 2. App routes (bearer-gated via `arcGuard`, org-scoped)
- `POST /api/v1/arc/web/search` — body `{ query: string, max_results?: number }`. Validates, caps `max_results` (default 5, max 10), calls the provider, returns `{ results }`. Returns `not_configured` (503-style) when no key. Logs the query (audit) and meters usage.
- `POST /api/v1/arc/web/fetch` — body `{ url: string }`. Fetches + extracts readable text + title by **generalizing the existing `/api/v1/arc/brand/analyze-website` extraction** (refactor the shared fetch/extract into `src/lib/web-fetch/` and have both routes use it). Returns `{ url, title, text }` (text length-capped). **SSRF guard (mandatory):** http(s) only; reject hostnames resolving to localhost / private (RFC1918) / link-local / unique-local / cloud metadata (169.254.169.254) ranges; per-request timeout; max response bytes. This protects the app server, which holds the Supabase service-role key.

### 3. Runner tools (`apps/arc-runner/src/tools/web.ts`)
- `web_search` — `{ query, max_results? }` → `client.apiPost("/api/v1/arc/web/search", ...)`.
- `web_fetch` — `{ url }` → `client.apiPost("/api/v1/arc/web/fetch", ...)`.
Both follow the `analyze_website` pattern (`tool()` + `runTool` + `client.apiPost`). Registered in **read tools** (`readTools` in `apps/arc-runner/src/tools/index.ts`) so they're available in every mode — reading the web is not a mutation. When unkeyed the route returns `not_configured` and the tool surfaces that to Arc.

### 4. Prompt update (`apps/arc-runner/src/prompt.ts`)
Add web capability + the prospecting protocol: Arc can `web_search` and `web_fetch` to ground decisions and must `cite_sources` for what it used; to prospect, it searches → reads → extracts → calls `create_lead` with `review_status: "proposed"` and a `source` like `arc_web_discovery`, then cites the pages. Restate the non-negotiable: discovered leads are review-gated proposals — Arc never contacts anyone and never marks them active itself.

### 5. Proposed-leads review affordance (closes the human gate)
Discovery creates `review_status: "proposed"` leads, so the operator needs to act on them:
- A **"Proposed"** filter/segment on the CRM leads list surfacing `review_status = 'proposed'` (org-scoped).
- A **human-only** Confirm / Dismiss action (server action gated by `requireOperator()`) that sets `review_status` → `active` / `dismissed`. This is operator-only by design — Arc cannot flip `review_status` (PR #194 removed it from Arc's update whitelist), so the human gate is real.
- Reuse existing primitives (the "Added by Arc" pill from PR #194, `StatusPill`, list components). Per `DESIGN.md`.

### 6. Cost & safety controls
`max_results` cap; fetch timeout + size cap; off-by-default flag (`WEB_SEARCH_API_KEY` unset → disabled); Arc stays operator-triggered (no autonomous/scheduled sweeps). SSRF guard per §2.

## Out of scope (later phases)
- A dedicated **structured prospecting provider** (Apollo / Google Places) for higher-quality *bulk* contact data — Phase 2b, behind a flag like Higgsfield.
- **Sub-agent fan-out** for large multi-zip sweeps (cheap model for grunt extraction, Opus for keep/drop) — deferred; v1 does it sequentially.
- **Scheduled/autonomous discovery** — out; discovery is operator-triggered only.

## Testing
- Provider module: normalization of provider response → `WebSearchResult[]`; `isWebSearchConfigured` gating (pure/unit).
- SSRF guard: unit-test the host/IP classifier — localhost, 10.x, 192.168.x, 169.254.169.254, IPv6 unique-local are rejected; public hosts allowed.
- Routes: `arcGuard` enforcement; `not_configured` when unkeyed; `max_results` cap; malformed body → 400.
- Confirm/Dismiss server action: `requireOperator()` gate; org-scoping; sets the right `review_status`.
- `pnpm test` + app/runner `tsc` + scoped lint + `pnpm build`.

## Risks / deploy notes
- **New env var** `WEB_SEARCH_API_KEY` must be set in the app (Vercel) for prod; runner needs **redeploy** for the new tools/prompt (separate from the Vercel app deploy). Per project memory (`vercel-deploy`, `arc-runner-cloud-run-live`).
- **SSRF is the main security risk** — the guard in §2 is mandatory and must be unit-tested before merge.
- **Provider cost** — bounded by `max_results` + operator-triggered usage + the off-by-default flag.
- **Service-role/RLS** — the new routes + the Confirm/Dismiss action must gate tenancy in the app layer (arcGuard / requireOperator + org scope); RLS is not a backstop because the app uses the service-role client.
