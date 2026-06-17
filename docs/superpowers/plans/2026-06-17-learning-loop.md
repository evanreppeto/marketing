# Performance Learning Loop (Arc-facing v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Aggregate already-ingested `campaign_results` into "what's working by slice" (persona/channel/asset_type) and give Arc a `read_performance` tool so it cites real numbers in recommendations/drafts and records learnings to the brain. No new UI, no new ingest.

**Architecture:** Pure `aggregateBySlice` in `src/domain/` → `getPerformanceBySlice` read-model in `src/lib/performance/` (joins `campaign_results` → `campaigns.persona` + `campaign_assets.asset_type/channel`) → bearer-gated `GET /api/v1/arc/performance` → runner `read_performance` read tool (all modes) + prompt guidance.

**Tech Stack:** Next.js route + Supabase (app); TypeScript + Claude Agent SDK + Vitest (runner).

Spec: `docs/superpowers/specs/2026-06-17-learning-loop-design.md`. Reuses the wired `campaign_results` table/ingest, `src/lib/performance/read-model.ts` (mirror its query/scoping), and the runner read-tool pattern (`src/tools/campaigns.ts` / `brain.ts`).

---

## Task 1: Pure slice aggregation

**Files:** Create `src/domain/performance-slicing.ts`, `src/domain/__tests__/performance-slicing.test.ts`; modify `src/domain/index.ts`.

- [ ] **Step 1: Failing test** `src/domain/__tests__/performance-slicing.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { aggregateBySlice, type ResultRow } from "../performance-slicing";

const rows: ResultRow[] = [
  { persona: "persona_landlord", channel: "email", assetType: "email", impressions: 1000, clicks: 50, leads: 10, jobs: 3, wonRevenueCents: 900000, spendCents: 300000 },
  { persona: "persona_landlord", channel: "email", assetType: "email", impressions: 0, clicks: 0, leads: 0, jobs: 1, wonRevenueCents: 300000, spendCents: 0 },
  { persona: "persona_landlord", channel: "sms", assetType: "sms", impressions: 0, clicks: 0, leads: 2, jobs: 0, wonRevenueCents: 0, spendCents: 50000 },
];

describe("aggregateBySlice", () => {
  it("groups by channel and sums counters with derived metrics", () => {
    const out = aggregateBySlice(rows, "channel");
    const email = out.find((s) => s.key === "email")!;
    expect(email.jobs).toBe(4);
    expect(email.leads).toBe(10);
    expect(email.wonRevenueCents).toBe(1200000);
    expect(email.spendCents).toBe(300000);
    expect(email.roas).toBeCloseTo(4); // 1,200,000 / 300,000
    expect(email.sampleSize).toBe(2);
  });

  it("handles divide-by-zero (no spend/leads/impressions) as null", () => {
    const out = aggregateBySlice(rows, "channel");
    const sms = out.find((s) => s.key === "sms")!;
    expect(sms.roas).toBeNull();      // spend 50000 but won 0 -> 0, not null; see note
    expect(sms.cpl).toBeCloseTo(250); // 50000 / 2 leads (cents)
    expect(out.find((s) => s.key === "email")!.cpl).toBeCloseTo(30000); // 300000/10
  });

  it("sorts slices by jobs desc then roas desc", () => {
    const out = aggregateBySlice(rows, "channel");
    expect(out[0].key).toBe("email"); // 4 jobs > 0 jobs
  });

  it("groups by persona", () => {
    const out = aggregateBySlice(rows, "persona");
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe("persona_landlord");
    expect(out[0].jobs).toBe(4);
  });
});
```
(Note: define `roas` as `wonRevenueCents/spendCents` when `spendCents>0` else `null`; `0` revenue with spend>0 → `0`. Adjust the sms expectation: spend 50000, won 0 → roas `0`. Fix the test to `expect(sms.roas).toBe(0)` when writing — make the implementation + test agree.)

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `src/domain/performance-slicing.ts`:
```ts
/** Pure aggregation of campaign results into "what's working" slices. No I/O. */
export type SliceDimension = "persona" | "channel" | "asset_type";

export type ResultRow = {
  persona: string | null;
  channel: string | null;
  assetType: string | null;
  impressions: number;
  clicks: number;
  leads: number;
  jobs: number;
  wonRevenueCents: number;
  spendCents: number;
};

export type SliceStat = {
  key: string;
  impressions: number;
  clicks: number;
  leads: number;
  jobs: number;
  wonRevenueCents: number;
  spendCents: number;
  /** won_revenue / spend; null when no spend. */
  roas: number | null;
  /** cost per lead in cents; null when no leads. */
  cpl: number | null;
  /** clicks / impressions; null when no impressions. */
  ctr: number | null;
  /** number of result rows in this slice. */
  sampleSize: number;
};

function keyFor(row: ResultRow, dim: SliceDimension): string {
  const v = dim === "persona" ? row.persona : dim === "channel" ? row.channel : row.assetType;
  return v ?? "unknown";
}

export function aggregateBySlice(rows: ResultRow[], dimension: SliceDimension): SliceStat[] {
  const map = new Map<string, SliceStat>();
  for (const row of rows) {
    const key = keyFor(row, dimension);
    const s =
      map.get(key) ??
      { key, impressions: 0, clicks: 0, leads: 0, jobs: 0, wonRevenueCents: 0, spendCents: 0, roas: null, cpl: null, ctr: null, sampleSize: 0 };
    s.impressions += row.impressions;
    s.clicks += row.clicks;
    s.leads += row.leads;
    s.jobs += row.jobs;
    s.wonRevenueCents += row.wonRevenueCents;
    s.spendCents += row.spendCents;
    s.sampleSize += 1;
    map.set(key, s);
  }
  const out = [...map.values()].map((s) => ({
    ...s,
    roas: s.spendCents > 0 ? s.wonRevenueCents / s.spendCents : null,
    cpl: s.leads > 0 ? s.spendCents / s.leads : null,
    ctr: s.impressions > 0 ? s.clicks / s.impressions : null,
  }));
  out.sort((a, b) => b.jobs - a.jobs || (b.roas ?? 0) - (a.roas ?? 0));
  return out;
}
```
- [ ] **Step 4: Run → PASS** (reconcile the sms `roas` expectation to `0`). Add `export * from "./performance-slicing";` to `src/domain/index.ts`.
- [ ] **Step 5: tsc + commit** — `git add src/domain/performance-slicing.ts src/domain/__tests__/performance-slicing.test.ts src/domain/index.ts && git commit -m "feat(domain): pure performance slice aggregation"`

