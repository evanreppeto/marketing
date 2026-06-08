# Competitor Intel — Phase 1 (Backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`).

**Goal:** Let Mark file structured competitor-campaign findings into the growth-engine app via a bearer-gated endpoint, stored as `competitor_campaigns` records in `needs_review` for light human confirmation.

**Architecture:** Mirrors the existing Hermes pattern: pure domain parser/scoring in `src/domain/` → I/O persistence in `src/lib/competitor-intel/` → a thin API route under `src/app/api/v1/hermes/`. Adapted from the approved 2026-06-02 design, trimmed to a lean v1: **no `vault_notes` dependency** (that table isn't in the live DB) and **no operator UI yet** (review interim via Supabase, like the campaign pipeline). UI is Phase 2.

**Tech Stack:** Next.js 16 + TypeScript + zod + vitest; Supabase (table applied via the Supabase MCP `apply_migration`, since this branch has no local migrations folder).

**Out of scope (Phase 2 / later):** operator review screen, auto-generated human-readable note, feeding intel into the draft engine, recurring scrapes.

---

## File / artifact map
- DB: new `competitor_campaigns` table + 2 enums (applied via Supabase MCP `apply_migration`, name `competitor_intel_phase1`).
- Create `src/domain/competitor-intel.ts` — zod parser + dedupe key + activity scoring (pure).
- Create `src/domain/__tests__/competitor-intel.test.ts`.
- Edit `src/domain/index.ts` — add `export * from "./competitor-intel";`.
- Create `src/lib/competitor-intel/persistence.ts` — `persistCompetitorIntel`.
- Create `src/lib/competitor-intel/persistence.test.ts`.
- Create `src/app/api/v1/hermes/competitor-intel/route.ts` — thin wrapper (no test; matches house convention).
- Create `C:\Users\evanr\marketing-classifier-agent\mark-skills\competitor-intel-scout\SKILL.md`.

---

## Task 1: Create the `competitor_campaigns` table

- [ ] **Step 1: Apply the migration via the Supabase MCP** (`apply_migration`, project `fpjvgqrfqncnudqeudee`, name `competitor_intel_phase1`):

```sql
create type public.competitor_intel_status as enum ('needs_review', 'confirmed', 'archived');
create type public.competitor_intel_source as enum ('meta_ad_library', 'google_ads_transparency', 'similarweb', 'landing_page');

create table public.competitor_campaigns (
  id uuid primary key default gen_random_uuid(),
  source public.competitor_intel_source not null,
  competitor_name text not null check (length(btrim(competitor_name)) > 0),
  competitor_url text,
  persona public.persona_mapping,
  status public.competitor_intel_status not null default 'needs_review',
  captured_at timestamptz not null default now(),
  summary text not null default '',
  channel_mix jsonb not null default '{}'::jsonb,
  est_spend text,
  top_keywords text[] not null default '{}'::text[],
  ad_creatives jsonb not null default '[]'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_by_agent_id uuid references public.agents(id),
  run_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index competitor_campaigns_source_idx on public.competitor_campaigns(source);
create index competitor_campaigns_status_idx on public.competitor_campaigns(status);
create index competitor_campaigns_name_idx on public.competitor_campaigns(competitor_name);

alter table public.competitor_campaigns enable row level security;

create trigger competitor_campaigns_set_updated_at
before update on public.competitor_campaigns
for each row execute function public.set_updated_at();
```

- [ ] **Step 2: Verify** via `list_tables` (or `execute_sql`) that `competitor_campaigns` exists with the columns above. RLS on; service-role (the app's admin client) bypasses it.

## Task 2: Domain parser + helpers (pure, TDD)

**Files:** Create `src/domain/competitor-intel.ts`; Test `src/domain/__tests__/competitor-intel.test.ts`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";

import { parseCompetitorIntelPayload, competitorIntelDedupeKey, scoreCompetitorActivity } from "../competitor-intel";

const valid = {
  source: "meta_ad_library",
  competitorName: "ServiceMaster Chicago",
  competitorUrl: "https://example-competitor.local",
  summary: "Running 4 storm-response video ads in Chicago metro.",
  topKeywords: ["water damage", "storm cleanup"],
  adCreatives: [{ headline: "Flooded?", body: "24/7", mediaUrl: "https://x.test/a.png" }],
  capturedAt: "2026-06-08T00:00:00.000Z",
  operator: "Mark",
};

describe("parseCompetitorIntelPayload", () => {
  it("accepts a valid payload and applies defaults", () => {
    const r = parseCompetitorIntelPayload(valid);
    expect(r.competitorName).toBe("ServiceMaster Chicago");
    expect(r.status).toBe("needs_review");
    expect(r.channelMix).toEqual({});
  });
  it("rejects an unknown source", () => {
    expect(() => parseCompetitorIntelPayload({ ...valid, source: "tiktok" })).toThrow();
  });
  it("rejects a blank competitorName", () => {
    expect(() => parseCompetitorIntelPayload({ ...valid, competitorName: "  " })).toThrow();
  });
});

describe("competitorIntelDedupeKey", () => {
  it("is stable for the same source+name+captured date", () => {
    const a = competitorIntelDedupeKey({ source: "meta_ad_library", competitorName: "Acme", capturedAt: "2026-06-08T10:00:00Z" });
    const b = competitorIntelDedupeKey({ source: "meta_ad_library", competitorName: "acme", capturedAt: "2026-06-08T23:00:00Z" });
    expect(a).toBe(b);
  });
});

describe("scoreCompetitorActivity", () => {
  it("rates more creatives as higher activity", () => {
    const low = scoreCompetitorActivity({ adCreatives: [] });
    const high = scoreCompetitorActivity({ adCreatives: [{}, {}, {}, {}, {}, {}] });
    expect(high.activityLevel).toBe("high");
    expect(low.activityLevel).toBe("low");
  });
});
```

- [ ] **Step 2: Run to verify fail** — `pnpm vitest run src/domain/__tests__/competitor-intel.test.ts` → cannot find module.

- [ ] **Step 3: Implement** `src/domain/competitor-intel.ts`

```typescript
import { z } from "zod";

import { OFFICIAL_PERSONA_MAPPINGS } from "./personas";

const optionalText = z.string().trim().min(1).optional();

export const competitorIntelRequestSchema = z.object({
  source: z.enum(["meta_ad_library", "google_ads_transparency", "similarweb", "landing_page"]),
  competitorName: z.string().trim().min(1),
  competitorUrl: z.string().trim().url().optional(),
  persona: z.enum(OFFICIAL_PERSONA_MAPPINGS).optional(),
  status: z.enum(["needs_review", "confirmed", "archived"]).default("needs_review"),
  capturedAt: z.string().trim().min(1).optional(),
  summary: z.string().trim().default(""),
  channelMix: z.record(z.string(), z.number()).default({}),
  estSpend: optionalText,
  topKeywords: z.array(z.string().trim().min(1)).default([]),
  adCreatives: z.array(z.record(z.string(), z.unknown())).default([]),
  rawPayload: z.record(z.string(), z.unknown()).default({}),
  operator: z.string().trim().min(1).default("Mark"),
});

export type CompetitorIntelRequest = z.output<typeof competitorIntelRequestSchema>;

export function parseCompetitorIntelPayload(input: unknown): CompetitorIntelRequest {
  return competitorIntelRequestSchema.parse(input ?? {});
}

export function competitorIntelDedupeKey(input: { source: string; competitorName: string; capturedAt?: string }): string {
  const day = (input.capturedAt ?? "").slice(0, 10);
  return `${input.source}:${input.competitorName.trim().toLowerCase()}:${day}`;
}

export function scoreCompetitorActivity(input: { adCreatives?: unknown[] }): { activityLevel: "low" | "medium" | "high"; signals: string[] } {
  const count = input.adCreatives?.length ?? 0;
  const signals = [`${count} active creatives`];
  const activityLevel = count >= 5 ? "high" : count >= 2 ? "medium" : "low";
  return { activityLevel, signals };
}
```

- [ ] **Step 4: Add the barrel export** — in `src/domain/index.ts` append:

```typescript
export * from "./competitor-intel";
```

- [ ] **Step 5: Run to verify pass** — `pnpm vitest run src/domain/__tests__/competitor-intel.test.ts` → all pass.

- [ ] **Step 6: Commit** — `git add src/domain/competitor-intel.ts src/domain/__tests__/competitor-intel.test.ts src/domain/index.ts && git commit -m "feat(competitor-intel): domain parser, dedupe key, activity scoring"`

## Task 3: Persistence (TDD)

**Files:** Create `src/lib/competitor-intel/persistence.ts`; Test `src/lib/competitor-intel/persistence.test.ts`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock, type MockSupabase } from "@/lib/repos/__tests__/test-helpers";

import { persistCompetitorIntel } from "./persistence";

function insertsByTable(supabase: MockSupabase, table: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  let current: string | null = null;
  for (const [method, arg] of supabase.calls) {
    if (method === "from") current = arg as string;
    else if (method === "insert" && current === table) out.push(arg as Record<string, unknown>);
  }
  return out;
}

const valid = {
  source: "meta_ad_library",
  competitorName: "ServiceMaster Chicago",
  summary: "4 storm-response ads",
  adCreatives: [{ headline: "Flooded?" }],
  operator: "Mark",
};

describe("persistCompetitorIntel", () => {
  it("inserts a needs_review competitor_campaigns row", async () => {
    const supabase = createSupabaseQueryMock({
      agents: { data: { id: "agent-1" }, error: null },
      competitor_campaigns: { data: { id: "ci-1" }, error: null },
    });

    const result = await persistCompetitorIntel(valid, supabase);
    expect(result.status).toBe("needs_review");
    expect(result.competitorCampaignId).toBe("ci-1");

    const rows = insertsByTable(supabase, "competitor_campaigns");
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("meta_ad_library");
    expect(rows[0].competitor_name).toBe("ServiceMaster Chicago");
    expect(rows[0].status).toBe("needs_review");
  });
});
```

- [ ] **Step 2: Run to verify fail** — `pnpm vitest run src/lib/competitor-intel/persistence.test.ts`.

- [ ] **Step 3: Implement** `src/lib/competitor-intel/persistence.ts`

```typescript
import { type SupabaseClient } from "@supabase/supabase-js";

import { parseCompetitorIntelPayload } from "@/domain";
import { getSupabaseAdminClient } from "../supabase/server";

export type CompetitorIntelResult = { competitorCampaignId: string; status: "needs_review"; runId: string };

export async function persistCompetitorIntel(
  input: unknown = {},
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<CompetitorIntelResult> {
  const req = parseCompetitorIntelPayload(input);
  const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const agentId = await upsertMarkAgent(client);

  const competitorCampaignId = await insertOne(client, "competitor_campaigns", {
    source: req.source,
    competitor_name: req.competitorName,
    competitor_url: req.competitorUrl ?? null,
    persona: req.persona ?? null,
    status: "needs_review",
    captured_at: req.capturedAt ?? new Date().toISOString(),
    summary: req.summary,
    channel_mix: req.channelMix,
    est_spend: req.estSpend ?? null,
    top_keywords: req.topKeywords,
    ad_creatives: req.adCreatives,
    raw_payload: req.rawPayload,
    created_by_agent_id: agentId,
    run_id: runId,
  });

  return { competitorCampaignId, status: "needs_review", runId };
}

async function upsertMarkAgent(client: SupabaseClient): Promise<string> {
  const { data, error } = await client
    .from("agents")
    .upsert({ key: "hermes", name: "Hermes Orchestrator", status: "ready" }, { onConflict: "key" })
    .select("id")
    .single<{ id: string }>();
  if (error) {
    throw new Error(`agents upsert failed: ${error.message}`);
  }
  return data.id;
}

async function insertOne(client: SupabaseClient, table: string, values: Record<string, unknown>) {
  const { data, error } = await client.from(table).insert(values).select("id").single<{ id: string }>();
  if (error) {
    throw new Error(`${table} insert failed: ${error.message}`);
  }
  return data.id;
}
```

- [ ] **Step 4: Run to verify pass.** Adjust test destructuring only if the mock tuple shape differs (it logs `["from", table]` then `["insert", values]`).

- [ ] **Step 5: Commit** — `git add src/lib/competitor-intel/ && git commit -m "feat(competitor-intel): persist findings as needs_review records"`

## Task 4: API route

**Files:** Create `src/app/api/v1/hermes/competitor-intel/route.ts`.

- [ ] **Step 1: Implement** (mirrors `runs/route.ts` and the social-ads route)

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";

import { checkBearerToken } from "@/lib/auth/api-token";
import { persistCompetitorIntel } from "@/lib/competitor-intel/persistence";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const auth = checkBearerToken(request, "HERMES_AGENT_API_TOKEN");
  if (!auth.ok) {
    return NextResponse.json(
      auth.reason === "not_configured"
        ? { ok: false, status: "not_configured", message: "Set HERMES_AGENT_API_TOKEN before enabling Hermes API runs." }
        : { ok: false, status: "unauthorized", message: "Hermes API runs require a valid bearer token." },
      { status: auth.status },
    );
  }
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { ok: false, status: "not_configured", message: "Supabase admin env vars are required before Hermes can persist work." },
      { status: 503 },
    );
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, status: "rejected", message: "Request body must be valid JSON." }, { status: 400 });
  }
  try {
    const result = await persistCompetitorIntel(payload);
    return NextResponse.json({ ok: true, status: result.status, result }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, status: "rejected", errors: error.issues.map((i) => ({ code: i.code, message: i.message, path: i.path.map(String) })) },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, status: "failed", message: error instanceof Error ? error.message : "Competitor intel run failed." },
      { status: 502 },
    );
  }
}
```

- [ ] **Step 2: Verify** — `pnpm lint` + `pnpm vitest run src/domain src/lib/competitor-intel` all green; `pnpm vitest run` full suite stays green.

- [ ] **Step 3: Commit** — `git add "src/app/api/v1/hermes/competitor-intel/route.ts" && git commit -m "feat(api): add POST /api/v1/hermes/competitor-intel"`

## Task 5: Mark skill — `competitor-intel-scout`

**Files:** Create `C:\Users\evanr\marketing-classifier-agent\mark-skills\competitor-intel-scout\SKILL.md`.

- [ ] **Step 1: Write the skill** — tells Mark which sources to browse (Meta Ad Library, Google Ads Transparency, SimilarWeb, competitor landing pages), exactly which fields to extract (source, competitorName, competitorUrl, summary, channelMix, estSpend, topKeywords[], adCreatives[{headline,body,mediaUrl}]), the **POST `{APP_URL}/api/v1/hermes/competitor-intel`** shape with bearer `HERMES_AGENT_API_TOKEN`, success `201 {result:{competitorCampaignId, status:"needs_review"}}`, and a ToS caution (respect robots/rate limits; everything lands `needs_review`, never auto-trusted, never triggers outbound). (Deliverable for Mark's Mac profile; not committed to the app repo.)

## Task 6: Interim review (no UI yet)

- [ ] Document that, until Phase 2 (operator screen), confirming/archiving a finding is a Supabase update: `update competitor_campaigns set status='confirmed' where id='…';` (or `'archived'`). Phase 2 will add the operator panel + a typed repo (`src/lib/repos/competitor-campaigns.ts`) and list/getById/updateStatus.

---

## Self-Review
- **Spec coverage:** structured competitor records (Task 1–3) ✅; bearer-gated endpoint mirroring runs (Task 4) ✅; Mark procedure (Task 5) ✅; review path (Task 6, interim) ✅. Dropped vs old design: `vault_notes` note + operator UI (Phase 2) — intentional, logged.
- **NOT NULL / enum safety:** `competitor_campaigns` required cols = source, competitor_name (both provided); all else defaulted. `persona` uses existing `persona_mapping` enum (nullable). Trigger uses existing `set_updated_at`.
- **Type consistency:** `parseCompetitorIntelPayload` / `persistCompetitorIntel` / `CompetitorIntelRequest` names consistent across domain, lib, route, tests.
- **Assumption to verify at execution:** `OFFICIAL_PERSONA_MAPPINGS` is exported from `src/domain/personas` (used by existing `hermes/contracts.ts` via `@/domain`); confirm the import path resolves (use `@/domain` if the direct `./personas` path differs).
