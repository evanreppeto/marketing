# Competitor Campaign Intel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Arc Claude computer-use agent a bearer-gated endpoint to file structured competitor-campaign intel, persisted as both a typed `competitor_campaigns` record and a human-readable Obsidian vault note, reviewed via a light status flow under Arc/agent-operations.

**Architecture:** Pure domain layer (`src/domain/competitor-intel.ts`) validates/normalizes payloads, computes a dedupe key, scores activity, and renders the vault-note markdown. An I/O layer (`src/lib/competitor-intel/persistence.ts`) upserts the record + note. A bearer-gated route (`POST /api/v1/arc/competitor-intel`) mirrors `/api/v1/arc/runs`. A repo + a server-component sub-route under agent-operations gives operators a Confirm/Archive review surface. A Claude skill teaches Arc the scrape-and-POST procedure.

**Tech Stack:** Next.js 16, React 19, TypeScript, Zod, Supabase (admin client), Vitest. Package manager pnpm.

**Spec:** `docs/superpowers/specs/2026-06-02-competitor-campaign-intel-design.md`

**Conventions to honor:**
- All persistence functions take an untyped `SupabaseClient` param (like `src/lib/arc/orchestrator.ts`) so new tables don't require regenerating `database.types.ts`.
- Don't edit shipped migrations — add a new timestamp-prefixed file.
- Re-export domain through `src/domain/index.ts`; import via `@/domain`.
- Response codes are load-bearing: `400` validation, `503` not_configured, `201` persisted, `502` persistence error.

---

## File Structure

**Create:**
- `supabase/migrations/20260602120000_competitor_intel.sql` — enums + `competitor_campaigns` table.
- `src/domain/competitor-intel.ts` — pure: schema/parse, dedupe key, activity scoring, slug, markdown rendering.
- `src/domain/__tests__/competitor-intel.test.ts` — domain unit tests.
- `src/lib/competitor-intel/persistence.ts` — `persistCompetitorIntel` (record + vault note).
- `src/lib/competitor-intel/persistence.test.ts` — persistence test using the shared Supabase query mock.
- `src/lib/repos/competitor-campaigns.ts` — typed list + status update.
- `src/app/api/v1/arc/competitor-intel/route.ts` — bearer-gated POST.
- `src/app/api/v1/arc/competitor-intel/route.test.ts` — route auth/validation tests.
- `src/app/agent-operations/competitor-intel/page.tsx` — operator review list.
- `src/app/agent-operations/competitor-intel/actions.ts` — Confirm/Archive server actions.
- `.claude/skills/competitor-intel-scout/SKILL.md` — Arc's scrape-and-POST procedure.

**Modify:**
- `src/domain/index.ts` — add `export * from "./competitor-intel";`.

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260602120000_competitor_intel.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Competitor campaign intel: structured findings filed by Arc (Claude computer-use
-- agent) from ad libraries, SimilarWeb, and competitor landing pages. Read-only intel;
-- light review only (needs_review -> confirmed/archived). Reuses set_updated_at().

create type public.competitor_intel_status as enum (
  'needs_review',
  'confirmed',
  'archived'
);

create type public.competitor_intel_source as enum (
  'meta_ad_library',
  'google_ads_transparency',
  'similarweb',
  'landing_page'
);

