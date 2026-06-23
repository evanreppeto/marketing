# First-Run Activation — Arc-Led Setup (Design)

**Date:** 2026-06-22
**Status:** Approved (design)
**Program:** Access & Activation — Project 3a of 3 (front door → branded invite email → **Arc-led first-run activation**)

## Problem

After a new owner creates a workspace (`/onboarding`) or an invited teammate finishes
setup (`/welcome`), they're dropped onto the cold home page with **no guidance and no
setup**. Arc knows nothing about their business, the brand kit is empty, and nothing tells
them where to go. The capability to fix this already exists — `analyze-website` extracts
brand signal from a URL, and `business_profiles` + `brand-knowledge` persist and teach it —
but there is **no orchestration** that walks a new owner through it. This project adds that
first-run layer.

Approach chosen: **guided, structured first-run where Arc does the work behind each step**
(not a free-form chatbot). Deterministic, approval-safe, testable, reuses existing brand
machinery. A conversational Arc interview is a future layer (3b) launched from the home
this project builds.

## Goals

- A brand-new owner is routed into a focused setup flow, not the cold home.
- Step one captures their brand from their website with one input ("What's your website?"),
  Arc extracts it, the owner confirms/edits, and it persists to the brand kit.
- The home page shows a resumable "finish setup" checklist that routes them to the right
  next actions, dismissible once the core step is done.
- Everything is **generic / org-configurable** — no hardcoded BSR personas or segments.

## Non-goals (deferred to 3b)

- Free-form conversational Arc onboarding interview.
- Auto-proposing customer segments / personas from the website.
- Auto-seeding starter campaigns or CRM records.
- Multi-workspace-per-org activation nuance (v1 keys activation at the **org** level; the
  dominant first-run case is one workspace per org).

## Architecture

Follows the wired reference shape (`requireOperator()` + `isSupabaseAdminConfigured()` →
`src/lib/<feature>/` persistence → `revalidatePath`), like vault/campaigns.

### 1. Persistence — `org_onboarding_state` (new migration)

One row per org, created lazily on first read/write:

