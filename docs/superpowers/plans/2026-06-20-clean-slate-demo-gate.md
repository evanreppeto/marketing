# Clean Slate — Gate Demo Data + Enable Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A real, authenticated, empty workspace shows true empty states (no synthetic demo records), with demo data one env flag away; plus a runbook to enable supabase-auth registration in prod.

**Architecture:** One pure `isDemoDataEnabled()` flag (default off). Every read-model demo-fallback return — both the "Supabase unconfigured" branch and the "empty-but-live" branch — is wrapped so that when the flag is off it returns the real result (`unavailable` when truly unconfigured, or the real empty shape when live-but-empty) instead of a demo bundle. Part A (registration) is config/runbook, no code.

**Tech Stack:** TypeScript, Vitest, Next.js 16.

**Test command:** `pnpm test <path>`.

**Verified gate points (each read-model has two demo returns):**
- `crm/read-model.ts` — `buildDemoCrmBundle()` returned at the `demoBundleEmpty(data)` sites (~3).
- `campaigns/read-model.ts` — `buildDemoCampaignWorkspaceList(agentName)` at L449 (`!client && !isSupabaseAdminConfigured()`) and L527 (`!client && items.length === 0`).
- `performance/read-model.ts` — `buildDemoPerformanceReadModel(rangeDays)` at L191 (unconfigured) and L240 (all rows empty).
- `agent-operations/read-model.ts` — `buildDemoAgentOperationsDashboard()` at L385 (unconfigured) and L448 (tasks+agents empty).
- `knowledge-graph/graph.ts` — `demoGraph(filters)` at L67 (unconfigured) and the empty-result branch (`nodes.length === 0 && noFilters`).
- `personas/console.ts` — `DEMO_PERSONAS` at L95 (unconfigured) and L102 (`!data || data.length === 0`).
- `activity/read-model.ts` — `buildDemoActivity(query)` at L79 (unconfigured) and L137 (`merged.length === 0 && !hasActiveQuery(query)`).

Each file already imports `isSupabaseAdminConfigured` and defines its `unavailable`/empty shapes.

---

## File Structure
- `src/lib/demo/demo-mode.ts` (create) + `demo-mode.test.ts`
- 7 read-models above (modify) + their tests
- `docs/runbooks/enable-registration.md` (create — Part A runbook)

---

## Task 1: `isDemoDataEnabled()` flag

**Files:** Create `src/lib/demo/demo-mode.ts` + `demo-mode.test.ts`

- [ ] **Step 1: Test**
```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { isDemoDataEnabled } from "./demo-mode";
afterEach(() => vi.unstubAllEnvs());
describe("isDemoDataEnabled", () => {
  it("is true only when ARC_DEMO_DATA === '1'", () => { vi.stubEnv("ARC_DEMO_DATA", "1"); expect(isDemoDataEnabled()).toBe(true); });
  it("is false when unset", () => { vi.stubEnv("ARC_DEMO_DATA", ""); expect(isDemoDataEnabled()).toBe(false); });
  it("is false for other values", () => { vi.stubEnv("ARC_DEMO_DATA", "true"); expect(isDemoDataEnabled()).toBe(false); });
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement**
```typescript
/**
 * Demo fallbacks (synthetic CRM/campaign/brain/persona/activity records) are
 * OFF by default so real, authenticated workspaces show real (possibly empty)
 * data. Set ARC_DEMO_DATA=1 for sales/marketing demos or local preview.
 */
export function isDemoDataEnabled(): boolean {
  return process.env.ARC_DEMO_DATA === "1";
}
```
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git add src/lib/demo && git commit -m "feat(demo): isDemoDataEnabled flag (default off)"`

---

## The uniform gating pattern (apply in Tasks 2 & 3)

For EACH read-model, import the flag and wrap BOTH demo returns:

```typescript
import { isDemoDataEnabled } from "@/lib/demo/demo-mode";
```
- **Unconfigured branch** `if (!client && !isSupabaseAdminConfigured())`:
  `return isDemoDataEnabled() ? buildDemoX(...) : <REAL-UNCONFIGURED-RESULT>;`
  where `<REAL-UNCONFIGURED-RESULT>` is that read-model's existing honest result for "no DB": the `{ status: "unavailable", message: "…" }` shape for status-union read-models, or `[]` for list-returning ones (`personas`, `campaigns` workspace list).
- **Empty-but-live branch** (`rows.length === 0 …`):
  `if (isDemoDataEnabled()) return buildDemoX(...);` — and otherwise **fall through** to the existing code that builds the real (empty) shape. (Do NOT early-return demo when the flag is off.)

**Per-file `<REAL-UNCONFIGURED-RESULT>`:**
- `crm` → its `{ status: "unavailable", message }` (the bundle reader); when live-but-empty, return the real empty bundle (drop the `demoBundleEmpty` demo substitution under flag-off).
- `campaigns` (workspace list) → `[]`.
- `performance` → `{ status: "unavailable", message: "Performance data is unavailable." }` (matches its union).
- `agent-operations` → `{ status: "unavailable", message: "Agent operations are unavailable." }`.
- `knowledge-graph/graph` → `{ status: "unavailable", message: "Brain is unavailable." }` (matches `GraphResult`).
- `personas/console` → `[]`.
- `activity` → `{ status: "unavailable", message: "Activity is unavailable." }`.