---

## Task 2: Slice read-model

**Files:** Create `src/lib/performance/slice-read-model.ts`.

- [ ] **Step 1: Read `src/lib/performance/read-model.ts`** to mirror its exact Supabase query style, client acquisition (`getSupabaseAdminClient`/`isSupabaseAdminConfigured`), and scoping. Then implement:
```ts
import { type SupabaseClient } from "@supabase/supabase-js";

import { aggregateBySlice, type ResultRow, type SliceDimension, type SliceStat } from "@/domain";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type SliceFilter = { dimension?: SliceDimension; days?: number; persona?: string; channel?: string };

/**
 * Aggregate campaign_results (joined to campaign persona + asset type/channel)
 * into "what's working" slices. Empty when Supabase isn't configured.
 */
export async function getPerformanceBySlice(
  filter: SliceFilter = {},
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<{ dimension: SliceDimension; slices: SliceStat[] }> {
  const dimension: SliceDimension = filter.dimension ?? "persona";
  if (!isSupabaseAdminConfigured()) return { dimension, slices: [] };

  const days = filter.days ?? 90;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10); // YYYY-MM-DD

  // Join results -> campaign (persona) + asset (type/channel). Mirror the select
  // style of read-model.ts; embedded selects require the FK relationships present
  // in the schema (campaign_results.campaign_id, campaign_asset_id).
  const { data, error } = await client
    .from("campaign_results")
    .select(
      "channel, impressions, clicks, leads, jobs, won_revenue_cents, spend_cents, period_end, campaigns(persona), campaign_assets(asset_type, channel)",
    )
    .gte("period_end", since);
  if (error || !data) return { dimension, slices: [] };

  const rows: ResultRow[] = (data as unknown as Array<Record<string, unknown>>).map((r) => {
    const campaign = (r.campaigns ?? {}) as { persona?: string | null };
    const asset = (r.campaign_assets ?? {}) as { asset_type?: string | null; channel?: string | null };
    return {
      persona: campaign.persona ?? null,
      channel: (r.channel as string | null) ?? asset.channel ?? null,
      assetType: asset.asset_type ?? null,
      impressions: Number(r.impressions ?? 0),
      clicks: Number(r.clicks ?? 0),
      leads: Number(r.leads ?? 0),
      jobs: Number(r.jobs ?? 0),
      wonRevenueCents: Number(r.won_revenue_cents ?? 0),
      spendCents: Number(r.spend_cents ?? 0),
    };
  });

  const filtered = rows.filter(
    (row) => (!filter.persona || row.persona === filter.persona) && (!filter.channel || row.channel === filter.channel),
  );
  return { dimension, slices: aggregateBySlice(filtered, dimension) };
}
```
> Plan-stage: confirm the PostgREST embedded-select names (`campaigns(...)`, `campaign_assets(...)`) resolve from the FK names in the schema; if the embed alias differs, adjust per how `read-model.ts` embeds related tables. If embeds aren't available, fall back to fetching campaign/asset maps separately and joining in code.

