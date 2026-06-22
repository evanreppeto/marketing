# Clean Slate for Real Use — Enable Registration + Gate Demo Data — Design

**Date:** 2026-06-20
**Status:** Approved (design) — pending spec review
**Scope:** Let Evan register a real account + "Big Shoulders Restoration" workspace and use the app with real data, by (A) enabling supabase auth mode in prod [config] and (B) gating the code-level demo-data fallbacks behind a single flag (default off) so a fresh workspace shows true empty states instead of synthetic records. No prod data is deleted (fresh-workspace path).

## Problem

Two things block real use today:
1. **Registration is built but inactive in prod.** `/sign-up` → Supabase auth user (with org/workspace intent) → `/onboarding` → `createWorkspaceForUser` provisions org + workspace + memberships. But `getAuthMode()` only returns `"supabase"` when `ARC_AUTH_MODE=supabase` (or `AUTH_MODE`) **and** the anon key is configured; otherwise sign-up returns `error=config`. So it's a prod env-config gap, not a missing feature.
2. **Demo fallbacks bleed into real workspaces.** Each read-model independently returns synthetic data when its real read is empty (e.g. `crm/read-model.ts` "Demo fallback bundle" — Northside Plumbing, etc.). A newly-provisioned empty workspace would therefore *show* fake CRM/campaign/brain/persona/activity records. There is **no central demo flag** today.

## What exists (reuse, don't rebuild)

- **Auth/onboarding (real):** `/api/auth/sign-up`, `/onboarding`, `src/lib/auth/{auth-mode,sign-up-intent,user-provisioning,workspace-onboarding}.ts`. `createWorkspaceForUser` creates org + workspace + memberships + defaults. Hardened by PR #162.
- `getAuthMode()` (`src/lib/auth/auth-mode.ts`): `requestedMode==="supabase" && isSupabaseAuthConfigured()` → `"supabase"`.
- **Demo-fallback sites** (each returns synthetic data on empty/unconfigured): `src/lib/crm/read-model.ts`, `campaigns/read-model.ts`, `performance/read-model.ts` (+ `campaign-demo-detail.ts`), `agent-operations/read-model.ts` (+ `demo.ts`, `task-demo-detail.ts`), `knowledge-graph/graph.ts`, `personas/console.ts`, `activity/read-model.ts`.

## Part A — Enable real registration (config + verify; operator steps, no code expected)

1. In Vercel (prod `marketing`, Production scope): set **`ARC_AUTH_MODE=supabase`**; confirm **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** + `NEXT_PUBLIC_SUPABASE_URL` are set. Redeploy.
2. Verify end-to-end: `/sign-up` → account + "Big Shoulders Restoration" workspace (workspaceIntent=create) → email confirm → `/auth/callback` → `/onboarding` → land in an **empty** workspace scoped to the new org.
3. **Operator-gate coexistence:** if the legacy `OPERATOR_ACCESS_TOKEN` gate (`src/proxy.ts`) blocks the authenticated session, unset it in prod (supabase auth supersedes it). Confirmed during the smoke test; only becomes a code task if the proxy actively conflicts (then: ensure `proxy.ts` defers to supabase mode).

This part ships as a short **runbook** in the spec/PR, not code — unless step 3 surfaces a real conflict.

## Part B — Gate demo data (the code build)

### b1. Central gate — `src/lib/demo/demo-mode.ts` (new)
```ts
/** True only when demo fallbacks are explicitly enabled (sales/marketing demos,
 *  local preview). Default OFF so real, authenticated workspaces show real
 *  (possibly empty) data. */
export function isDemoDataEnabled(): boolean {
  return process.env.ARC_DEMO_DATA === "1";
}
```
Pure, env-driven, trivially testable.

### b2. Apply at every demo-fallback site
At each site listed above, guard the synthetic-data branch with `isDemoDataEnabled()`. When the flag is **off**, the read-model returns the **real** result — an empty list / empty-but-live shape — instead of the demo bundle. Preserve the existing "Supabase unconfigured" handling separately (that's the genuine `unavailable` status, not demo); demo only substitutes *content*, and only when the flag is on.

Behavior matrix per read-model:
| flag | real read | result |
|------|-----------|--------|
| off  | empty     | **empty state** (real) |
| off  | has rows  | real rows |
| on   | empty     | demo bundle (today's behavior) |
| on   | has rows  | real rows |

The demo *detail* helpers (`isDemoCampaignAnalyticsId`/`campaign-demo-detail`, `task-demo-detail`) only fire for demo-prefixed ids; with the flag off the read-models must not route to them. Gate their call sites too.

### b3. Empty-state UX
Most pages already have empty-state components (`EmptyState` in `page-header.tsx`); when read-models stop returning demo, those render. Where a page assumed non-empty demo data and lacks an empty state, add a minimal one (audited during planning). No redesign — reuse existing primitives.

## Data flow

```
authenticated request → getCurrentWorkspaceContext() resolves the user's real workspace
  → read-model query (org-scoped) → empty for a fresh workspace
  → isDemoDataEnabled() === false → return empty (real empty state)   [was: demo bundle]
(ARC_DEMO_DATA=1 → demo bundle returns, for sales/marketing/local preview)
```

## Testing

- **`isDemoDataEnabled`**: true only when `ARC_DEMO_DATA==="1"`; false otherwise (unset/`"0"`/other).
- **Per gated read-model**: flag-off + empty real read → empty result (no demo records); flag-on + empty → demo bundle (regression guard); rows present → real rows regardless. Mock the read + the flag (`vi.stubEnv`).
- Full `pnpm build`.

## Safety & scope

- **No prod data deleted** (fresh-workspace path; old seeded demo org left unused).
- **Reversible**: demo is one env flag away (`ARC_DEMO_DATA=1`) for sales/marketing/local preview.
- Default-off means prod real workspaces are clean; no behavior change for anyone who sets the flag.
- Part A is config/runbook; the only data mutation is Evan creating his own workspace via the existing flow.

## Out of scope

- Deleting seeded rows from the old demo org (deferred; can clean later).
- Rebuilding registration/onboarding (exists).
- Multi-tenant scheduled-scan fan-out and other productization (separate).
- Marketing/landing public pages (unaffected; they can opt into the flag if they rely on demo content).
