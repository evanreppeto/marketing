# Closed-Loop Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stamp each lead with the campaign that produced it at ingest, then roll that lead's won outcome revenue up to the campaign so the campaign page shows CRM-proven ROAS beside Mark's self-reported numbers.

**Architecture:** Pure domain helpers (`buildCampaignLink`, `resolveAttribution`, `computeCampaignEconomics`) own all logic and are unit-tested with no I/O. The lead ingest contract gains an optional, best-effort `attribution` block. A migration adds nullable attribution columns to `leads`; persistence writes them. A new read-model joins attributed leads → jobs/outcomes and feeds the pure economics function. The campaign detail page renders the result.

**Tech Stack:** TypeScript, Next.js 16, React 19, Supabase, Zod, Vitest. Package manager: **pnpm**. Path alias `@/*` → `./src/*`.

**Spec:** `docs/superpowers/specs/2026-06-08-closed-loop-attribution-design.md`

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/domain/attribution.ts` | Pure attribution logic: link builder, resolver, economics math | Create |
| `src/domain/__tests__/attribution.test.ts` | Unit tests for the above | Create |
| `src/domain/index.ts` | Re-export attribution module | Modify |
| `src/domain/lead-ingestion.ts` | Accept optional `attribution`, resolve it, return it | Modify |
| `src/domain/__tests__/lead-ingestion.test.ts` | Tests for attribution on ingest | Modify |
| `supabase/migrations/20260608170000_lead_attribution.sql` | Add attribution columns to `leads` | Create |
| `src/lib/lead-ingestion/persistence.ts` | Write attribution columns on lead insert | Modify |
| `src/lib/lead-ingestion/persistence.test.ts` | Test that columns are written | Create |
| `src/lib/performance/attribution-read-model.ts` | Per-campaign CRM-proven economics (I/O) | Create |
| `src/lib/performance/attribution-read-model.test.ts` | Read-model tests with mock client | Create |
| `src/app/campaigns/_components/campaign-economics-panel.tsx` | Server panel rendering economics | Create |
| `src/app/campaigns/_components/tracked-link-builder.tsx` | Client widget to mint tagged links | Create |
| `src/app/campaigns/[campaignId]/page.tsx` | Fetch economics, render panel | Modify |

---

## Task 1: Domain — types + `buildCampaignLink`

**Files:**
- Create: `src/domain/attribution.ts`
- Test: `src/domain/__tests__/attribution.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/domain/__tests__/attribution.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildCampaignLink } from "../attribution";

const CAMPAIGN = "11111111-1111-1111-1111-111111111111";
const ASSET = "22222222-2222-2222-2222-222222222222";