- [ ] **Step 2: tsc + commit** — `git add src/lib/performance/slice-read-model.ts && git commit -m "feat(performance): getPerformanceBySlice read-model"`

---

## Task 3: `GET /api/v1/arc/performance`

**Files:** Create `src/app/api/v1/arc/performance/route.ts` (+ `route.test.ts`).

- [ ] **Step 1: Route:**
```ts
import { NextResponse } from "next/server";

import { guard } from "@/app/api/v1/arc/_lib/http";
import { getPerformanceBySlice } from "@/lib/performance/slice-read-model";
import type { SliceDimension } from "@/domain";

const DIMENSIONS: SliceDimension[] = ["persona", "channel", "asset_type"];

/** What's-working slices for Arc. Bearer-gated, read-only. */
export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  const url = new URL(request.url);
  const dimRaw = url.searchParams.get("dimension");
  const dimension: SliceDimension = DIMENSIONS.includes(dimRaw as SliceDimension) ? (dimRaw as SliceDimension) : "persona";
  const days = Number(url.searchParams.get("days")) || 90;
  const persona = url.searchParams.get("persona") ?? undefined;
  const channel = url.searchParams.get("channel") ?? undefined;
  const result = await getPerformanceBySlice({ dimension, days, persona, channel });
  return NextResponse.json({ ok: true, status: "ok", dimension: result.dimension, slices: result.slices });
}
```
> Confirm `guard` works for GET (it reads the bearer header + Supabase). If `guard` is POST-oriented, use `bearerGuard` from `_lib/http` instead. Read `_lib/http.ts` to pick the right guard for a GET.

- [ ] **Step 2: Test** `route.test.ts` — mock `@/lib/performance/slice-read-model` `getPerformanceBySlice` → `{ dimension:"persona", slices:[{key:"persona_landlord", jobs:4, roas:4, ...}] }`; env+bearer like other arc routes. Assert: 401 without token; 200 with token returns `{ ok:true, dimension:"persona", slices:[...] }`; `?dimension=channel` passes `channel` through to the read-model.

- [ ] **Step 3: Run + commit** — `pnpm test src/app/api/v1/arc/performance` → PASS; `git add src/app/api/v1/arc/performance && git commit -m "feat(arc-api): GET /api/v1/arc/performance (what's-working slices)"`

---

## Task 4: Runner `read_performance` tool + prompt

**Files:** Create `apps/arc-runner/src/tools/performance.ts` (+ `performance.test.ts`); modify `apps/arc-runner/src/tools/index.ts`, `index.test.ts`, `prompt.ts`.