create table public.competitor_campaigns (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique check (length(btrim(dedupe_key)) > 0),
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
  activity_level text not null default 'low',
  raw_payload jsonb not null default '{}'::jsonb,
  vault_note_slug text,
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

- [ ] **Step 2: Sanity-check it parses (no DB apply needed in dev)**

Run: `git diff --stat supabase/migrations/`
Expected: shows the new file added. (Migration is applied later via your Supabase workflow; no local apply required for the app to build/test.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260602120000_competitor_intel.sql
git commit -m "feat: competitor_campaigns table + intel enums migration"
```

---

## Task 2: Domain — schema & parse

**Files:**
- Create: `src/domain/competitor-intel.ts`
- Test: `src/domain/__tests__/competitor-intel.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";

import { parseCompetitorIntelPayload } from "../competitor-intel";

describe("parseCompetitorIntelPayload", () => {
  it("accepts a minimal valid payload and applies defaults", () => {
    const result = parseCompetitorIntelPayload({
      source: "meta_ad_library",
      competitorName: "Apex Plumbing",
    });
    expect(result.source).toBe("meta_ad_library");
    expect(result.competitorName).toBe("Apex Plumbing");
    expect(result.summary).toBe("");
    expect(result.channelMix).toEqual({});
    expect(result.topKeywords).toEqual([]);
    expect(result.adCreatives).toEqual([]);
    expect(result.rawPayload).toEqual({});
  });

  it("rejects an unknown source", () => {
    expect(() => parseCompetitorIntelPayload({ source: "tiktok", competitorName: "X" })).toThrow();
  });

  it("rejects a missing competitorName", () => {
    expect(() => parseCompetitorIntelPayload({ source: "similarweb" })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/domain/__tests__/competitor-intel.test.ts`
Expected: FAIL — cannot find module `../competitor-intel`.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { z } from "zod";

import { OFFICIAL_PERSONA_MAPPINGS } from "./personas";

export const COMPETITOR_INTEL_SOURCES = [
  "meta_ad_library",
  "google_ads_transparency",
  "similarweb",
  "landing_page",
] as const;
export type CompetitorIntelSource = (typeof COMPETITOR_INTEL_SOURCES)[number];

const adCreativeSchema = z.object({
  headline: z.string().trim().min(1).optional(),
  body: z.string().trim().min(1).optional(),
  mediaUrl: z.string().trim().url().optional(),
  landingUrl: z.string().trim().url().optional(),
});

export type CompetitorAdCreative = z.output<typeof adCreativeSchema>;

export const competitorIntelRequestSchema = z.object({
  source: z.enum(COMPETITOR_INTEL_SOURCES),
  competitorName: z.string().trim().min(1),
  competitorUrl: z.string().trim().url().optional(),
  persona: z.enum(OFFICIAL_PERSONA_MAPPINGS).optional(),
  capturedAt: z.string().trim().min(1).optional(),
  summary: z.string().trim().default(""),
  channelMix: z.record(z.string(), z.number()).default({}),
  estSpend: z.string().trim().min(1).optional(),
  topKeywords: z.array(z.string().trim().min(1)).default([]),
  adCreatives: z.array(adCreativeSchema).default([]),
  rawPayload: z.record(z.string(), z.unknown()).default({}),
  runId: z.string().trim().min(1).optional(),
});

export type CompetitorIntelRequest = z.output<typeof competitorIntelRequestSchema>;
export type CompetitorIntelRequestInput = z.input<typeof competitorIntelRequestSchema>;

export function parseCompetitorIntelPayload(input: unknown): CompetitorIntelRequest {
  return competitorIntelRequestSchema.parse(input ?? {});
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/domain/__tests__/competitor-intel.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/competitor-intel.ts src/domain/__tests__/competitor-intel.test.ts
git commit -m "feat: competitor intel payload schema + parse"
```

---

## Task 3: Domain — dedupe key, slug, activity scoring

**Files:**
- Modify: `src/domain/competitor-intel.ts`
- Test: `src/domain/__tests__/competitor-intel.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/domain/__tests__/competitor-intel.test.ts`:

```typescript
import {
  competitorIntelDedupeKey,
  competitorIntelNoteSlug,
  scoreCompetitorActivity,
} from "../competitor-intel";

describe("competitorIntelDedupeKey", () => {
  it("is stable across name casing/whitespace and uses the capture day", () => {
    const a = competitorIntelDedupeKey({
      source: "meta_ad_library",
      competitorName: "  Apex Plumbing ",
      capturedAt: "2026-06-02T10:00:00.000Z",
    });
    const b = competitorIntelDedupeKey({
      source: "meta_ad_library",
      competitorName: "apex plumbing",
      capturedAt: "2026-06-02T23:59:00.000Z",
    });
    expect(a).toBe(b);
    expect(a).toBe("meta_ad_library::apex-plumbing::2026-06-02");
  });
});

describe("competitorIntelNoteSlug", () => {
  it("produces a clean slug from the dedupe key", () => {
    expect(
      competitorIntelNoteSlug({
        source: "meta_ad_library",
        competitorName: "Apex Plumbing",
        capturedAt: "2026-06-02T10:00:00.000Z",
      }),
    ).toBe("meta-ad-library-apex-plumbing-2026-06-02");
  });
});

describe("scoreCompetitorActivity", () => {
  it("rates high with 5+ creatives", () => {
    const r = scoreCompetitorActivity({ adCreatives: [1, 2, 3, 4, 5], topKeywords: ["a"] });
    expect(r.activityLevel).toBe("high");
    expect(r.signals).toContain("5 active creatives");
  });

  it("rates low with no creatives", () => {
    expect(scoreCompetitorActivity({ adCreatives: [], topKeywords: [] }).activityLevel).toBe("low");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test src/domain/__tests__/competitor-intel.test.ts`
Expected: FAIL — `competitorIntelDedupeKey` is not exported.

- [ ] **Step 3: Implement (append to `src/domain/competitor-intel.ts`)**

```typescript
export function competitorIntelDedupeKey(input: {
  source: string;
  competitorName: string;
  capturedAt?: string;
}): string {
  const day = (input.capturedAt ?? "").slice(0, 10);
  const name = input.competitorName.trim().toLowerCase().replace(/\s+/g, "-");
  return `${input.source}::${name}::${day}`;
}

export function competitorIntelNoteSlug(input: {
  source: string;
  competitorName: string;
  capturedAt?: string;
}): string {
  return competitorIntelDedupeKey(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type CompetitorActivity = {
  activityLevel: "high" | "medium" | "low";
  signals: string[];
};

export function scoreCompetitorActivity(input: {
  adCreatives: unknown[];
  topKeywords: unknown[];
}): CompetitorActivity {
  const creatives = input.adCreatives.length;
  const keywords = input.topKeywords.length;
  const signals: string[] = [];
  if (creatives > 0) signals.push(`${creatives} active creative${creatives === 1 ? "" : "s"}`);
  if (keywords > 0) signals.push(`${keywords} tracked keyword${keywords === 1 ? "" : "s"}`);
  const activityLevel = creatives >= 5 ? "high" : creatives >= 1 ? "medium" : "low";
  return { activityLevel, signals };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/domain/__tests__/competitor-intel.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/competitor-intel.ts src/domain/__tests__/competitor-intel.test.ts
git commit -m "feat: competitor intel dedupe key, slug, activity scoring"
```

---

## Task 4: Domain — render vault-note markdown

**Files:**
- Modify: `src/domain/competitor-intel.ts`
- Test: `src/domain/__tests__/competitor-intel.test.ts`

- [ ] **Step 1: Add failing test**

Append to the test file:

```typescript
import { renderIntelNoteMarkdown } from "../competitor-intel";

describe("renderIntelNoteMarkdown", () => {
  it("renders a Competitor Intel note with title, slug, tags, and a persona wiki-link", () => {
    const note = renderIntelNoteMarkdown({
      source: "meta_ad_library",
      competitorName: "Apex Plumbing",
      competitorUrl: "https://apex.example",
      persona: "persona_plumbing_partner",
      capturedAt: "2026-06-02T10:00:00.000Z",
      summary: "Running aggressive emergency-water FB ads.",
      channelMix: { paid: 70, organic: 30 },
      estSpend: "$5k-$10k/mo",
      topKeywords: ["emergency plumber", "burst pipe"],
      adCreatives: [{ headline: "24/7 Water Emergency", body: "Call now" }],
    });
    expect(note.folder).toBe("Competitor Intel");
    expect(note.slug).toBe("meta-ad-library-apex-plumbing-2026-06-02");
    expect(note.title).toBe("Apex Plumbing — Meta Ad Library Intel");
    expect(note.tags).toEqual(["competitor", "meta_ad_library"]);
    expect(note.body).toContain("[[persona_plumbing_partner]]");
    expect(note.body).toContain("## Ad creatives");
    expect(note.body).toContain("24/7 Water Emergency");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test src/domain/__tests__/competitor-intel.test.ts`
Expected: FAIL — `renderIntelNoteMarkdown` is not exported.

- [ ] **Step 3: Implement (append to `src/domain/competitor-intel.ts`)**

```typescript
export type IntelNote = {
  slug: string;
  title: string;
  folder: string;
  tags: string[];
  body: string;
};

const SOURCE_LABELS: Record<CompetitorIntelSource, string> = {
  meta_ad_library: "Meta Ad Library",
  google_ads_transparency: "Google Ads Transparency",
  similarweb: "SimilarWeb",
  landing_page: "Landing Page",
};

export function renderIntelNoteMarkdown(record: {
  source: CompetitorIntelSource;
  competitorName: string;
  competitorUrl?: string;
  persona?: string;
  capturedAt: string;
  summary: string;
  channelMix: Record<string, number>;
  estSpend?: string;
  topKeywords: string[];
  adCreatives: Array<{ headline?: string; body?: string; mediaUrl?: string; landingUrl?: string }>;
}): IntelNote {
  const sourceLabel = SOURCE_LABELS[record.source];
  const slug = competitorIntelNoteSlug(record);
  const title = `${record.competitorName} — ${sourceLabel} Intel`;
  const activity = scoreCompetitorActivity(record);

  const lines: string[] = [`# ${title}`, ""];
  lines.push(`- **Source:** ${sourceLabel}`);
  if (record.competitorUrl) lines.push(`- **URL:** ${record.competitorUrl}`);
  lines.push(`- **Captured:** ${record.capturedAt.slice(0, 10)}`);
  lines.push(`- **Activity:** ${activity.activityLevel}`);
  if (record.persona) lines.push(`- **Persona:** [[${record.persona}]]`);
  if (record.estSpend) lines.push(`- **Est. spend:** ${record.estSpend}`);
  lines.push("");

  if (record.summary) lines.push("## Summary", record.summary, "");

  const channels = Object.entries(record.channelMix);
  if (channels.length) {
    lines.push("## Channel mix");
    for (const [k, v] of channels) lines.push(`- ${k}: ${v}`);
    lines.push("");
  }

  if (record.topKeywords.length) {
    lines.push("## Top keywords", record.topKeywords.map((k) => `\`${k}\``).join(", "), "");
  }

  if (record.adCreatives.length) {
    lines.push("## Ad creatives");
    record.adCreatives.forEach((ad, i) => {
      lines.push(`### Creative ${i + 1}`);
      if (ad.headline) lines.push(`- **Headline:** ${ad.headline}`);
      if (ad.body) lines.push(`- **Body:** ${ad.body}`);
      if (ad.mediaUrl) lines.push(`- **Media:** ${ad.mediaUrl}`);
      if (ad.landingUrl) lines.push(`- **Landing:** ${ad.landingUrl}`);
      lines.push("");
    });
  }

  return {
    slug,
    title,
    folder: "Competitor Intel",
    tags: ["competitor", record.source],
    body: `${lines.join("\n").trim()}\n`,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/domain/__tests__/competitor-intel.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/competitor-intel.ts src/domain/__tests__/competitor-intel.test.ts
git commit -m "feat: render competitor intel vault-note markdown"
```

---

## Task 5: Domain index re-export

**Files:**
- Modify: `src/domain/index.ts`

- [ ] **Step 1: Add the re-export**

Add this line to `src/domain/index.ts` (after the existing exports):

```typescript
export * from "./competitor-intel";
```

- [ ] **Step 2: Verify it compiles via the domain tests**

Run: `pnpm test src/domain/__tests__/competitor-intel.test.ts`
Expected: PASS (imports via `@/domain` will resolve in later tasks).

- [ ] **Step 3: Commit**

```bash
git add src/domain/index.ts
git commit -m "chore: re-export competitor-intel from domain index"
```

---

## Task 6: Persistence — `persistCompetitorIntel`

**Files:**
- Create: `src/lib/competitor-intel/persistence.ts`
- Test: `src/lib/competitor-intel/persistence.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";
import { parseCompetitorIntelPayload } from "@/domain";

import { persistCompetitorIntel } from "./persistence";

describe("persistCompetitorIntel", () => {
  it("upserts a competitor_campaigns record and a linked vault note", async () => {
    const supabase = createSupabaseQueryMock({
      agents: { data: { id: "agent-1" }, error: null },
      competitor_campaigns: { data: { id: "cc-1" }, error: null },
      vault_notes: { data: null, error: null },
    });

    const request = parseCompetitorIntelPayload({
      source: "meta_ad_library",
      competitorName: "Apex Plumbing",
      capturedAt: "2026-06-02T10:00:00.000Z",
      adCreatives: [{ headline: "24/7 Water Emergency" }],
    });

    const result = await persistCompetitorIntel(request, supabase);

    expect(result.competitorCampaignId).toBe("cc-1");
    expect(result.vaultNoteSlug).toBe("meta-ad-library-apex-plumbing-2026-06-02");
    expect(result.status).toBe("needs_review");

    const tables = supabase.calls.filter(([m]) => m === "from").map(([, t]) => t);
    expect(tables).toContain("competitor_campaigns");
    expect(tables).toContain("vault_notes");

    const upserts = supabase.calls.filter(([m]) => m === "upsert").map(([, arg]) => arg as Record<string, unknown>);
    const record = upserts.find((u) => "dedupe_key" in u);
    expect(record?.status).toBe("needs_review");
    expect(record?.vault_note_slug).toBe("meta-ad-library-apex-plumbing-2026-06-02");
    expect(record?.created_by_agent_id).toBe("agent-1");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test src/lib/competitor-intel/persistence.test.ts`
Expected: FAIL — cannot find module `./persistence`.

- [ ] **Step 3: Implement**

```typescript
import { type SupabaseClient } from "@supabase/supabase-js";

import {
  competitorIntelDedupeKey,
  renderIntelNoteMarkdown,
  scoreCompetitorActivity,
  type CompetitorIntelRequest,
} from "@/domain";

import { getSupabaseAdminClient } from "../supabase/server";

export type PersistCompetitorIntelResult = {
  competitorCampaignId: string;
  vaultNoteSlug: string;
  dedupeKey: string;
  status: "needs_review";
};

export async function persistCompetitorIntel(
  request: CompetitorIntelRequest,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<PersistCompetitorIntelResult> {
  const capturedAt = request.capturedAt ?? new Date().toISOString();
  const dedupeKey = competitorIntelDedupeKey({
    source: request.source,
    competitorName: request.competitorName,
    capturedAt,
  });
  const note = renderIntelNoteMarkdown({ ...request, capturedAt });
  const activity = scoreCompetitorActivity(request);
  const agentId = await lookupMarkAgentId(client);

  // 1. Structured record is the source of truth.
  const { data, error } = await client
    .from("competitor_campaigns")
    .upsert(
      {
        dedupe_key: dedupeKey,
        source: request.source,
        competitor_name: request.competitorName,
        competitor_url: request.competitorUrl ?? null,
        persona: request.persona ?? null,
        status: "needs_review",
        captured_at: capturedAt,
        summary: request.summary,
        channel_mix: request.channelMix,
        est_spend: request.estSpend ?? null,
        top_keywords: request.topKeywords,
        ad_creatives: request.adCreatives,
        activity_level: activity.activityLevel,
        raw_payload: request.rawPayload,
        vault_note_slug: note.slug,
        created_by_agent_id: agentId,
        run_id: request.runId ?? null,
      },
      { onConflict: "dedupe_key" },
    )
    .select("id")
    .single<{ id: string }>();

  if (error) {
    throw new Error(`competitor_campaigns upsert failed: ${error.message}`);
  }

  // 2. Human-readable vault note (best-effort: a failed note does not lose the record).
  const { error: noteError } = await client.from("vault_notes").upsert(
    {
      slug: note.slug,
      title: note.title,
      folder: note.folder,
      tags: note.tags,
      author: "Arc",
      status: "needs_review",
      body: note.body,
    },
    { onConflict: "slug" },
  );

  if (noteError) {
    // Record is already saved; surface nothing fatal — the UI tolerates a missing note.
    console.warn(`competitor intel vault_notes upsert failed: ${noteError.message}`);
  }

  return {
    competitorCampaignId: data.id,
    vaultNoteSlug: note.slug,
    dedupeKey,
    status: "needs_review",
  };
}

async function lookupMarkAgentId(client: SupabaseClient): Promise<string | null> {
  const { data } = await client.from("agents").select("id").eq("key", "arc").maybeSingle<{ id: string }>();
  return data?.id ?? null;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/lib/competitor-intel/persistence.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/competitor-intel/persistence.ts src/lib/competitor-intel/persistence.test.ts
git commit -m "feat: persist competitor intel record + vault note"
```

---

## Task 7: Repo — list & status update

**Files:**
- Create: `src/lib/repos/competitor-campaigns.ts`
- Test: `src/lib/repos/competitor-campaigns.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "./__tests__/test-helpers";
import { listCompetitorCampaigns, setCompetitorCampaignStatus } from "./competitor-campaigns";

describe("listCompetitorCampaigns", () => {
  it("returns rows from competitor_campaigns", async () => {
    const supabase = createSupabaseQueryMock({
      competitor_campaigns: { data: [{ id: "cc-1", competitor_name: "Apex" }], error: null },
    });
    const rows = await listCompetitorCampaigns(supabase, "needs_review");
    expect(rows).toHaveLength(1);
    expect(rows[0].competitor_name).toBe("Apex");
    const filters = supabase.calls.filter(([m]) => m === "eq");
    expect(filters).toContainEqual(["eq", "status", "needs_review"]);
  });
});

describe("setCompetitorCampaignStatus", () => {
  it("updates the row status by id", async () => {
    const supabase = createSupabaseQueryMock({ competitor_campaigns: { data: null, error: null } });
    await setCompetitorCampaignStatus(supabase, "cc-1", "confirmed");
    const updates = supabase.calls.filter(([m]) => m === "update").map(([, arg]) => arg);
    expect(updates).toContainEqual({ status: "confirmed" });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test src/lib/repos/competitor-campaigns.test.ts`
Expected: FAIL — cannot find module `./competitor-campaigns`.

- [ ] **Step 3: Implement**

```typescript
import { type SupabaseClient } from "@supabase/supabase-js";

export type CompetitorCampaignRow = {
  id: string;
  source: string;
  competitor_name: string;
  competitor_url: string | null;
  persona: string | null;
  status: string;
  captured_at: string;
  summary: string;
  channel_mix: Record<string, number> | null;
  est_spend: string | null;
  top_keywords: string[] | null;
  ad_creatives: unknown[] | null;
  activity_level: string | null;
  vault_note_slug: string | null;
  created_at: string;
};

const SELECT =
  "id,source,competitor_name,competitor_url,persona,status,captured_at,summary,channel_mix,est_spend,top_keywords,ad_creatives,activity_level,vault_note_slug,created_at";

export async function listCompetitorCampaigns(
  supabase: SupabaseClient,
  status?: string,
): Promise<CompetitorCampaignRow[]> {
  let query = supabase.from("competitor_campaigns").select(SELECT).order("captured_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw new Error(`competitor_campaigns list failed: ${error.message}`);
  return (data ?? []) as CompetitorCampaignRow[];
}

export async function setCompetitorCampaignStatus(
  supabase: SupabaseClient,
  id: string,
  status: "confirmed" | "archived",
): Promise<void> {
  const { error } = await supabase.from("competitor_campaigns").update({ status }).eq("id", id);
  if (error) throw new Error(`competitor_campaigns status update failed: ${error.message}`);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/lib/repos/competitor-campaigns.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/repos/competitor-campaigns.ts src/lib/repos/competitor-campaigns.test.ts
git commit -m "feat: competitor_campaigns repo (list + status update)"
```

---

## Task 8: API route + tests

**Files:**
- Create: `src/app/api/v1/arc/competitor-intel/route.ts`
- Test: `src/app/api/v1/arc/competitor-intel/route.test.ts`

Note: validation runs **before** the Supabase config check (so bad payloads are rejected
regardless of config, and the 400 path is testable without Supabase). This mirrors the
lead-ingest route's "validate first" posture.

- [ ] **Step 1: Write the failing test**

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/competitor-intel/persistence", () => ({
  persistCompetitorIntel: vi.fn(async () => ({
    competitorCampaignId: "cc-1",
    vaultNoteSlug: "meta-ad-library-apex-2026-06-02",
    dedupeKey: "k",
    status: "needs_review" as const,
  })),
}));

import { POST } from "./route";

function intelRequest(body: unknown, authorization?: string) {
  return new Request("http://localhost/api/v1/arc/competitor-intel", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authorization ? { authorization } : {}),
    },
    body: JSON.stringify(body),
  });
}

const ENV_KEYS = ["ARC_AGENT_API_TOKEN", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;

describe("POST /api/v1/arc/competitor-intel", () => {
  const original: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) original[k] = process.env[k];

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
  });

  it("returns 401 on a bad token", async () => {
    process.env.ARC_AGENT_API_TOKEN = "secret";
    const res = await POST(intelRequest({ source: "meta_ad_library", competitorName: "X" }, "Bearer wrong"));
    expect(res.status).toBe(401);
  });

  it("returns 400 on an invalid payload", async () => {
    process.env.ARC_AGENT_API_TOKEN = "secret";
    const res = await POST(intelRequest({ source: "tiktok", competitorName: "X" }, "Bearer secret"));
    expect(res.status).toBe(400);
  });

  it("returns 503 when Supabase is not configured", async () => {
    process.env.ARC_AGENT_API_TOKEN = "secret";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const res = await POST(intelRequest({ source: "meta_ad_library", competitorName: "X" }, "Bearer secret"));
    expect(res.status).toBe(503);
  });

  it("returns 201 with a valid token, payload, and Supabase configured", async () => {
    process.env.ARC_AGENT_API_TOKEN = "secret";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    const res = await POST(intelRequest({ source: "meta_ad_library", competitorName: "Apex" }, "Bearer secret"));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, status: "needs_review" });
    expect(body.result.competitorCampaignId).toBe("cc-1");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test src/app/api/v1/arc/competitor-intel/route.test.ts`
Expected: FAIL — cannot find module `./route`.

- [ ] **Step 3: Implement**

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";

import { checkBearerToken } from "@/lib/auth/api-token";
import { parseCompetitorIntelPayload } from "@/domain";
import { persistCompetitorIntel } from "@/lib/competitor-intel/persistence";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const auth = checkBearerToken(request, "ARC_AGENT_API_TOKEN");

  if (!auth.ok) {
    return NextResponse.json(
      auth.reason === "not_configured"
        ? { ok: false, status: "not_configured", message: "Set ARC_AGENT_API_TOKEN before enabling Arc API runs." }
        : { ok: false, status: "unauthorized", message: "Arc API runs require a valid bearer token." },
      { status: auth.status },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, status: "rejected", message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  let parsed;
  try {
    parsed = parseCompetitorIntelPayload(payload);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          ok: false,
          status: "rejected",
          errors: error.issues.map((issue) => ({
            code: issue.code,
            message: issue.message,
            path: issue.path.map(String),
          })),
        },
        { status: 400 },
      );
    }
    throw error;
  }

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { ok: false, status: "not_configured", message: "Supabase admin env vars are required before Arc can persist intel." },
      { status: 503 },
    );
  }

  try {
    const result = await persistCompetitorIntel(parsed);
    return NextResponse.json({ ok: true, status: result.status, result }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, status: "failed", message: error instanceof Error ? error.message : "Competitor intel persistence failed." },
      { status: 502 },
    );
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/app/api/v1/arc/competitor-intel/route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/arc/competitor-intel/route.ts src/app/api/v1/arc/competitor-intel/route.test.ts
git commit -m "feat: POST /api/v1/arc/competitor-intel endpoint"
```

---

## Task 9: Operator review UI under agent-operations

**Files:**
- Create: `src/app/agent-operations/competitor-intel/actions.ts`
- Create: `src/app/agent-operations/competitor-intel/page.tsx`

This is a server-component page + server actions, following the wired-feature pattern
(`requireOperator()` + `isSupabaseAdminConfigured()` + `revalidatePath`). UI is verified
by build + lint + manual check rather than a unit test (consistent with the codebase,
which does not unit-test pages).

- [ ] **Step 1: Write the server actions**

Create `src/app/agent-operations/competitor-intel/actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireOperator } from "@/lib/auth/operator";
import { setCompetitorCampaignStatus } from "@/lib/repos/competitor-campaigns";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

async function updateStatus(formData: FormData, status: "confirmed" | "archived") {
  await requireOperator();

  const id = String(formData.get("id") ?? "");
  if (!id) {
    redirect("/agent-operations/competitor-intel?action=error");
  }

  if (!isSupabaseAdminConfigured()) {
    redirect("/agent-operations/competitor-intel?action=not-configured");
  }

  await setCompetitorCampaignStatus(getSupabaseAdminClient(), id, status);
  revalidatePath("/agent-operations/competitor-intel");
  redirect(`/agent-operations/competitor-intel?action=${status}`);
}

export async function confirmCompetitorIntelAction(formData: FormData) {
  await updateStatus(formData, "confirmed");
}

export async function archiveCompetitorIntelAction(formData: FormData) {
  await updateStatus(formData, "archived");
}
```

- [ ] **Step 2: Write the page**

Create `src/app/agent-operations/competitor-intel/page.tsx`:

```typescript
import Link from "next/link";

import { EmptyState, PageHeader, Panel, StatusPill } from "@/app/_components/page-header";
import { listCompetitorCampaigns, type CompetitorCampaignRow } from "@/lib/repos/competitor-campaigns";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { archiveCompetitorIntelAction, confirmCompetitorIntelAction } from "./actions";

export default async function CompetitorIntelPage() {
  const rows = await loadRows();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Arc · Agent Operations"
        title="Competitor Intel"
        description="Findings Arc filed from ad libraries, SimilarWeb, and competitor landing pages. Review and confirm before they're trusted."
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No competitor intel awaiting review"
          detail="When Arc files competitor findings, they appear here as needs-review."
        />
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <Panel key={row.id} className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-[var(--text-primary)]">{row.competitor_name}</h3>
                <StatusPill tone="amber">{row.status}</StatusPill>
              </div>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--text-secondary)]">
                <span>{sourceLabel(row.source)}</span>
                <span>·</span>
                <span>Captured {row.captured_at.slice(0, 10)}</span>
                <span>·</span>
                <span>Activity: {row.activity_level ?? "—"}</span>
              </div>

              {row.summary ? <p className="text-sm text-[var(--text-primary)]">{row.summary}</p> : null}

              {row.vault_note_slug ? (
                <Link
                  href={`/vault/${row.vault_note_slug}`}
                  className="inline-block text-sm font-medium text-[var(--chicago-blue-soft)] underline"
                >
                  Open vault note
                </Link>
              ) : null}

              <div className="flex gap-2 pt-1">
                <form action={confirmCompetitorIntelAction}>
                  <input type="hidden" name="id" value={row.id} />
                  <button
                    type="submit"
                    className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[oklch(0.18_0.03_248)]"
                  >
                    Confirm
                  </button>
                </form>
                <form action={archiveCompetitorIntelAction}>
                  <input type="hidden" name="id" value={row.id} />
                  <button
                    type="submit"
                    className="rounded-md border border-[var(--border-strong)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)]"
                  >
                    Archive
                  </button>
                </form>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}

async function loadRows(): Promise<CompetitorCampaignRow[]> {
  if (!isSupabaseAdminConfigured()) return [];
  try {
    return await listCompetitorCampaigns(getSupabaseAdminClient(), "needs_review");
  } catch {
    return [];
  }
}

function sourceLabel(source: string): string {
  const labels: Record<string, string> = {
    meta_ad_library: "Meta Ad Library",
    google_ads_transparency: "Google Ads Transparency",
    similarweb: "SimilarWeb",
    landing_page: "Landing Page",
  };
  return labels[source] ?? source;
}
```

- [ ] **Step 3: Verify the exported primitives match**

Run: `pnpm lint src/app/agent-operations/competitor-intel/page.tsx`
Expected: no errors. Verified primitive signatures (from `src/app/_components/page-header.tsx`):
`PageHeader({ eyebrow, title, description, aside })`, `Panel({ children, className, ...sectionProps })`
(no `title` prop — render the competitor name as your own heading), `EmptyState({ title, detail, action })`
(uses `detail`, not `description`), `StatusPill({ children, tone })` where `tone` is one of
`amber | green | red | gray | blue | dark`. Colors use CSS-var tokens (`var(--text-primary)`,
`var(--text-secondary)`, `var(--accent)`, `var(--border-strong)`, `var(--chicago-blue-soft)`),
not `charcoal-*`/`canvas-*` Tailwind classes — match those.

- [ ] **Step 4: Build to confirm the route compiles**

Run: `pnpm build`
Expected: build succeeds; `/agent-operations/competitor-intel` listed among routes.

- [ ] **Step 5: Commit**

```bash
git add src/app/agent-operations/competitor-intel/
git commit -m "feat: competitor intel operator review UI under agent-operations"
```

---

## Task 10: Claude skill — `competitor-intel-scout`

**Files:**
- Create: `.claude/skills/competitor-intel-scout/SKILL.md`

This is the procedure that steers Arc (the Claude computer-use agent). Authoring should
follow the `superpowers:writing-skills` skill for structure; the content below is the v1
baseline.

- [ ] **Step 1: Write the skill**

```markdown
---
name: competitor-intel-scout
description: Use when gathering competitor marketing-campaign intelligence (ad creatives, channel mix, spend estimates, keywords) from ad libraries, SimilarWeb, or competitor landing pages and filing it back to the Growth Engine.
---

# Competitor Intel Scout

You are Arc, gathering competitor campaign intelligence via computer use and filing it
to the Growth Engine backend. You NEVER take outbound action — this is read-only intel.

## Sources (in priority order)

1. **Meta Ad Library** (`facebook.com/ads/library`) — free, no login. Search the
   competitor's page; capture each active ad's headline, body, media URL, and landing URL.
2. **Google Ads Transparency Center** (`adstransparency.google.com`) — free. Capture
   active Google/YouTube ads for the competitor.
3. **Competitor landing pages** — visit the competitor site directly; capture the offer,
   primary headline/copy, and positioning.
4. **SimilarWeb** (`similarweb.com`) — channel mix, paid vs organic, top keywords, est.
   spend. CAUTION: respect SimilarWeb's terms — prefer spot-checks over bulk scraping,
   honor rate limits, and do not automate behind a login at scale. If access is blocked,
   skip and note it; do not work around protections.

## What to extract per competitor + source

- `competitorName` (required), `competitorUrl`
- `source` (one of: meta_ad_library | google_ads_transparency | similarweb | landing_page)
- `summary` — 1-3 sentences on what they're running
- `channelMix` — e.g. `{ "paid": 60, "organic": 40 }`
- `estSpend` — free text (ranges are fine)
- `topKeywords` — array of strings
- `adCreatives` — array of `{ headline, body, mediaUrl, landingUrl }`
- `persona` — optional; only if it clearly maps to one of our official personas
- `rawPayload` — anything else worth keeping for audit

## Filing the intel

POST to `/api/v1/arc/competitor-intel` with the bearer token
(`Authorization: Bearer $ARC_AGENT_API_TOKEN`). One POST per competitor+source.

Example body:

\`\`\`json
{
  "source": "meta_ad_library",
  "competitorName": "Apex Plumbing",
  "competitorUrl": "https://apexplumbing.example",
  "summary": "Running 6 active emergency-water FB ads pushing 24/7 response.",
  "channelMix": { "paid": 70, "organic": 30 },
  "estSpend": "$5k-$10k/mo",
  "topKeywords": ["emergency plumber", "burst pipe repair"],
  "adCreatives": [
    { "headline": "24/7 Water Emergency", "body": "Call now for fast response", "landingUrl": "https://apexplumbing.example/emergency" }
  ]
}
\`\`\`

A `201` means it was filed as `needs_review`. The operator confirms it in the Growth
Engine (Arc → Agent Operations → Competitor Intel). Do not treat unconfirmed intel as
ground truth.

## Guardrails

- Read-only. No sending, no spending, no publishing.
- Respect each site's terms of service and rate limits.
- If a source blocks automated access, skip it and report — never bypass protections.
```

- [ ] **Step 2: Verify the skill file is valid markdown with frontmatter**

Run: `git diff --stat .claude/skills/`
Expected: shows the new SKILL.md added.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/competitor-intel-scout/SKILL.md
git commit -m "feat: competitor-intel-scout Claude skill for Arc"
```

---

## Task 11: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: all tests pass, including the new domain, persistence, repo, and route tests.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: build succeeds; `/api/v1/arc/competitor-intel` and
`/agent-operations/competitor-intel` both appear in the route manifest.

- [ ] **Step 4: Commit any lint/build fixups**

```bash
git add -A
git commit -m "chore: competitor intel verification fixups" || echo "nothing to commit"
```

---

## Post-implementation notes

- **Apply the migration** to your Supabase project via your normal migration workflow
  before exercising the endpoint against a real database.
- **Set `ARC_AGENT_API_TOKEN`** in the environment Arc POSTs from; reuse the same
  token already used by `/api/v1/arc/runs`.
- **Optional nav:** if you later want a direct link, add `/agent-operations/competitor-intel`
  to the agent-operations view (currently a `BlankPage`) — out of scope for v1.
- **Next sub-project:** lead discovery — a separate spec + plan on this same
  "agent findings intake" foundation.
```