describe("buildCampaignLink", () => {
  it("stamps utm params and a bsg_at token onto the destination", () => {
    const link = buildCampaignLink({ destinationUrl: "https://bigshoulders.com/quote", campaignId: CAMPAIGN, channel: "meta_ad" });
    const url = new URL(link);
    expect(url.searchParams.get("utm_campaign")).toBe(CAMPAIGN);
    expect(url.searchParams.get("utm_source")).toBe("meta_ad");
    expect(url.searchParams.get("utm_medium")).toBe("campaign");
    expect(url.searchParams.get("bsg_at")).toBeTruthy();
  });

  it("preserves existing query params on the destination", () => {
    const link = buildCampaignLink({ destinationUrl: "https://bigshoulders.com/quote?ref=abc", campaignId: CAMPAIGN });
    expect(new URL(link).searchParams.get("ref")).toBe("abc");
  });

  it("defaults utm_source to 'mark' when no channel is given", () => {
    const link = buildCampaignLink({ destinationUrl: "https://bigshoulders.com/q", campaignId: CAMPAIGN, assetId: ASSET });
    expect(new URL(link).searchParams.get("utm_source")).toBe("mark");
  });

  it("throws when campaignId is not a UUID", () => {
    expect(() => buildCampaignLink({ destinationUrl: "https://x.com", campaignId: "nope" })).toThrow(/UUID/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/domain/__tests__/attribution.test.ts`
Expected: FAIL — `buildCampaignLink` is not exported / module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/domain/attribution.ts`:

```ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CampaignLinkInput = {
  destinationUrl: string;
  campaignId: string;
  assetId?: string;
  channel?: string;
};

function toBase64Url(json: string): string {
  return btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Pure: stamp a destination URL with utm params + a compact bsg_at token. */
export function buildCampaignLink({ destinationUrl, campaignId, assetId, channel }: CampaignLinkInput): string {
  if (!UUID_RE.test(campaignId)) {
    throw new Error("buildCampaignLink: campaignId must be a valid UUID.");
  }
  const url = new URL(destinationUrl);
  const token = toBase64Url(
    JSON.stringify({ c: campaignId, ...(assetId ? { a: assetId } : {}), ...(channel ? { ch: channel } : {}) }),
  );
  url.searchParams.set("utm_source", channel ?? "mark");
  url.searchParams.set("utm_medium", "campaign");
  url.searchParams.set("utm_campaign", campaignId);
  url.searchParams.set("bsg_at", token);
  return url.toString();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/domain/__tests__/attribution.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/attribution.ts src/domain/__tests__/attribution.test.ts
git commit -m "feat(attribution): pure buildCampaignLink with utm + bsg_at token"
```

---

## Task 2: Domain — `resolveAttribution`

**Files:**
- Modify: `src/domain/attribution.ts`
- Test: `src/domain/__tests__/attribution.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/domain/__tests__/attribution.test.ts`:

```ts
import { resolveAttribution } from "../attribution";

describe("resolveAttribution", () => {
  it("prefers an explicit valid campaignId (method=explicit)", () => {
    const out = resolveAttribution({ campaignId: CAMPAIGN, campaignAssetId: ASSET, channel: "email" });
    expect(out).toMatchObject({ campaignId: CAMPAIGN, assetId: ASSET, channel: "email", method: "explicit" });
  });

  it("round-trips a bsg_at token from buildCampaignLink (method=token)", () => {
    const link = buildCampaignLink({ destinationUrl: "https://x.com/q", campaignId: CAMPAIGN, assetId: ASSET, channel: "meta_ad" });
    const token = new URL(link).searchParams.get("bsg_at")!;
    const out = resolveAttribution({ token });
    expect(out).toMatchObject({ campaignId: CAMPAIGN, assetId: ASSET, channel: "meta_ad", method: "token" });
  });

  it("falls back to utm_campaign when it is a UUID (method=utm)", () => {
    const out = resolveAttribution({ utmCampaign: CAMPAIGN, utmSource: "google" });
    expect(out).toMatchObject({ campaignId: CAMPAIGN, channel: "google", method: "utm" });
    expect(out.utm.utm_campaign).toBe(CAMPAIGN);
  });

  it("uses the source rule map as the last resort (method=source_rule)", () => {
    const out = resolveAttribution({ source: "spring_postcard" }, { spring_postcard: CAMPAIGN });
    expect(out).toMatchObject({ campaignId: CAMPAIGN, method: "source_rule" });
  });

  it("returns unattributed for unknown / empty / malformed input", () => {
    expect(resolveAttribution({}).method).toBe("unattributed");
    expect(resolveAttribution({ campaignId: "not-a-uuid" }).method).toBe("unattributed");
    expect(resolveAttribution({ token: "@@@not-base64@@@" }).method).toBe("unattributed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/domain/__tests__/attribution.test.ts`
Expected: FAIL — `resolveAttribution` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/domain/attribution.ts`:

```ts
export type AttributionMethod = "explicit" | "token" | "utm" | "source_rule" | "unattributed";

export type AttributionInput = {
  campaignId?: string;
  campaignAssetId?: string;
  channel?: string;
  token?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  source?: string;
};

export type ResolvedAttribution = {
  campaignId: string | null;
  assetId: string | null;
  channel: string | null;
  utm: Record<string, string>;
  method: AttributionMethod;
};

function fromBase64Url(token: string): string {
  return atob(token.replace(/-/g, "+").replace(/_/g, "/"));
}

function decodeToken(token: string): { c?: string; a?: string; ch?: string } | null {
  try {
    const parsed = JSON.parse(fromBase64Url(token)) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as { c?: string; a?: string; ch?: string };
  } catch {
    return null;
  }
}

/** Pure + total: never throws. Last-touch precedence: explicit > token > utm > source rule > unattributed. */
export function resolveAttribution(
  input: AttributionInput,
  sourceRules: Record<string, string> = {},
): ResolvedAttribution {
  const utm: Record<string, string> = {};
  if (input.utmSource) utm.utm_source = input.utmSource;
  if (input.utmMedium) utm.utm_medium = input.utmMedium;
  if (input.utmCampaign) utm.utm_campaign = input.utmCampaign;

  if (input.campaignId && UUID_RE.test(input.campaignId)) {
    return {
      campaignId: input.campaignId,
      assetId: input.campaignAssetId && UUID_RE.test(input.campaignAssetId) ? input.campaignAssetId : null,
      channel: input.channel ?? null,
      utm,
      method: "explicit",
    };
  }

  if (input.token) {
    const decoded = decodeToken(input.token);
    if (decoded?.c && UUID_RE.test(decoded.c)) {
      return {
        campaignId: decoded.c,
        assetId: decoded.a && UUID_RE.test(decoded.a) ? decoded.a : null,
        channel: decoded.ch ?? input.channel ?? null,
        utm,
        method: "token",
      };
    }
  }

  if (input.utmCampaign && UUID_RE.test(input.utmCampaign)) {
    return { campaignId: input.utmCampaign, assetId: null, channel: input.utmSource ?? input.channel ?? null, utm, method: "utm" };
  }

  const ruled = input.source ? sourceRules[input.source] : undefined;
  if (ruled && UUID_RE.test(ruled)) {
    return { campaignId: ruled, assetId: null, channel: input.channel ?? null, utm, method: "source_rule" };
  }

  return { campaignId: null, assetId: null, channel: input.channel ?? null, utm, method: "unattributed" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/domain/__tests__/attribution.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git add src/domain/attribution.ts src/domain/__tests__/attribution.test.ts
git commit -m "feat(attribution): last-touch resolveAttribution with precedence + token decode"
```

---

## Task 3: Domain — `computeCampaignEconomics`

**Files:**
- Modify: `src/domain/attribution.ts`
- Test: `src/domain/__tests__/attribution.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/domain/__tests__/attribution.test.ts`:

```ts
import { computeCampaignEconomics } from "../attribution";

describe("computeCampaignEconomics", () => {
  it("computes roas/cac/cpl from realized revenue and spend", () => {
    const out = computeCampaignEconomics({ attributedLeads: 10, wonRevenueCents: 400000, wonCount: 2, openPipelineCents: 90000, spendCents: 100000 });
    expect(out.roas).toBeCloseTo(4);
    expect(out.cac).toBe(50000);
    expect(out.cpl).toBe(10000);
    expect(out.realizedRevenueCents).toBe(400000);
    expect(out.pipelineRevenueCents).toBe(90000);
  });

  it("returns null ratios at the zero-divisor edges (never NaN/Infinity)", () => {
    const noSpend = computeCampaignEconomics({ attributedLeads: 5, wonRevenueCents: 100000, wonCount: 1, openPipelineCents: 0, spendCents: 0 });
    expect(noSpend.roas).toBeNull();
    const noWins = computeCampaignEconomics({ attributedLeads: 5, wonRevenueCents: 0, wonCount: 0, openPipelineCents: 0, spendCents: 50000 });
    expect(noWins.cac).toBeNull();
    const noLeads = computeCampaignEconomics({ attributedLeads: 0, wonRevenueCents: 0, wonCount: 0, openPipelineCents: 0, spendCents: 50000 });
    expect(noLeads.cpl).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/domain/__tests__/attribution.test.ts`
Expected: FAIL — `computeCampaignEconomics` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/domain/attribution.ts`:

```ts
export type CampaignEconomicsInput = {
  attributedLeads: number;
  wonRevenueCents: number;
  wonCount: number;
  openPipelineCents: number;
  spendCents: number;
};

export type CampaignEconomics = {
  realizedRevenueCents: number;
  pipelineRevenueCents: number;
  spendCents: number;
  attributedLeads: number;
  wonCount: number;
  roas: number | null;
  cac: number | null;
  cpl: number | null;
};

/** Pure: realized-only ROAS. Pipeline is reported separately, never folded into ROAS. */
export function computeCampaignEconomics(input: CampaignEconomicsInput): CampaignEconomics {
  const { attributedLeads, wonRevenueCents, wonCount, openPipelineCents, spendCents } = input;
  return {
    realizedRevenueCents: wonRevenueCents,
    pipelineRevenueCents: openPipelineCents,
    spendCents,
    attributedLeads,
    wonCount,
    roas: spendCents > 0 ? wonRevenueCents / spendCents : null,
    cac: wonCount > 0 ? Math.round(spendCents / wonCount) : null,
    cpl: attributedLeads > 0 ? Math.round(spendCents / attributedLeads) : null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/domain/__tests__/attribution.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/attribution.ts src/domain/__tests__/attribution.test.ts
git commit -m "feat(attribution): computeCampaignEconomics (realized ROAS, null at zero divisors)"
```

---

## Task 4: Wire attribution into the ingest contract

**Files:**
- Modify: `src/domain/index.ts` (line 11 area — add re-export)
- Modify: `src/domain/lead-ingestion.ts`
- Test: `src/domain/__tests__/lead-ingestion.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/domain/__tests__/lead-ingestion.test.ts`:

```ts
describe("lead ingestion attribution", () => {
  const base = {
    persona: "homeowner_emergency",
    source: "website_form",
    lossSignals: ["standing water"],
    contact: { email: "a@b.com" },
  };

  it("resolves an explicit campaign attribution block onto the accepted result", () => {
    const result = parseLeadIngestionPayload({
      ...base,
      attribution: { campaignId: "11111111-1111-1111-1111-111111111111", channel: "meta_ad" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.attribution).toMatchObject({ campaignId: "11111111-1111-1111-1111-111111111111", channel: "meta_ad", method: "explicit" });
    }
  });

  it("degrades a malformed attribution block to unattributed without rejecting the lead", () => {
    const result = parseLeadIngestionPayload({ ...base, attribution: { campaignId: 12345 } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.attribution.method).toBe("unattributed");
  });

  it("defaults to unattributed when no attribution block is present", () => {
    const result = parseLeadIngestionPayload(base);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.attribution.method).toBe("unattributed");
  });
});
```

> Note: this file already imports `parseLeadIngestionPayload`. If the persona string above isn't a valid official persona in `OFFICIAL_PERSONA_MAPPINGS`, replace it with any valid one already used elsewhere in this test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/domain/__tests__/lead-ingestion.test.ts`
Expected: FAIL — `result.attribution` is undefined / type error.

- [ ] **Step 3a: Re-export the module**

In `src/domain/index.ts`, add after the `competitor-intel` line:

```ts
export * from "./attribution";
```

- [ ] **Step 3b: Add the attribution schema + thread it through**

In `src/domain/lead-ingestion.ts`, add the import at the top (with the other relative imports):

```ts
import { resolveAttribution, type ResolvedAttribution } from "./attribution";
```

Add this schema above `leadIngestionSchema`:

```ts
const attributionInputSchema = z
  .object({
    campaignId: z.string().trim().optional(),
    campaignAssetId: z.string().trim().optional(),
    channel: z.string().trim().optional(),
    token: z.string().trim().optional(),
    utmSource: z.string().trim().optional(),
    utmMedium: z.string().trim().optional(),
    utmCampaign: z.string().trim().optional(),
  })
  .partial();
```

Inside the `leadIngestionSchema` object literal (before the closing `})` and `.refine(...)`), add this field after `metadata`:

```ts
  // Best-effort: a malformed attribution block coerces to undefined (.catch) so it
  // can never reject a lead. Resolution happens after parse.
  attribution: attributionInputSchema.optional().catch(undefined),
```

Add `attribution` to the accepted-result type in `LeadIngestionResult` (the `ok: true` branch), after `normalizedInput`:

```ts
      attribution: ResolvedAttribution;
```

In `parseLeadIngestionPayload`, just before the final `return { ok: true, ... }`, compute:

```ts
  const attribution = resolveAttribution({
    ...(parsed.data.attribution ?? {}),
    source: parsed.data.source,
  });
```

And add `attribution,` to that success return object (alongside `normalizedInput`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/domain/__tests__/lead-ingestion.test.ts src/domain/__tests__/attribution.test.ts`
Expected: PASS (existing ingest tests still green; new attribution tests green).

- [ ] **Step 5: Commit**

```bash
git add src/domain/index.ts src/domain/lead-ingestion.ts src/domain/__tests__/lead-ingestion.test.ts
git commit -m "feat(attribution): best-effort attribution block on lead ingest contract"
```

---

## Task 5: Migration — attribution columns on `leads`

**Files:**
- Create: `supabase/migrations/20260608170000_lead_attribution.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260608170000_lead_attribution.sql`:

```sql
-- Last-touch attribution: stamp each lead with the campaign/asset/channel that
-- produced it, captured at ingest. Nullable + on-delete-set-null so attribution is
-- additive and a deleted campaign never breaks lead integrity.
--
-- UPGRADE PATH (multi-touch, future): introduce a `lead_touches` table
-- (lead_id, campaign_id, asset_id, channel, touched_at, method) recording every
-- touch. These columns remain the denormalized last-touch fast path / fallback.

alter table public.leads
  add column if not exists attributed_campaign_id uuid references public.campaigns(id) on delete set null,
  add column if not exists attributed_asset_id uuid references public.campaign_assets(id) on delete set null,
  add column if not exists attribution_channel text,
  add column if not exists attribution_method text,
  add column if not exists attribution_utm jsonb not null default '{}'::jsonb;

create index if not exists leads_attributed_campaign_idx on public.leads (attributed_campaign_id);
```

- [ ] **Step 2: Verify the migration is well-formed**

Run: `git status --short supabase/migrations/` and confirm the new file is listed.
Confirm the timestamp prefix is later than the most recent existing migration (`20260608120000_mark_chat.sql`).
Do NOT edit any shipped migration. (No automated test — migrations apply through the normal Supabase flow.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260608170000_lead_attribution.sql
git commit -m "feat(attribution): migration adding attribution columns to leads"
```

---

## Task 6: Persistence — write attribution columns

**Files:**
- Modify: `src/lib/lead-ingestion/persistence.ts:71-91` (the `leads` insert object)
- Test: `src/lib/lead-ingestion/persistence.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/lead-ingestion/persistence.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { parseLeadIngestionPayload } from "@/domain";
import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { persistLeadIngestion } from "./persistence";

function insertFor(supabase: { calls: Array<[string, ...unknown[]]> }, table: string) {
  // The insert call immediately follows the matching `from(table)` call.
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < supabase.calls.length; i++) {
    const [method, arg] = supabase.calls[i];
    if (method === "from" && arg === table) {
      const next = supabase.calls[i + 1];
      if (next && next[0] === "insert") out.push(next[1] as Record<string, unknown>);
    }
  }
  return out;
}

describe("persistLeadIngestion attribution", () => {
  it("writes the resolved attribution columns onto the leads insert", async () => {
    const result = parseLeadIngestionPayload({
      persona: "homeowner_emergency",
      source: "website_form",
      lossSignals: ["standing water"],
      contact: { email: "a@b.com" },
      attribution: { campaignId: "11111111-1111-1111-1111-111111111111", channel: "meta_ad" },
    });
    if (!result.ok) throw new Error("expected accepted result");

    const supabase = createSupabaseQueryMock({
      contacts: { data: { id: "contact-1" }, error: null },
      leads: { data: { id: "lead-1" }, error: null },
    });

    await persistLeadIngestion({ input: result.normalizedInput, result, supabase });

    expect(insertFor(supabase, "leads")[0]).toMatchObject({
      attributed_campaign_id: "11111111-1111-1111-1111-111111111111",
      attribution_channel: "meta_ad",
      attribution_method: "explicit",
    });
  });
});
```

> Note: if `homeowner_emergency` is not in `OFFICIAL_PERSONA_MAPPINGS`, use a valid persona slug.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/lead-ingestion/persistence.test.ts`
Expected: FAIL — leads insert has no `attributed_campaign_id`.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/lead-ingestion/persistence.ts`, inside the `insertAndReturnId(supabase, "leads", { ... })` object, add these keys (e.g. after `lead_score:`):

```ts
    attributed_campaign_id: result.attribution.campaignId,
    attributed_asset_id: result.attribution.assetId,
    attribution_channel: result.attribution.channel,
    attribution_method: result.attribution.method,
    attribution_utm: result.attribution.utm,
```

(`result` is already in scope as the `AcceptedLeadIngestionResult`, which now carries `attribution`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/lead-ingestion/persistence.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lead-ingestion/persistence.ts src/lib/lead-ingestion/persistence.test.ts
git commit -m "feat(attribution): persist attribution columns on lead insert"
```

---

## Task 7: Read-model — per-campaign CRM-proven economics

**Files:**
- Create: `src/lib/performance/attribution-read-model.ts`
- Test: `src/lib/performance/attribution-read-model.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/performance/attribution-read-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { getCampaignEconomics } from "./attribution-read-model";

const CAMPAIGN = "11111111-1111-1111-1111-111111111111";

describe("getCampaignEconomics", () => {
  it("rolls won outcome revenue up to the campaign and computes ROAS from real spend", async () => {
    const supabase = createSupabaseQueryMock({
      leads: { data: [{ id: "lead-1" }, { id: "lead-2" }], error: null },
      jobs: { data: [{ lead_id: "lead-1", status: "in_progress", estimated_revenue_cents: 90000 }], error: null },
      outcomes: { data: [{ lead_id: "lead-2", status: "won", gross_revenue_cents: 400000 }], error: null },
      campaign_results: { data: [{ spend_cents: 100000 }], error: null },
    });

    const out = await getCampaignEconomics(CAMPAIGN, supabase);
    expect(out.status).toBe("live");
    if (out.status === "live") {
      expect(out.attributedLeads).toBe(2);
      expect(out.wonCount).toBe(1);
      expect(out.realizedRevenueCents).toBe(400000);
      expect(out.pipelineRevenueCents).toBe(90000);
      expect(out.spendCents).toBe(100000);
      expect(out.roas).toBeCloseTo(4);
      expect(out.selfReported.wonRevenueCents).toBe(0);
    }
  });

  it("reports unavailable when a query errors", async () => {
    const supabase = createSupabaseQueryMock({ leads: { data: null, error: { message: "boom" } } });
    const out = await getCampaignEconomics(CAMPAIGN, supabase);
    expect(out.status).toBe("unavailable");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/performance/attribution-read-model.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/performance/attribution-read-model.ts`:

```ts
import { type SupabaseClient } from "@supabase/supabase-js";

import { computeCampaignEconomics, type CampaignEconomics } from "@/domain";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../supabase/server";

const WON_OUTCOME_STATUSES = ["won", "paid"];
const OPEN_JOB_STATUSES = ["pending", "scheduled", "in_progress"];

export type CampaignEconomicsReadModel =
  | (CampaignEconomics & {
      status: "live";
      selfReported: { wonRevenueCents: number; leads: number };
    })
  | { status: "unavailable"; message: string };

type LeadIdRow = { id: string };
type JobRow = { lead_id: string | null; status: string | null; estimated_revenue_cents: number | null };
type OutcomeRow = { lead_id: string | null; status: string | null; gross_revenue_cents: number | null };
type ResultRow = { spend_cents: number | null; won_revenue_cents: number | null; leads: number | null };

export async function getCampaignEconomics(
  campaignId: string,
  client?: SupabaseClient,
): Promise<CampaignEconomicsReadModel> {
  if (!client && !isSupabaseAdminConfigured()) {
    return { status: "unavailable", message: "Supabase env vars are not configured." };
  }

  try {
    const supabase = client ?? getSupabaseAdminClient();

    const leadsRes = await supabase.from("leads").select("id").eq("attributed_campaign_id", campaignId).limit(5000);
    if (leadsRes.error) throw new Error(`leads lookup: ${leadsRes.error.message}`);
    const leadIds = ((leadsRes.data ?? []) as LeadIdRow[]).map((row) => row.id);

    const [jobsRes, outcomesRes, resultsRes] = await Promise.all([
      supabase.from("jobs").select("lead_id,status,estimated_revenue_cents").in("lead_id", leadIds),
      supabase.from("outcomes").select("lead_id,status,gross_revenue_cents").in("lead_id", leadIds),
      supabase.from("campaign_results").select("spend_cents,won_revenue_cents,leads").eq("campaign_id", campaignId),
    ]);
    if (jobsRes.error) throw new Error(`jobs lookup: ${jobsRes.error.message}`);
    if (outcomesRes.error) throw new Error(`outcomes lookup: ${outcomesRes.error.message}`);
    if (resultsRes.error) throw new Error(`campaign_results lookup: ${resultsRes.error.message}`);

    const jobs = (jobsRes.data ?? []) as JobRow[];
    const outcomes = (outcomesRes.data ?? []) as OutcomeRow[];
    const results = (resultsRes.data ?? []) as ResultRow[];

    const won = outcomes.filter((o) => WON_OUTCOME_STATUSES.includes(o.status ?? ""));
    const wonRevenueCents = won.reduce((sum, o) => sum + (o.gross_revenue_cents ?? 0), 0);
    const openPipelineCents = jobs
      .filter((j) => OPEN_JOB_STATUSES.includes(j.status ?? ""))
      .reduce((sum, j) => sum + (j.estimated_revenue_cents ?? 0), 0);
    const spendCents = results.reduce((sum, r) => sum + (r.spend_cents ?? 0), 0);

    const economics = computeCampaignEconomics({
      attributedLeads: leadIds.length,
      wonRevenueCents,
      wonCount: won.length,
      openPipelineCents,
      spendCents,
    });

    return {
      status: "live",
      ...economics,
      selfReported: {
        wonRevenueCents: results.reduce((sum, r) => sum + (r.won_revenue_cents ?? 0), 0),
        leads: results.reduce((sum, r) => sum + (r.leads ?? 0), 0),
      },
    };
  } catch (error) {
    return { status: "unavailable", message: error instanceof Error ? error.message : "Campaign economics unavailable." };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/performance/attribution-read-model.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/performance/attribution-read-model.ts src/lib/performance/attribution-read-model.test.ts
git commit -m "feat(attribution): per-campaign economics read-model (realized ROAS vs self-reported)"
```

---

## Task 8: UI — economics panel + tracked-link builder on the campaign page

**Files:**
- Create: `src/app/campaigns/_components/campaign-economics-panel.tsx`
- Create: `src/app/campaigns/_components/tracked-link-builder.tsx`
- Modify: `src/app/campaigns/[campaignId]/page.tsx`

This task is UI; verification is `pnpm build` + a visual check, not a unit test.

- [ ] **Step 1: Create the economics panel (server component)**

Create `src/app/campaigns/_components/campaign-economics-panel.tsx`:

```tsx
import { Panel, StatusPill } from "../../_components/page-header";
import type { CampaignEconomicsReadModel } from "@/lib/performance/attribution-read-model";

import { TrackedLinkBuilder } from "./tracked-link-builder";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">{label}</div>
      <div className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{value}</div>
      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{detail}</p>
    </div>
  );
}

export function CampaignEconomicsPanel({
  economics,
  campaignId,
}: {
  economics: CampaignEconomicsReadModel;
  campaignId: string;
}) {
  if (economics.status !== "live") {
    return (
      <Panel className="mt-4">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[var(--text-primary)]">Realized performance</span>
          <StatusPill tone="gray">Unavailable</StatusPill>
        </div>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">{economics.message}</p>
      </Panel>
    );
  }

  const roas = economics.roas === null ? "—" : `${economics.roas.toFixed(2)}×`;
  const cac = economics.cac === null ? "—" : money(economics.cac);
  const cpl = economics.cpl === null ? "—" : money(economics.cpl);

  return (
    <Panel className="mt-4">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-[var(--text-primary)]">Realized performance</span>
        <StatusPill tone="green">CRM-proven</StatusPill>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="ROAS" value={roas} detail="Won revenue ÷ spend" />
        <Metric label="Realized revenue" value={money(economics.realizedRevenueCents)} detail={`${economics.wonCount} won`} />
        <Metric label="Spend" value={money(economics.spendCents)} detail="From campaign_results" />
        <Metric label="CAC" value={cac} detail="Spend ÷ won" />
        <Metric label="CPL" value={cpl} detail="Spend ÷ attributed leads" />
        <Metric label="Attributed leads" value={String(economics.attributedLeads)} detail="Last-touch" />
      </div>
      <p className="mt-3 text-xs text-[var(--text-secondary)]">
        Pipeline (open jobs): {money(economics.pipelineRevenueCents)} — not included in ROAS. Self-reported:{" "}
        {money(economics.selfReported.wonRevenueCents)} won across {economics.selfReported.leads} leads.
      </p>
      <div className="mt-4 border-t border-[var(--border-subtle)] pt-4">
        <TrackedLinkBuilder campaignId={campaignId} />
      </div>
    </Panel>
  );
}
```

> If `--border-subtle` is not a token in `DESIGN.md`, use the border class the other panels use (check `theme.surface` usage in `page-header.tsx`).

- [ ] **Step 2: Create the tracked-link builder (client component)**

Create `src/app/campaigns/_components/tracked-link-builder.tsx`:

```tsx
"use client";

import { useState } from "react";

import { buildCampaignLink } from "@/domain";

export function TrackedLinkBuilder({ campaignId }: { campaignId: string }) {
  const [destination, setDestination] = useState("https://bigshoulders.com/quote");
  const [channel, setChannel] = useState("meta_ad");
  const [copied, setCopied] = useState(false);

  let link = "";
  let error = "";
  try {
    link = buildCampaignLink({ destinationUrl: destination, campaignId, channel: channel || undefined });
  } catch (e) {
    error = e instanceof Error ? e.message : "Invalid URL";
  }

  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Tracked link builder</div>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          value={destination}
          onChange={(e) => { setDestination(e.target.value); setCopied(false); }}
          placeholder="Destination URL"
          className="min-w-0 flex-1 rounded border border-[var(--border-subtle)] bg-[var(--surface-inset)] px-2 py-1 text-sm"
        />
        <input
          value={channel}
          onChange={(e) => { setChannel(e.target.value); setCopied(false); }}
          placeholder="channel (utm_source)"
          className="rounded border border-[var(--border-subtle)] bg-[var(--surface-inset)] px-2 py-1 text-sm sm:w-44"
        />
      </div>
      {error ? (
        <p className="mt-2 text-xs text-[var(--restoration-red,#b00020)]">{error}</p>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded bg-[var(--surface-inset)] px-2 py-1 text-xs">{link}</code>
          <button
            type="button"
            onClick={() => { void navigator.clipboard.writeText(link); setCopied(true); }}
            className="shrink-0 rounded border border-[var(--border-subtle)] px-3 py-1 text-xs font-semibold"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}
```

> Match input/border/background classes to the project's existing form controls and `DESIGN.md` tokens — adjust the placeholder class names above if the tokens differ. No emojis (per `DESIGN.md`).

- [ ] **Step 3: Wire it into the campaign detail page**

In `src/app/campaigns/[campaignId]/page.tsx`:

Add imports:

```tsx
import { getCampaignEconomics } from "@/lib/performance/attribution-read-model";
import { CampaignEconomicsPanel } from "../_components/campaign-economics-panel";
```

Add `getCampaignEconomics(campaignId)` to the `Promise.all`:

```tsx
  const [detail, dispatches, economics] = await Promise.all([
    getCampaignWorkspaceDetail(campaignId),
    getCampaignDispatches(campaignId),
    getCampaignEconomics(campaignId),
  ]);
```

Replace the final live return with a fragment that renders the panel after the workspace:

```tsx
  return (
    <>
      <CampaignWorkspace detail={detail} dispatches={dispatches} />
      <CampaignEconomicsPanel economics={economics} campaignId={campaignId} />
    </>
  );
```

- [ ] **Step 4: Verify build + types**

Run: `pnpm build`
Expected: build succeeds, no type errors in the touched files.
Run: `pnpm lint`
Expected: no new lint errors.

- [ ] **Step 5: Visual check**

Use the `run` skill (or `pnpm dev`) to open a campaign detail page (`/campaigns/<id>`). Confirm the "Realized performance" panel renders, the tracked-link builder produces a URL with `utm_campaign` + `bsg_at`, and Copy works. (With Supabase unset locally, the panel shows the "Unavailable" state — that's expected.)

- [ ] **Step 6: Commit**

```bash
git add src/app/campaigns/_components/campaign-economics-panel.tsx src/app/campaigns/_components/tracked-link-builder.tsx "src/app/campaigns/[campaignId]/page.tsx"
git commit -m "feat(attribution): realized-performance panel + tracked-link builder on campaign page"
```

---

## Final verification

- [ ] Run the full suite: `pnpm test`
- [ ] Run the build: `pnpm build`
- [ ] Confirm no shipped migration was edited (only the new `20260608170000_lead_attribution.sql` was added).

---

## Self-Review against the spec

- **Last-touch, per-lead** → Tasks 4–6 (resolve at ingest, columns on `leads`). ✓
- **Ingest-borne UTM + link builder** → `buildCampaignLink` (Task 1), attribution block (Task 4). ✓
- **Realized-only ROAS, pipeline separate** → `computeCampaignEconomics` (Task 3), read-model split (Task 7). ✓
- **Storage = columns on `leads`** → migration (Task 5). ✓
- **Best-effort, never breaks capture** → `.catch(undefined)` + total `resolveAttribution` (Tasks 2, 4). ✓
- **Spend from `campaign_results.spend_cents`** → read-model (Task 7). ✓
- **CRM-proven vs self-reported comparison** → `selfReported` field + panel copy (Tasks 7, 8). ✓
- **UI on campaign detail + link builder widget** → Task 8. ✓
- **Multi-touch documented as upgrade path** → migration comment (Task 5). ✓
- **Tests for resolver precedence, link round-trip, economics edges** → Tasks 1–3. ✓