- [ ] **Step 1: Read an existing runner read tool** (`apps/arc-runner/src/tools/campaigns.ts` or `brain.ts`) to match the `tool(...)` + `apiGet` + `runTool`/`textResult` + `StepFn` shape. Then create `apps/arc-runner/src/tools/performance.ts`:
```ts
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import type { ArcClient } from "../arc-client";
import { runTool, type StepFn } from "./helpers";

/** Read-only performance signals so Arc can cite what's working. */
export function performanceReadTools(client: ArcClient, step: StepFn) {
  const readPerformance = tool(
    "read_performance",
    "Read real campaign performance ('what's working') aggregated by persona, channel, or asset_type — win/job counts, leads, ROAS, CPL, CTR, sample size. Call this BEFORE recommending a next iteration or drafting for a persona/channel you have history on, and cite the numbers. Never invent metrics; if it returns nothing, say there's no data yet.",
    {
      dimension: z.string().optional().describe("persona | channel | asset_type (default persona)"),
      days: z.number().optional().describe("lookback window in days (default 90)"),
      persona: z.string().optional(),
      channel: z.string().optional(),
    },
    async (args) =>
      runTool(step, "Reading performance", () =>
        client.apiGet("/api/v1/arc/performance", {
          dimension: args.dimension,
          days: args.days,
          persona: args.persona,
          channel: args.channel,
        }),
      ),
  );
  return [readPerformance];
}
```
(If `runTool`'s signature differs, mirror exactly how `campaignReadTools` wraps an `apiGet`.)

- [ ] **Step 2: Wire into `readTools`** in `apps/arc-runner/src/tools/index.ts`: import `performanceReadTools` and spread `...performanceReadTools(client, step)` into the `readTools(...)` return array (so it's available in every mode).

- [ ] **Step 3: index.test.ts** — add `"read_performance"` to the `READ` array.

- [ ] **Step 4: performance.test.ts** — stub `client.apiGet` to resolve `{ ok:true, dimension:"persona", slices:[{key:"persona_landlord", jobs:4}] }`; call the tool handler; assert it returns text containing `persona_landlord`/`4` (mirror the existing read-tool tests' loose-typed handler call).

- [ ] **Step 5: prompt.ts** — after the Drafting/Make-replies-rich guidance, add a Performance line: before proposing a next iteration or drafting for a persona/channel with history, call `read_performance` and cite the numbers; record durable wins to the brain (`record_brain_note`) so they compound; never fabricate metrics.

- [ ] **Step 6: typecheck + tests + commit** — `pnpm --filter @bsr/arc-runner typecheck && pnpm --filter @bsr/arc-runner test` → PASS; `git add apps/arc-runner/src && git commit -m "feat(arc-runner): read_performance tool + learning-loop prompt guidance"`

---

## Task 5: Manual acceptance
- [ ] Seed a few `campaign_results` rows (or POST to `/api/v1/campaigns/results`).
- [ ] Ask Arc (any mode): "What's working for landlords?" / "Should I repeat last month's email?" → Arc calls `read_performance`, cites real ROAS/jobs/leads by slice.
- [ ] In act/draft, after citing, Arc records a learning to the brain (visible in the knowledge graph) and proposes the next iteration.
- [ ] No data → Arc says there's no performance data yet (doesn't invent).

---

## Self-review notes
- **Spec coverage:** pure aggregation (T1) + read-model (T2) + endpoint (T3) + runner read tool & prompt (T4) + manual (T5). Closes the loop Arc-side; no new UI/ingest (reuses `campaign_results`).
- **Type/name consistency:** `ResultRow`/`SliceDimension`/`SliceStat` (domain) → `getPerformanceBySlice` (read-model) → endpoint slices → `read_performance` (runner). `aggregateBySlice` is pure + tested.
- **Reuse:** mirrors `src/lib/performance/read-model.ts` query/scoping, the arc `_lib/http` guard, and the runner read-tool pattern; learnings recorded via the existing brain (`record_brain_note`).
- **Build-time confirms:** the PostgREST embed for campaigns/assets (fall back to separate fetch+join if needed); correct GET guard (`guard` vs `bearerGuard`); `runTool` signature.
- **Deferred:** outcomes-table join for booked-jobs/revenue by persona (v1 uses `campaign_results`); a "what's working" UI; angle-level slicing (angles live in the brain).
