# Proactive Arc — Scheduled Autonomy (Slice 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A daily Vercel Cron hits a `CRON_SECRET`-gated route that — when enabled and not recently run — reuses Slice 1's `enqueueOpportunityScanTask` to scan for opportunities unprompted.

**Architecture:** `vercel.json` cron → `GET /api/cron/opportunity-scan` (auth → enable flag → configured → frequency guard → enqueue). A `hasRecentOpportunityScan` helper does the guard. Off by default. No schema change.

**Tech Stack:** Next.js 16 route handler, TypeScript, Vitest, Vercel Cron.

**Test command:** `pnpm test <path>`.

**Verified facts:**
- `enqueueOpportunityScanTask({ operator: string }): Promise<{ ok: boolean; error?: string }>` (`src/lib/opportunities/enqueue.ts`) — resolves the default tenant session-lessly + notifies the runner.
- `getCurrentAgentTaskTenantFields(): Promise<{ org_id, workspace_id }>` (`src/lib/agent-tasks/scope.ts`) — works without a session (default-org fallback).
- `getSupabaseAdminClient()` / `isSupabaseAdminConfigured()` (`@/lib/supabase/server`).
- `agent_tasks` rows have `org_id`, `workspace_id`, `task_type`, `created_at`. Scan tasks use `task_type:"arc_opportunity_scan"`.
- No `vercel.json` exists yet.

---

## File Structure
- `src/lib/opportunities/recent-scan.ts` (create) + `recent-scan.test.ts`
- `src/app/api/cron/opportunity-scan/route.ts` (create) + `route.test.ts`
- `vercel.json` (create), `.env.example` (modify)

---

## Task 1: `hasRecentOpportunityScan` guard

**Files:** Create `src/lib/opportunities/recent-scan.ts` + `recent-scan.test.ts`

