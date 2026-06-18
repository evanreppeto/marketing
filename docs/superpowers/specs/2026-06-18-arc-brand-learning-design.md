# Arc Brand Learning & Brand-Kit Wiring — Design

**Date:** 2026-06-18
**Status:** Approved (design) — pending spec review
**Sub-project of:** Arc "second brain" (1 of 3 — see Decomposition)

## Problem

Arc should *know the company it works for*. Today the runner injects a hardcoded
`BSR_CONTEXT` constant (`apps/arc-runner/src/arc.ts:109` and `:152`) and never
reads the database. Meanwhile a full Brand Kit subsystem already exists app-side
but is **dormant** — Arc doesn't consume it, and there's no way for Arc to help
*build* a brand profile from real signal (a website, a few questions).

This sub-project closes that gap: Arc helps learn a brand (website analysis +
guided Q&A), proposes a profile the operator reviews and activates, and from then
on **every Arc turn is driven by the stored, org-scoped profile**.

## Decomposition (context)

The broader "second brain" ask is three sub-projects, built in order:

1. **Brand Learning & Brand-Kit wiring** *(this spec)* — Arc knows the company.
2. **Cross-chat recall** — Arc auto-captures durable facts and recalls them in
   every new conversation.
3. **Brain graph depth** — multi-hop traversal + semantic recall + dedup.

This spec covers **#1 only**.

## What already exists (reuse — do NOT rebuild)

Verified against source on `origin/main`:

- **Schema:** `business_profiles` (one row per org, `status` `draft|active`,
  `onboarding_completed_at`, all brand fields) and `persona_definitions`
  (`supabase/migrations/20260616140000_brand_kit_foundation.sql`).
- **Domain:** `src/domain/brand-kit.ts` — `BusinessProfile`, `ArcBusinessContext`,
  `NEUTRAL_DEFAULTS`, `NEUTRAL_PERSONAS`, `assembleArcContext()`,
  `validateBusinessProfile()`, `applyIndustryTemplate()`.
- **Persistence:** `src/lib/brand-kit/persistence.ts` — `getBusinessProfile`,
  `upsertBusinessProfile`, `listPersonaDefinitions`.
- **Assembly:** `src/lib/brand-kit/read-model.ts` — `getBusinessContext(orgId)`
  returns the assembled `ArcBusinessContext` **with neutral-defaults fallback**.
- **Editor UI:** `src/app/settings/brand-kit-{settings,form,actions}.tsx` — an
  operator-editable form, `requireOperator()`-gated, with a **draft→active
  toggle** ("Active — Arc is using this Brand Kit").
- **Org resolution:** `getCurrentOrgId()` (`src/lib/auth/org.ts`) resolves the
  single seeded BSR org by slug — **no cookie required**, so it works on the
  bearer-token (runner) path.

The human-facing side is essentially complete. **The only missing pieces are
(A) exposing the context to the runner and wiring it, and (B) the Arc-driven
learning capability.**

## Goal & success criteria

- The runner's system prompt is driven by `getBusinessContext()` for the current
  org, **replacing** the hardcoded `BSR_CONTEXT`, with graceful fallback.
- An operator can, inside an Arc chat, say "learn our brand: <url>", answer a few
  follow-ups, and have Arc write a **draft** `business_profiles` row plus an
  inline card pointing them to Settings to review and activate.
- Only an **active** profile drives Arc. Arc can never activate a profile —
  activation stays an operator action (existing toggle).
- BSR is onboarded as the first real profile; the hardcoded constant becomes a
  pure emergency fallback.

## Architecture

Follows existing layering: `domain/` (pure) → `lib/<feature>/` (I/O) →
`app/api/v1/arc/*` (bearer-gated routes) → `apps/arc-runner/` (tools + wiring).
All new routes use the `guard(request)` helper (`_lib/http.ts`) and resolve org
internally via `getCurrentOrgId()`, exactly like the existing Arc routes.

### A. Expose brand context to the runner (the centerpiece)

1. **New route** `GET /api/v1/arc/brand/context`
   - `guard(request)` (bearer + Supabase), then
     `return ok({ context: await getBusinessContext(await getCurrentOrgId()) })`.
   - Always returns a usable context (read-model already falls back to
     `NEUTRAL_DEFAULTS`).
2. **Runner client** `ArcClient.getBusinessContext(): Promise<ArcBusinessContext>`
   — GETs the route.
3. **Wiring** in `apps/arc-runner/src/arc.ts`:
   - Resolve the context once per turn (in `runArcTurn` and
     `runArcOpportunityDraft`) and pass it into `ctx.business`.
   - On fetch failure, fall back to a local default constant (keep the existing
     BSR constant, renamed to `FALLBACK_CONTEXT`, in `business-context.ts`) so a
     transient app/network error never breaks a turn.