```
org_onboarding_state(
  org_id uuid primary key references organizations(id) on delete cascade,
  brand_captured_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

Only the **brand** step is explicitly persisted; the other checklist items are *derived*
from real data (below), so the table stays minimal (YAGNI — no generic step array yet).
New timestamped file in `supabase/migrations/`; **must be applied to prod by hand** per the
manual-migration process (note in PR).

### 2. Domain — `src/domain/activation.ts` (pure, unit-tested)

```ts
type ActivationSignals = {
  brandCaptured: boolean;
  dismissed: boolean;
  hasMedia: boolean;
  hasCampaign: boolean;
  hasTeammate: boolean;
};
type ActivationStep = { key: "brand" | "media" | "campaign" | "team"; done: boolean };
buildActivationChecklist(signals): { steps: ActivationStep[]; coreDone: boolean; showChecklist: boolean }
```

- `coreDone` = `brandCaptured` (the one step that gates "are they set up").
- `showChecklist` = `!dismissed && !(all steps done)`.
- Pure and deterministic — no I/O. Heavily tested in `src/domain/__tests__/activation.test.ts`.

### 3. Read-model + persistence — `src/lib/activation/`

- `read-model.ts`: `getActivationState(orgId, workspaceId)` → reads the onboarding row
  (defaulting to all-false if absent) plus cheap existence checks:
  - `hasMedia` — `media_assets` count > 0 for org (best-effort; defaults false on error).
  - `hasCampaign` — `campaigns` count > 0 for workspace (best-effort).
  - `hasTeammate` — `workspace_memberships` active count > 1.
  Returns the `ActivationSignals` + the computed checklist from the domain fn.
- `persistence.ts`: `markBrandCaptured(orgId)`, `dismissActivation(orgId)` — upsert the row.
  Guarded by `isSupabaseAdminConfigured()`.

### 4. Shared safe website fetch — refactor `@/lib/brand-kit/website`

Extract the SSRF-guarded fetch+extract currently inlined in
`src/app/api/v1/arc/brand/analyze-website/route.ts` into
`fetchBrandSignalFromUrl(url): Promise<{ title, description, faviconUrl, text }>` (DNS
re-resolution, redirect re-validation, 5s timeout, 1MB cap). The Arc route becomes a thin
caller; the new operator action calls the same function. No behavior change to the Arc
route (its tests stay green).

### 5. `/start` route + brand-capture action

- `src/app/start/page.tsx` — server component:
  - `requireOperator()`; resolve `getCurrentWorkspaceContext()`. If auth mode isn't
    `supabase`, redirect `/`. If activation core is already done, redirect `/`.
  - Renders a focused single-step card: business name prefilled from the org/workspace, one
    "Your website" input, submit. Two-phase: submit URL → show the extracted preview (name,
    description, logo/favicon) for confirm/edit → confirm persists. (Implemented as the
    action returning a preview state via `useActionState`, mirroring `welcome-form.tsx`.)
- `src/app/start/actions.ts`:
  - `analyzeWebsiteAction(prev, formData)` — `requireOperator()`; validates URL; calls
    `fetchBrandSignalFromUrl`; returns `{ phase: "preview", signal }` or `{ error }`.
  - `confirmBrandAction(prev, formData)` — `requireOperator()` + admin-configured; builds a
    `BusinessProfile` (merge over any existing `getBusinessProfile(orgId)`: displayName,
    websiteUrl, description, faviconUrl, logoUrl, status) via `upsertBusinessProfile(orgId, …)`;
    `markBrandCaptured(orgId)`; `revalidatePath("/")`; redirect `/`.
- A "Skip for now" link → `dismissActivation` then `/` (owner can always finish later from
  the home checklist).

### 6. Home checklist — `src/app/_components/activation-checklist.tsx`

- Rendered on `/` (home) when `showChecklist`. A Panel (reuse `page-header` primitives)
  titled "Finish setting up {orgName}", listing the 4 steps with done/!done state and a
  primary deep link each:
  - Brand → `/start` (or `/library/brand` once captured)
  - Media → `/library`
  - Campaign → `/campaigns`
  - Team → `/settings` (invite form)
- A "Dismiss" affordance → `dismissActivation` server action + `revalidatePath("/")`.
- Reuses existing home data fetching; the checklist data comes from `getActivationState`.

### 7. Routing into first-run

- `src/app/onboarding/actions.ts::createWorkspaceAction` — on success, redirect to `/start`
  instead of `/` (new owners go straight into setup). Invited members keep going to
  `/welcome` → `/`; they see the home checklist but aren't force-routed.
- `/start` self-guards (redirects to `/` if core done or non-supabase mode), so it's safe to
  link/bookmark.

## Testing

- **Domain** (`activation.test.ts`): checklist computation — coreDone only on brand; show
  logic with dismissed / all-done; step done flags map from signals.
- **Read-model**: builds signals from row + existence checks; defaults to all-false when the
  row is absent and when existence queries error (mock the admin client).
- **Persistence**: `markBrandCaptured` / `dismissActivation` upsert the right columns.
- **`fetchBrandSignalFromUrl`**: re-point the existing analyze-website route tests at the
  extracted fn (or add focused tests); assert SSRF rejections still hold.
- **Actions**: `analyzeWebsiteAction` returns preview on success / error on bad URL;
  `confirmBrandAction` upserts profile + marks captured + redirects (mock the libs);
  both assert `requireOperator()` is enforced.
- **`/start` page**: redirects when core done / non-supabase.
- Full `pnpm test` + `npx tsc --noEmit` + scoped eslint.

## Safety & scope

- Additive: one new table, one new domain module, one wired lib, one route + actions, one
  home component, one redirect change, one extract-refactor. No outbound/publish action —
  brand capture writes only internal records. Approval posture intact.
- `org_onboarding_state` migration must be applied to prod manually.
- Existence checks are best-effort and never block render (default to "not done").