- [ ] **Step 1: Write the failing test** (mirror the repo's Supabase-mock helpers — `src/lib/repos/__tests__/test-helpers` `createSupabaseQueryMock`, as other lib tests use)

```typescript
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agent-tasks/scope", () => ({ getCurrentAgentTaskTenantFields: vi.fn(async () => ({ org_id: "o1", workspace_id: "w1" })) }));
vi.mock("@/lib/supabase/server", async () => ({
  isSupabaseAdminConfigured: () => true,
  getSupabaseAdminClient: () => globalThis.__client,
}));
import { hasRecentOpportunityScan } from "./recent-scan";

// Minimal chainable stub: .from().select().eq().eq().eq().gte().limit() -> { data, error }
function client(rows: unknown[], error: unknown = null) {
  const q: Record<string, unknown> = {};
  for (const m of ["from", "select", "eq", "gte", "order"]) q[m] = () => q;
  q.limit = async () => ({ data: rows, error });
  return q;
}

describe("hasRecentOpportunityScan", () => {
  it("returns true when a recent scan task exists", async () => {
    (globalThis as Record<string, unknown>).__client = client([{ id: "t1" }]);
    expect(await hasRecentOpportunityScan(20)).toBe(true);
  });
  it("returns false when none exist", async () => {
    (globalThis as Record<string, unknown>).__client = client([]);
    expect(await hasRecentOpportunityScan(20)).toBe(false);
  });
  it("returns false (fail-open) on a query error", async () => {
    (globalThis as Record<string, unknown>).__client = client([], { message: "boom" });
    expect(await hasRecentOpportunityScan(20)).toBe(false);
  });
});
```
> If the repo has a richer shared Supabase mock (`createSupabaseQueryMock`), prefer it and adapt — the assertions (true / false / false-on-error) are what matter.

- [ ] **Step 2: Run → FAIL** (`pnpm test src/lib/opportunities/recent-scan.test.ts`).

- [ ] **Step 3: Implement `recent-scan.ts`**

```typescript
import { type SupabaseClient } from "@supabase/supabase-js";

import { getCurrentAgentTaskTenantFields } from "@/lib/agent-tasks/scope";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * True if an `arc_opportunity_scan` agent task was created in the last `withinHours`
 * for the current (default) tenant. Used to skip a scheduled scan when one already
 * ran recently (covers double-fires + a recent manual scan). Fail-open (returns
 * false) when unconfigured or on read error — the upsert dedup still bounds flooding.
 */
export async function hasRecentOpportunityScan(
  withinHours: number,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<boolean> {
  if (!isSupabaseAdminConfigured()) return false;
  try {
    const tenant = await getCurrentAgentTaskTenantFields();
    const since = new Date(Date.now() - withinHours * 60 * 60 * 1000).toISOString();
    const { data, error } = await client
      .from("agent_tasks")
      .select("id")
      .eq("org_id", tenant.org_id)
      .eq("workspace_id", tenant.workspace_id)
      .eq("task_type", "arc_opportunity_scan")
      .gte("created_at", since)
      .limit(1);
    if (error) return false;
    return (data ?? []).length > 0;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git add src/lib/opportunities/recent-scan.ts src/lib/opportunities/recent-scan.test.ts && git commit -m "feat(opportunities): hasRecentOpportunityScan guard"`

---

## Task 2: Cron route `GET /api/cron/opportunity-scan`

**Files:** Create `src/app/api/cron/opportunity-scan/route.ts` + `route.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/opportunities/enqueue", () => ({ enqueueOpportunityScanTask: vi.fn() }));
vi.mock("@/lib/opportunities/recent-scan", () => ({ hasRecentOpportunityScan: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ isSupabaseAdminConfigured: vi.fn(() => true) }));
import { enqueueOpportunityScanTask } from "@/lib/opportunities/enqueue";
import { hasRecentOpportunityScan } from "@/lib/opportunities/recent-scan";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { GET } from "./route";

const enqueueMock = vi.mocked(enqueueOpportunityScanTask);
const recentMock = vi.mocked(hasRecentOpportunityScan);
const configuredMock = vi.mocked(isSupabaseAdminConfigured);
function req(auth?: string) { return new Request("http://localhost/api/cron/opportunity-scan", { headers: { ...(auth ? { authorization: auth } : {}) } }); }
const env = { CRON_SECRET: process.env.CRON_SECRET, OPPORTUNITY_SCAN_CRON_ENABLED: process.env.OPPORTUNITY_SCAN_CRON_ENABLED };
beforeEach(() => {
  enqueueMock.mockReset(); recentMock.mockReset(); configuredMock.mockReset();
  enqueueMock.mockResolvedValue({ ok: true }); recentMock.mockResolvedValue(false); configuredMock.mockReturnValue(true);
  process.env.CRON_SECRET = "s3cret"; process.env.OPPORTUNITY_SCAN_CRON_ENABLED = "1";
});
afterEach(() => { for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

describe("GET /api/cron/opportunity-scan", () => {
  it("401s without the cron secret and never enqueues", async () => {
    expect((await GET(req("Bearer wrong"))).status).toBe(401);
    expect(enqueueMock).not.toHaveBeenCalled();
  });
  it("401s when CRON_SECRET is unset (fail closed)", async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(req("Bearer s3cret"))).status).toBe(401);
  });
  it("skips (no enqueue) when the flag is off", async () => {
    process.env.OPPORTUNITY_SCAN_CRON_ENABLED = "0";
    expect(await (await GET(req("Bearer s3cret"))).json()).toMatchObject({ skipped: "disabled" });
    expect(enqueueMock).not.toHaveBeenCalled();
  });
  it("skips when a scan ran recently", async () => {
    recentMock.mockResolvedValue(true);
    expect(await (await GET(req("Bearer s3cret"))).json()).toMatchObject({ skipped: "recent" });
    expect(enqueueMock).not.toHaveBeenCalled();
  });
  it("enqueues when authorized + enabled + configured + not recent", async () => {
    const res = await GET(req("Bearer s3cret"));
    expect(await res.json()).toMatchObject({ ok: true, queued: true });
    expect(enqueueMock).toHaveBeenCalledWith({ operator: "Scheduled scan" });
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Write the route** (`route.ts`)

```typescript
import { NextResponse } from "next/server";

import { enqueueOpportunityScanTask } from "@/lib/opportunities/enqueue";
import { hasRecentOpportunityScan } from "@/lib/opportunities/recent-scan";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const RECENT_HOURS = 20;

/**
 * Daily Vercel Cron entry. Reuses the Slice 1 opportunity-scan enqueue when:
 * authorized (CRON_SECRET), enabled (OPPORTUNITY_SCAN_CRON_ENABLED=1), Supabase
 * configured, and no scan ran in the last RECENT_HOURS. Off by default; fail-closed.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorized = Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
  if (!authorized) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  if (process.env.OPPORTUNITY_SCAN_CRON_ENABLED !== "1") {
    return NextResponse.json({ ok: true, skipped: "disabled" });
  }
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ ok: true, skipped: "not_configured" });
  }
  if (await hasRecentOpportunityScan(RECENT_HOURS)) {
    return NextResponse.json({ ok: true, skipped: "recent" });
  }

  const result = await enqueueOpportunityScanTask({ operator: "Scheduled scan" });
  return NextResponse.json({ ok: result.ok, queued: result.ok, ...(result.error ? { error: result.error } : {}) });
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git add src/app/api/cron/opportunity-scan && git commit -m "feat(arc): CRON_SECRET-gated scheduled opportunity-scan route"`

---

## Task 3: `vercel.json` cron + env docs + build

**Files:** Create `vercel.json`; modify `.env.example`

- [ ] **Step 1: Create `vercel.json`**

```json
{
  "crons": [
    { "path": "/api/cron/opportunity-scan", "schedule": "0 13 * * *" }
  ]
}
```
> Daily at 13:00 UTC. If a `vercel.json` is later needed for other settings, merge this `crons` array in rather than overwriting.

- [ ] **Step 2: Document env in `.env.example`** — append:
```
# Scheduled opportunity scan (proactive Arc, slice 2)
# CRON_SECRET is set in Vercel and auto-sent by Vercel Cron as `Authorization: Bearer <CRON_SECRET>`.
# The cron route requires it (fail-closed). Leave unset locally.
CRON_SECRET=
# Set to 1 in prod to enable the daily scheduled scan (off by default).
OPPORTUNITY_SCAN_CRON_ENABLED=
```

- [ ] **Step 3: Sweep + build**
- `pnpm test src/lib/opportunities/recent-scan.test.ts src/app/api/cron/opportunity-scan` → pass.
- `pnpm build` → succeeds, and `/api/cron/opportunity-scan` appears in the route manifest. (`pnpm install` first if needed; remove a stale `.next` if a phantom validator error about a deleted page appears — known issue, unrelated.)

- [ ] **Step 4: Commit** — `git add vercel.json .env.example && git commit -m "feat(arc): daily vercel cron for opportunity scan + env docs"`

---

## Self-Review (plan author)

- **Spec coverage:** frequency guard → Task 1; route (auth/flag/configured/recent/enqueue) → Task 2; cron config + env docs + build → Task 3. All spec sections covered.
- **Placeholder scan:** none. The Task 1 test notes "prefer the repo's shared Supabase mock if richer" — an adaptation hint, not a gap; the route test is fully concrete.
- **Type consistency:** `enqueueOpportunityScanTask({ operator })` called with the exact `{ operator: "Scheduled scan" }` shape; its `{ ok, error? }` return mapped to `{ ok, queued, error? }`. `hasRecentOpportunityScan(hours, client?)` signature matches its call. Route uses `NextResponse` (a cron route, not an `/api/v1/arc` route — no `arcGuard`).
- **Safety:** fail-closed auth (unset secret → 401); off by default (flag); frequency guard; reuses Slice 1 so everything stays `pending` + deduped; no schema change. App-only (Vercel) — no runner change.