### B. Website analysis (the "learning" input)

1. **New route** `POST /api/v1/arc/brand/analyze-website`
   - Body `{ url }`. `guard(request)`.
   - **SSRF hardening:** allow only `http(s)`, resolve and reject private/loopback/
     link-local IP ranges and non-public hosts, follow ≤2 redirects, ~5s timeout,
     ~1MB response cap.
   - Fetch the page; strip scripts/styles/markup to readable text; extract
     `<title>`, meta description, logo/favicon URL, and theme/accent color if
     present. Cap the returned text (~8000 chars, matching the runner's tool
     result bound).
   - **No LLM here.** Returns `{ text, title, description, logoUrl, faviconUrl,
     accent }` for Arc to reason over.
2. **Runner tool** `analyze_website({ url })` (draft mode only) — calls the route,
   returns the cleaned content. Read-only and outbound-safe (fetching a public
   site the operator named).

### C. Arc proposes a draft profile

1. **New route** `PUT /api/v1/arc/brand/profile`
   - Body = a partial/whole `BusinessProfile`. `guard(request)`.
   - Load current via `getBusinessProfile(orgId)` (or `NEUTRAL_DEFAULTS`).
   - **Invariant — protect the live profile:** if the current profile is
     `status: "active"`, **reject** the write (`fail("locked", ...)`, 409-style)
     with a message telling Arc to ask the operator to edit in Settings. Arc only
     writes when no profile exists or it is already `draft`. (Re-onboarding an
     active brand is a fast-follow.)
   - Merge proposed fields onto current, **force `status: "draft"`**, run
     `validateBusinessProfile`, then `upsertBusinessProfile`. Arc can never write
     `active`.
2. **Runner tool** `propose_brand_profile({ ...fields })` (draft mode only) —
   calls the route, then emits an approval-style **brand card** (reusing the
   `emit_card` pattern) summarizing the proposed profile and linking the operator
   to `/settings` to review and activate.

### D. Runner tool registration

Add `apps/arc-runner/src/tools/brand.ts` exporting `analyze_website` and
`propose_brand_profile`; register them in `tools/index.ts` under **draft mode**
(and include in `allowedToolNames("draft")`). No new mode is introduced.

## Data flow (happy path)

```
Operator (Arc chat, draft mode): "Learn our brand: bigshouldersrestoration.com"
  → analyze_website  → app fetches + cleans the site (SSRF-guarded)
  → Arc asks 1–3 gap-filling questions (personas? banned phrases? compliance?)
  → propose_brand_profile → PUT /brand/profile writes business_profiles(status=draft)
       + Arc emits a Brand Profile card → "Review & activate in Settings"
  → Operator opens /settings, edits, flips the toggle to Active (existing UI)
  → Next Arc turn: GET /brand/context → assembled active profile drives the prompt
```

## Safety & invariants

- **Human approves.** Arc writes only `status: draft`; activation is operator-only
  via the existing toggle. Arc-learned brand never silently drives outbound copy.
- **Live profile protected.** The write route refuses to mutate an `active`
  profile.
- **SSRF-safe fetch.** Scheme allowlist, private-IP rejection, redirect/size/time
  caps.
- **No outbound surface touched.** This only shapes Arc's *context*.
- **Graceful degradation.** Context route always returns a usable bundle; runner
  falls back to a local default on fetch failure.

## Testing

- **Domain:** existing `assembleArcContext` / `validateBusinessProfile` tests
  stand; no new domain logic (merge happens in the route layer).
- **Routes:**
  - `brand/context` returns the assembled context for the seeded org.
  - `analyze-website` rejects private/loopback URLs and non-http schemes; honors
    the size/time cap; returns cleaned text + metadata for a normal page.
  - `brand/profile` PUT forces `draft`, validates, and **refuses to overwrite an
    active profile**.
- **Runner:** `tools/brand.ts` tools against a mocked `ArcClient`; a
  context-resolution test (fetched context vs. fallback on error), mirroring the
  existing `apps/arc-runner/src/context.test.ts`.

## Out of scope (fast-follows)

- Brand **photo library** seed (touches the media-library subsystem).
- Re-onboarding / editing an **active** profile through Arc.
- Per-org **persona editing** UI (we read `persona_definitions`; editing later).
- Multi-page crawling, brand version history, scheduled re-learning.
- Multi-tenant auth (the org-scoped path is ready; only BSR is onboarded now).