> Use each file's EXISTING `unavailable` message text if it already defines one nearby; the above are fallbacks. Keep the genuine post-fetch error → `unavailable` paths unchanged (those are real errors, not demo).

---

## Task 2: Gate `crm`, `campaigns`, `performance`

**Files:** Modify `src/lib/{crm,campaigns,performance}/read-model.ts` + add/extend their tests.

- [ ] **Step 1: Tests** — for each read-model add two cases (mock the client + `vi.stubEnv("ARC_DEMO_DATA", …)`):
  - flag **off** + empty live read → real empty result (assert NO `demo-` ids / `isDemo` falsy / empty list).
  - flag **on** + empty live read → demo bundle (regression: today's behavior).
  (Mirror each file's existing test setup. For `performance`, assert `isDemo` is absent/false when off.)
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Apply the gating pattern** at every demo-return site in the three files (see lists above). Import `isDemoDataEnabled`.
- [ ] **Step 4: Run → PASS** (new + existing).
- [ ] **Step 5: Commit** — `git add src/lib/crm src/lib/campaigns src/lib/performance && git commit -m "feat(demo): gate crm/campaigns/performance demo fallbacks behind the flag"`

---

## Task 3: Gate `agent-operations`, `knowledge-graph/graph`, `personas`, `activity`

**Files:** Modify `src/lib/agent-operations/read-model.ts`, `src/lib/knowledge-graph/graph.ts`, `src/lib/personas/console.ts`, `src/lib/activity/read-model.ts` + tests.

- [ ] **Step 1: Tests** — same two cases per read-model (flag off + empty → real empty; flag on + empty → demo). For `graph.ts`: flag off + unconfigured → `{status:"unavailable"}` (not `demoGraph`); flag off + empty live → live empty graph. For `personas`: flag off + empty → `[]`.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Apply the gating pattern** at every demo-return site in the four files. Note `knowledge-graph/graph.ts` feeds `getBrainGraph`, which `getRecallMemory` uses — gating is safe (recall already returns `[]` on non-live graph; an empty live graph yields `[]` candidates, same as today's empty brain).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git add src/lib/agent-operations src/lib/knowledge-graph src/lib/personas src/lib/activity && git commit -m "feat(demo): gate agent-ops/brain/personas/activity demo fallbacks behind the flag"`

---

## Task 4: Empty-state audit + Part A runbook + sweep/build

- [ ] **Step 1: Empty-state audit** — for each gated page (`/crm`, `/campaigns`, performance/analytics, `/agent-operations`, `/brain` or `/library/brand`, `/personas`/persona-intelligence, activity/`/approvals`), confirm a real empty read renders an existing empty state (reuse `EmptyState` from `page-header.tsx`) rather than crashing on assumed demo data. Add a minimal `EmptyState` only where one is missing. Do NOT redesign. (Local check: run with `ARC_DEMO_DATA` unset; pages backed by an unreachable local Supabase will show `unavailable`, which is the correct unconfigured result — that's expected locally.)
- [ ] **Step 2: Part A runbook** — create `docs/runbooks/enable-registration.md`:
  - Set prod env (Vercel, Production): `ARC_AUTH_MODE=supabase`; confirm `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `NEXT_PUBLIC_SUPABASE_URL`. Redeploy.
  - Register: `/sign-up` → account + "Big Shoulders Restoration" workspace (workspaceIntent=create) → confirm email → `/auth/callback` → `/onboarding` → empty workspace.
  - Set `ARC_DEMO_DATA` **unset** (or `0`) in prod so demo stays off.
  - Operator-gate note: if `OPERATOR_ACCESS_TOKEN` blocks the authenticated session, unset it (supabase auth supersedes it).
- [ ] **Step 3: Tests + build** — `pnpm test src/lib/demo src/lib/crm src/lib/campaigns src/lib/performance src/lib/agent-operations src/lib/knowledge-graph src/lib/personas src/lib/activity` → pass; `pnpm build` → succeeds.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "docs(demo): enable-registration runbook + empty-state fixups"`

---

## Self-Review (plan author)

- **Spec coverage:** flag → T1; all 7 read-model demo-fallback sites gated → T2+T3; empty-state UX + Part A runbook + build → T4. Part B (code) fully covered; Part A is the runbook (config, no code) per spec.
- **Placeholder scan:** none. `<REAL-UNCONFIGURED-RESULT>` is specified per file; the pattern is explicit (wrap unconfigured return; gate empty-live early-return, else fall through).
- **Consistency:** one helper `isDemoDataEnabled()` imported identically everywhere; gating wraps BOTH demo triggers in every file; genuine post-fetch-error `unavailable` paths untouched.
- **Safety / regression:** default-off changes prod behavior (empty workspaces → empty states — the goal); flag-on reproduces today's demo exactly (regression-tested per read-model). No prod data deleted. `getRecallMemory` safe (empty graph → `[]`, as today). Build is the typecheck gate.
- **Out of scope honored:** no seeded-row deletion, no registration rebuild.
