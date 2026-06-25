# Virality Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When Arc produces ad creative, generate N variants, score each (video via Higgsfield's `virality_predictor`, images via a computed quality proxy), rank them, submit the top-K as approval-gated drafts, and show virality/hook/retention badges on the approval card.

**Architecture:** Pure scoring/ranking logic lives in `src/domain/virality.ts` (unit-tested, no I/O). Arc (the model, runner-side, draft/act modes) generates N variants and calls the `mcp__higgsfield__virality_predictor` MCP tool per video, then hands the batch to a new app route `POST /api/v1/arc/campaigns/submit-variants` via one new in-process runner tool `submit_ad_variants`. That route runs the domain logic, persists the top-K through the existing `promoteAssetToCampaign` (scores ride in `audit_payload.media_assets[*].virality`), and the campaign read-model surfaces them on the approval card via a new `ViralityBadge`.

**Tech Stack:** Next.js 16 / React 19, TypeScript, Vitest, Zod, Supabase (admin client), Claude Agent SDK (runner, separate `apps/arc-runner` package), Higgsfield MCP.

**Data model is real, not guessed:** `virality_predictor` was spiked live during design (see `docs/superpowers/specs/2026-06-24-virality-loop-design.md`). It is an async job; the analysis lands at `job_status.raw_data.params.analysis.scores` with fields `viral_potential`, `hook_score`, `sustain`, `brain_engagement`, `overall_score`, `peak_second` (all 0–100 except `peak_second`), plus a mandatory disclaimer. It is **video-only**.

---

## File Structure

**Create:**
- `src/domain/virality.ts` — pure types + `normalizeViralityPrediction`, `creativeQualityScore`, `rankVariants`.
- `src/domain/__tests__/virality.test.ts` — domain unit tests (incl. the real spiked fixture).
- `src/app/api/v1/arc/campaigns/submit-variants/route.ts` — batch score→rank→submit-top-K route.
- `src/app/api/v1/arc/campaigns/submit-variants/route.test.ts` — route test.
- `src/app/campaigns/_components/virality-badge.tsx` — the badge + ranking UI.
- `apps/arc-runner/src/tools/variants.ts` — the `submit_ad_variants` in-process tool.
- `apps/arc-runner/src/tools/variants.test.ts` — runner tool test.

**Modify:**
- `src/domain/index.ts` — barrel-export `./virality`.
- `src/lib/campaigns/create.ts` — extend `AssetMediaProvenance` + `promoteAssetToCampaign` with the `virality` block.
- `src/lib/campaigns/read-model.ts` — extend `CampaignMediaAsset` + `mapMediaAsset`/`createMediaAsset` to carry `virality`.
- `src/app/campaigns/_components/asset-preview.tsx` — render `ViralityBadge`, order best-first, mark top pick.
- `apps/arc-runner/src/tools/index.ts` — register `variantsTools` in `draftTools`.
- `apps/arc-runner/src/tools/index.test.ts` — add `submit_ad_variants` to the `DRAFT` exact-set.
- `apps/arc-runner/src/app-map.ts` — add `submit_ad_variants` to the `writes` list.
- `apps/arc-runner/src/prompt.ts` — instruct the generate→predict→submit loop.
- `apps/arc-runner/src/prompt.test.ts` — add `submit_ad_variants` to the asserted tool list (if present there).

---

## Task 1: Domain — `VirialityScore` type + `normalizeViralityPrediction`

**Files:**
- Create: `src/domain/virality.ts`
- Test: `src/domain/__tests__/virality.test.ts`

- [ ] **Step 1: Write the failing test** (real spiked payload as fixture)

Create `src/domain/__tests__/virality.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeViralityPrediction } from "../virality";

// Captured live from mcp__higgsfield__virality_predictor on the BSR water-damage
// ad (job 0962ba9c…), raw_data.params.analysis.scores. See the design spec.
const SPIKED_SCORES = {
  sustain: 96,
  hook_score: 30,
  peak_score: 0.376742,
  peak_second: 0,
  overall_score: 44,
  viral_potential: 42,
  brain_engagement: 36,
  peak_frame_index: 0,
};

describe("normalizeViralityPrediction", () => {
  it("maps the real predictor payload into a predicted score", () => {
    const score = normalizeViralityPrediction(SPIKED_SCORES, {
      dashboardUrl: "https://example.com/dash.html",
      scoredAt: "2026-06-24T19:01:43Z",
    });
    expect(score).toEqual({
      kind: "predicted",
      viralPotential: 42,
      hookScore: 30,
      sustain: 96,
      brainEngagement: 36,
      peakSecond: 0,
      dashboardUrl: "https://example.com/dash.html",
      disclaimer: "Predictive proxy metrics, not guaranteed performance.",
      scoredAt: "2026-06-24T19:01:43Z",
    });
  });

  it("is tolerant of missing fields (clamps to 0, drops optional keys)", () => {
    const score = normalizeViralityPrediction({ viral_potential: 70 }, {});
    expect(score.kind).toBe("predicted");
    expect(score.viralPotential).toBe(70);
    expect(score.hookScore).toBe(0);
    expect(score.sustain).toBe(0);
    expect(score.dashboardUrl).toBeUndefined();
  });

  it("clamps out-of-range values into 0..100", () => {
    const score = normalizeViralityPrediction({ viral_potential: 250, hook_score: -5 }, {});
    expect(score.viralPotential).toBe(100);
    expect(score.hookScore).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/domain/__tests__/virality.test.ts`
Expected: FAIL — "Cannot find module '../virality'".

- [ ] **Step 3: Write minimal implementation**

Create `src/domain/virality.ts`:

```ts
/**
 * Pure virality/creative scoring + ranking for Arc's ad variants. No I/O.
 *
 * `predicted` scores come from Higgsfield's video-only `virality_predictor`
 * (normalized 0..100 proxies). `proxy` scores are a computed creative-quality
 * signal for still images — Higgsfield has no image-virality model, and a fake
 * virality % on a still would violate augment-never-fabricate. The two are kept
 * structurally distinct so they are never compared or conflated.
 */

export const VIRALITY_DISCLAIMER = "Predictive proxy metrics, not guaranteed performance.";

export type PredictedViralityScore = {
  kind: "predicted";
  viralPotential: number; // 0..100
  hookScore: number; // 0..100, first 0-3s grab
  sustain: number; // 0..100 retention (high = low risk)
  brainEngagement: number; // 0..100
  peakSecond: number;
  dashboardUrl?: string;
  disclaimer: string;
  scoredAt?: string;
};

export type ProxyQualityScore = {
  kind: "proxy";
  qualityScore: number; // 0..100
  factors: string[];
  disclaimer: string;
  scoredAt?: string;
};

export type ViralityScore = PredictedViralityScore | ProxyQualityScore;

/** Raw `analysis.scores` block returned by virality_predictor (loose: fields drift). */
export type RawViralityScores = {
  viral_potential?: number;
  hook_score?: number;
  sustain?: number;
  brain_engagement?: number;
  peak_second?: number;
  [key: string]: unknown;
};

function clamp100(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function normalizeViralityPrediction(
  raw: RawViralityScores,
  meta: { dashboardUrl?: string; scoredAt?: string },
): PredictedViralityScore {
  return {
    kind: "predicted",
    viralPotential: clamp100(raw.viral_potential),
    hookScore: clamp100(raw.hook_score),
    sustain: clamp100(raw.sustain),
    brainEngagement: clamp100(raw.brain_engagement),
    peakSecond: typeof raw.peak_second === "number" ? raw.peak_second : 0,
    ...(meta.dashboardUrl ? { dashboardUrl: meta.dashboardUrl } : {}),
    disclaimer: VIRALITY_DISCLAIMER,
    ...(meta.scoredAt ? { scoredAt: meta.scoredAt } : {}),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/domain/__tests__/virality.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/virality.ts src/domain/__tests__/virality.test.ts
git commit -m "feat(domain): VirialityScore type + normalizeViralityPrediction"
```

---

## Task 2: Domain — `creativeQualityScore` (image proxy)

**Files:**
- Modify: `src/domain/virality.ts`
- Test: `src/domain/__tests__/virality.test.ts`

- [ ] **Step 1: Write the failing test** (append to the existing test file)

Add to `src/domain/__tests__/virality.test.ts`:

```ts
import { creativeQualityScore } from "../virality";

describe("creativeQualityScore", () => {
  it("rewards a clean, format-matched, branded image", () => {
    const score = creativeQualityScore({
      riskFlags: [],
      formatMatchesChannel: true,
      hasBrand: true,
      width: 1080,
      height: 1080,
    });
    expect(score.kind).toBe("proxy");
    expect(score.qualityScore).toBeGreaterThanOrEqual(90);
    expect(score.factors).toContain("0 risk flags");
  });

  it("penalizes risk flags and format mismatch", () => {
    const clean = creativeQualityScore({ riskFlags: [], formatMatchesChannel: true, hasBrand: true, width: 1080, height: 1080 });
    const risky = creativeQualityScore({
      riskFlags: ["embedded text", "claim risk"],
      formatMatchesChannel: false,
      hasBrand: false,
      width: 400,
      height: 400,
    });
    expect(risky.qualityScore).toBeLessThan(clean.qualityScore);
    expect(risky.kind).toBe("proxy");
  });

  it("never returns a viralPotential field (proxy is not a prediction)", () => {
    const score = creativeQualityScore({ riskFlags: [], formatMatchesChannel: true, hasBrand: true, width: 1080, height: 1080 });
    expect("viralPotential" in score).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/domain/__tests__/virality.test.ts`
Expected: FAIL — "creativeQualityScore is not a function".

- [ ] **Step 3: Write minimal implementation** (append to `src/domain/virality.ts`)

```ts
export type CreativeQualityInput = {
  riskFlags: string[];
  formatMatchesChannel: boolean;
  hasBrand: boolean;
  width: number | null;
  height: number | null;
};

/** A deterministic 0..100 creative-quality proxy for still images. Starts at 100
 *  and subtracts for risk flags, format mismatch, missing brand, and low resolution. */
export function creativeQualityScore(input: CreativeQualityInput): ProxyQualityScore {
  let score = 100;
  const factors: string[] = [];

  const flagCount = input.riskFlags.length;
  score -= flagCount * 15;
  factors.push(flagCount === 0 ? "0 risk flags" : `${flagCount} risk flag${flagCount > 1 ? "s" : ""}`);

  if (input.formatMatchesChannel) factors.push("format match");
  else score -= 20;

  if (input.hasBrand) factors.push("brand present");
  else score -= 10;

  const minSide = Math.min(input.width ?? 0, input.height ?? 0);
  if (minSide > 0 && minSide < 720) score -= 15;

  return {
    kind: "proxy",
    qualityScore: Math.max(0, Math.min(100, Math.round(score))),
    factors,
    disclaimer: VIRALITY_DISCLAIMER,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/domain/__tests__/virality.test.ts`
Expected: PASS (6 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/domain/virality.ts src/domain/__tests__/virality.test.ts
git commit -m "feat(domain): creativeQualityScore image proxy"
```

---

## Task 3: Domain — `rankVariants` + barrel export

**Files:**
- Modify: `src/domain/virality.ts`, `src/domain/index.ts`
- Test: `src/domain/__tests__/virality.test.ts`

- [ ] **Step 1: Write the failing test** (append)

Add to `src/domain/__tests__/virality.test.ts`:

```ts
import { rankVariants } from "../virality";

describe("rankVariants", () => {
  const vid = (id: string, vp: number, hook: number) => ({
    id,
    kind: "video" as const,
    score: { kind: "predicted" as const, viralPotential: vp, hookScore: hook, sustain: 90, brainEngagement: 30, peakSecond: 0, disclaimer: "x" },
  });

  it("orders videos best-first by viralPotential and picks topK", () => {
    const result = rankVariants([vid("a", 42, 30), vid("b", 71, 80), vid("c", 55, 60)], 2);
    expect(result.ordered.map((v) => v.id)).toEqual(["b", "c", "a"]);
    expect(result.topK.map((v) => v.id)).toEqual(["b", "c"]);
  });

  it("flags a weak hook in the rationale", () => {
    const result = rankVariants([vid("a", 42, 30)], 1);
    expect(result.rationale.toLowerCase()).toContain("hook");
  });

  it("ranks image proxies by qualityScore without crossing kinds", () => {
    const img = (id: string, q: number) => ({
      id,
      kind: "image" as const,
      score: { kind: "proxy" as const, qualityScore: q, factors: [], disclaimer: "x" },
    });
    const result = rankVariants([img("a", 50), img("b", 88)], 1);
    expect(result.topK.map((v) => v.id)).toEqual(["b"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/domain/__tests__/virality.test.ts`
Expected: FAIL — "rankVariants is not a function".

- [ ] **Step 3: Write minimal implementation** (append to `src/domain/virality.ts`)

```ts
export type ScoredVariant = {
  id: string;
  kind: "video" | "image";
  score: ViralityScore;
};

export type RankedVariants = {
  ordered: ScoredVariant[];
  topK: ScoredVariant[];
  rationale: string;
};

function rankValue(score: ViralityScore): number {
  return score.kind === "predicted" ? score.viralPotential : score.qualityScore;
}

const WEAK_HOOK_THRESHOLD = 40;

/** Order variants best-first by their kind-appropriate score and take the top K.
 *  Videos rank by viralPotential, images by qualityScore; the two are never
 *  compared across kind by callers (a batch is single-kind). */
export function rankVariants(variants: ScoredVariant[], topK: number): RankedVariants {
  const ordered = [...variants].sort((a, b) => rankValue(b.score) - rankValue(a.score));
  const best = ordered[0];
  let rationale = "No variants to rank.";
  if (best) {
    if (best.score.kind === "predicted") {
      rationale =
        best.score.hookScore < WEAK_HOOK_THRESHOLD
          ? `Top pick scores ${best.score.viralPotential}/100, but the hook is weak (${best.score.hookScore}/100) — the first 3s don't grab. Worth a stronger opener.`
          : `Top pick scores ${best.score.viralPotential}/100 with a solid hook (${best.score.hookScore}/100).`;
    } else {
      rationale = `Top pick passes the creative check at ${best.score.qualityScore}/100 (${best.score.factors.join(", ")}).`;
    }
  }
  return { ordered, topK: ordered.slice(0, Math.max(0, topK)), rationale };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/domain/__tests__/virality.test.ts`
Expected: PASS (9 tests total).

- [ ] **Step 5: Add the barrel export**

In `src/domain/index.ts`, add after line 55 (`export * from "./email-templates";`):

```ts
export * from "./virality";
```

- [ ] **Step 6: Run the barrel-completeness guard + full domain suite**

Run: `pnpm test src/domain`
Expected: PASS, including the barrel guard test (it verifies every `src/domain/*.ts` is re-exported — see commit f5e818ac).

- [ ] **Step 7: Commit**

```bash
git add src/domain/virality.ts src/domain/__tests__/virality.test.ts src/domain/index.ts
git commit -m "feat(domain): rankVariants + export virality through @/domain"
```

---

## Task 4: Persistence — carry the `virality` block through `promoteAssetToCampaign`

**Files:**
- Modify: `src/lib/campaigns/create.ts:217-296`

- [ ] **Step 1: Extend the provenance type**

In `src/lib/campaigns/create.ts`, add an import at the top (near the other `@/domain` imports):

```ts
import type { ViralityScore } from "@/domain";
```

Then extend `AssetMediaProvenance` (currently lines 217-224) by adding one field before the closing brace:

```ts
  /** Virality prediction (video) or computed creative-quality proxy (image). */
  virality?: ViralityScore;
```

- [ ] **Step 2: Persist it into the media asset object**

In `promoteAssetToCampaign`, inside the `mediaAsset` object literal (currently lines 252-261), add one spread line after the `library_asset_id` line:

```ts
        ...(provenance.virality ? { virality: provenance.virality } : {}),
```

- [ ] **Step 3: Typecheck**

Run: `pnpm build` (or `npx tsc --noEmit`)
Expected: no type errors from `create.ts` (note: `pnpm lint` does NOT typecheck — see project memory).

- [ ] **Step 4: Commit**

```bash
git add src/lib/campaigns/create.ts
git commit -m "feat(campaigns): persist virality score in media provenance"
```

---

## Task 5: App route — `POST /api/v1/arc/campaigns/submit-variants`

This route receives the full batch of generated variants (each with its media + either a raw predictor `analysis.scores` for video, or image-quality signals), runs the domain logic, persists the top-K via `promoteAssetToCampaign`, and returns the ranked summary so Arc can explain its pick.

**Files:**
- Create: `src/app/api/v1/arc/campaigns/submit-variants/route.ts`
- Test: `src/app/api/v1/arc/campaigns/submit-variants/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/api/v1/arc/campaigns/submit-variants/route.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

// revalidatePath throws in the vitest node env — mock next/cache per-file
// (see project memory "revalidatePath throws in vitest").
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const checkBearerToken = vi.fn(() => null); // null = authorized
vi.mock("@/lib/auth/api-token", () => ({ checkBearerToken: (...a: unknown[]) => checkBearerToken(...a) }));

const isSupabaseAdminConfigured = vi.fn(() => true);
vi.mock("@/lib/supabase/server", () => ({
  isSupabaseAdminConfigured: () => isSupabaseAdminConfigured(),
  getSupabaseAdminClient: () => ({}),
}));

const promoteAssetToCampaign = vi.fn(async () => ({ assetId: "asset-x" }));
const ensureCampaignForDraft = vi.fn(async () => ({ campaignId: "camp-1" }));
vi.mock("@/lib/campaigns/create", async (orig) => ({
  ...(await orig<typeof import("@/lib/campaigns/create")>()),
  promoteAssetToCampaign: (...a: unknown[]) => promoteAssetToCampaign(...a),
}));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://t/api/v1/arc/campaigns/submit-variants", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer x" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  promoteAssetToCampaign.mockClear();
});

describe("POST submit-variants", () => {
  it("ranks video variants and submits only the top-K", async () => {
    const res = await POST(
      req({
        campaign_id: "camp-1",
        asset_type: "video_ad",
        top_k: 1,
        variants: [
          { title: "A", media_url: "https://x/a.mp4", media: { source: "ai_generated", format: "9:16" }, analysis: { viral_potential: 42, hook_score: 30, sustain: 96 } },
          { title: "B", media_url: "https://x/b.mp4", media: { source: "ai_generated", format: "9:16" }, analysis: { viral_potential: 71, hook_score: 80, sustain: 88 } },
        ],
      }),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(promoteAssetToCampaign).toHaveBeenCalledTimes(1);
    expect(json.ranked.topK[0].title).toBe("B");
    expect(json.submitted).toHaveLength(1);
  });

  it("returns 202 when Supabase is not configured", async () => {
    isSupabaseAdminConfigured.mockReturnValueOnce(false);
    const res = await POST(req({ campaign_id: "c", asset_type: "video_ad", variants: [] }));
    expect(res.status).toBe(202);
  });

  it("returns 401 when the bearer token is rejected", async () => {
    checkBearerToken.mockReturnValueOnce(new Response("no", { status: 401 }));
    const res = await POST(req({ campaign_id: "c", asset_type: "video_ad", variants: [] }));
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/app/api/v1/arc/campaigns/submit-variants/route.test.ts`
Expected: FAIL — cannot find `./route`.

- [ ] **Step 3: Write the route**

First, confirm the existing draft-asset route's auth + campaign-resolution helpers so this route matches them:

Run: `cat src/app/api/v1/arc/campaigns/draft-asset/route.ts`
Use the same `checkBearerToken("ARC_AGENT_API_TOKEN")` call, the same `isSupabaseAdminConfigured()` 202 guard, and the same campaign-resolution path it uses (reuse that helper — do NOT duplicate campaign creation logic). The snippet below assumes a `resolveCampaignId(...)` helper exists in `draft-asset`'s module or `@/lib/campaigns/create`; if `draft-asset` inlines it, extract it into `@/lib/campaigns/create` and import from both (DRY).

Create `src/app/api/v1/arc/campaigns/submit-variants/route.ts`:

```ts
import { revalidatePath } from "next/cache";

import { normalizeViralityPrediction, creativeQualityScore, rankVariants, type ScoredVariant, type ViralityScore } from "@/domain";
import { checkBearerToken } from "@/lib/auth/api-token";
import { promoteAssetToCampaign, type AssetMediaProvenance } from "@/lib/campaigns/create";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

type VariantInput = {
  title: string;
  media_url: string;
  media_path?: string;
  media?: AssetMediaProvenance; // source/model/jobId/format/riskFlags
  analysis?: Record<string, unknown>; // raw virality_predictor analysis.scores (video)
  dashboard_url?: string;
  format_matches_channel?: boolean; // image proxy signals
  has_brand?: boolean;
  width?: number;
  height?: number;
};

type Body = {
  campaign_id?: string;
  name?: string;
  persona?: string;
  restoration_focus?: string;
  asset_type?: string;
  top_k?: number;
  variants: VariantInput[];
};

export async function POST(request: Request) {
  const denied = checkBearerToken(request, "ARC_AGENT_API_TOKEN");
  if (denied) return denied;

  const body = (await request.json()) as Body;
  const variants = body.variants ?? [];

  if (!isSupabaseAdminConfigured()) {
    return Response.json({ ok: true, status: "not_configured", submitted: [] }, { status: 202 });
  }

  // Score each variant by kind. Three cases:
  //  - video WITH predictor analysis → predicted score
  //  - image                          → computed quality proxy
  //  - video WITHOUT analysis (predictor unavailable / Slice 0 not live)
  //                                   → no score; degrade gracefully, never fabricate
  const isVideo = (body.asset_type ?? "").includes("video");
  const scored: Array<ScoredVariant & { input: VariantInput; score: ViralityScore | null }> = variants.map((v, i) => {
    let score: ViralityScore | null;
    if (isVideo) {
      score = v.analysis ? normalizeViralityPrediction(v.analysis, { dashboardUrl: v.dashboard_url }) : null;
    } else {
      score = creativeQualityScore({
        riskFlags: v.media?.riskFlags ?? [],
        formatMatchesChannel: v.format_matches_channel ?? true,
        hasBrand: v.has_brand ?? false,
        width: v.width ?? null,
        height: v.height ?? null,
      });
    }
    return { id: String(i), kind: isVideo ? "video" : "image", score, input: v };
  });

  // Rank only the variants that actually have a score; unscored (degraded) ones
  // are appended unranked so they still get submitted, just without a badge.
  const withScore = scored.filter((s): s is typeof s & { score: ViralityScore } => s.score !== null);
  const withoutScore = scored.filter((s) => s.score === null);
  const ranked = rankVariants(withScore, body.top_k ?? 2);
  // If nothing scored (full degradation), fall back to submitting the first top_k raw variants.
  const toSubmit = ranked.topK.length > 0 ? ranked.topK : withoutScore.slice(0, body.top_k ?? 2);

  // Resolve / create the campaign once (reuse the draft-asset helper — see Step 3 note).
  const campaignId = body.campaign_id; // or resolveCampaignId({ ...body }) when creating new
  if (!campaignId) {
    return Response.json({ ok: false, error: "campaign_id required (new-campaign path TODO via shared helper)" }, { status: 400 });
  }

  const submitted: Array<{ assetId: string; title: string }> = [];
  for (const variant of toSubmit) {
    const v = (variant as { input: VariantInput }).input;
    const score = (variant as { score: ViralityScore | null }).score;
    const { assetId } = await promoteAssetToCampaign({
      operator: "arc",
      campaignId,
      assetType: body.asset_type ?? (isVideo ? "video_ad" : "image_prompt"),
      title: v.title,
      body: null,
      mediaUrl: v.media_url,
      mediaPath: v.media_path ?? null,
      media: { ...(v.media ?? {}), ...(score ? { virality: score } : {}) },
    });
    submitted.push({ assetId, title: v.title });
  }

  revalidatePath("/campaigns");
  if (campaignId) revalidatePath(`/campaigns/${campaignId}`);

  return Response.json(
    {
      ok: true,
      status: "created",
      campaignId,
      submitted,
      ranked: {
        rationale: ranked.rationale,
        topK: ranked.topK.map((v) => ({ title: (v as ScoredVariant & { input: VariantInput }).input.title, score: v.score })),
        ordered: ranked.ordered.map((v) => ({ title: (v as ScoredVariant & { input: VariantInput }).input.title, score: v.score })),
      },
    },
    { status: 201 },
  );
}
```

> **Implementer note:** the `scored` array carries `input` alongside the `ScoredVariant` fields so the route can map a ranked variant back to its source. `rankVariants` only reads `id`/`kind`/`score`, so the extra `input` key is harmless. Keep the new-campaign branch (when `campaign_id` is omitted) wired to the SAME helper `draft-asset` uses — extract it to `@/lib/campaigns/create` if it's currently inlined, rather than duplicating campaign creation. Adjust the 400 placeholder accordingly.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/app/api/v1/arc/campaigns/submit-variants/route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/v1/arc/campaigns/submit-variants/
git commit -m "feat(arc): submit-variants route — score, rank, submit top-K"
```

---

## Task 6: Read-model — surface `virality` on `CampaignMediaAsset`

**Files:**
- Modify: `src/lib/campaigns/read-model.ts` (`CampaignMediaAsset` ~33-43, `mapMediaAsset` ~2609-2644, `createMediaAsset` ~2646-2668)
- Test: add a focused test (create `src/lib/campaigns/__tests__/virality-readmodel.test.ts` if no sibling test exists; otherwise co-locate)

- [ ] **Step 1: Write the failing test**

Create `src/lib/campaigns/__tests__/virality-readmodel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mapMediaAssetForTest } from "../read-model";

describe("media asset virality passthrough", () => {
  it("carries the virality block from audit_payload onto the media asset", () => {
    const asset = mapMediaAssetForTest(
      {
        url: "https://x/a.mp4",
        source: "ai_generated",
        model: "marketing_studio_video",
        virality: { kind: "predicted", viralPotential: 71, hookScore: 80, sustain: 88, brainEngagement: 40, peakSecond: 2, disclaimer: "x" },
      },
      "campaign_asset",
      "attached",
    );
    expect(asset?.virality).toMatchObject({ kind: "predicted", viralPotential: 71 });
  });

  it("leaves virality null when absent", () => {
    const asset = mapMediaAssetForTest("https://x/b.png", "campaign_asset", "attached");
    expect(asset?.virality).toBeNull();
  });
});
```

> **Note:** `mapMediaAsset` is currently module-private. Export a thin test alias `export const mapMediaAssetForTest = mapMediaAsset;` next to it (one line) so the test can reach it without exporting the whole internals.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/campaigns/__tests__/virality-readmodel.test.ts`
Expected: FAIL — `mapMediaAssetForTest` not exported / `virality` undefined.

- [ ] **Step 3: Implement**

In `src/lib/campaigns/read-model.ts`:

a) Import the type at the top:

```ts
import type { ViralityScore } from "@/domain";
```

b) Add `virality` to `CampaignMediaAsset` (after `source: string;`, ~line 42):

```ts
  virality: ViralityScore | null;
```

c) In `mapMediaAsset`, read it from the object (after the `hasProvenance` block, before the `return createMediaAsset(...)`):

```ts
  const virality = isObject(value.virality) ? (value.virality as unknown as ViralityScore) : null;
```

and pass `virality` into the `createMediaAsset({ ... })` call.

d) In `createMediaAsset`, add `virality?: ViralityScore | null;` to the input type and `virality: input.virality ?? null,` to the returned object.

e) Add the test alias next to `mapMediaAsset`:

```ts
export const mapMediaAssetForTest = mapMediaAsset;
```

f) Fix the other `createMediaAsset` call sites (the string-URL branch at ~2611 and any others) — they pass no `virality`, which is now optional, so they compile unchanged. Verify the demo helper at ~635 and `demoMedia` still type-check (add `virality: null` there if the object is built literally rather than via `createMediaAsset`).

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm test src/lib/campaigns/__tests__/virality-readmodel.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/campaigns/read-model.ts src/lib/campaigns/__tests__/virality-readmodel.test.ts
git commit -m "feat(campaigns): surface virality score on CampaignMediaAsset"
```

---

## Task 7: UI — `ViralityBadge` + wire into the approval card

**Files:**
- Create: `src/app/campaigns/_components/virality-badge.tsx`
- Modify: `src/app/campaigns/_components/asset-preview.tsx`

- [ ] **Step 1: Build the badge component**

Create `src/app/campaigns/_components/virality-badge.tsx`:

```tsx
"use client";

import type { CampaignMediaAsset } from "@/lib/campaigns/read-model";

/** Score chip for a media asset. Video → virality prediction (viral/hook/retention);
 *  image → a distinct "Creative check" chip so a quality proxy is never read as a
 *  virality prediction. Follows DESIGN.md (charcoal/red, hairlines, no emoji). */
export function ViralityBadge({ media }: { media: CampaignMediaAsset }) {
  const v = media.virality;
  if (!v) return null;

  if (v.kind === "proxy") {
    return (
      <span
        title={`Creative check — ${v.factors.join(", ")}. ${v.disclaimer}`}
        className="inline-flex items-center gap-1 rounded-full border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]"
      >
        Creative check · {v.qualityScore}
      </span>
    );
  }

  const weakHook = v.hookScore < 40;
  return (
    <span
      title={`Predicted virality ${v.viralPotential}/100 · hook ${v.hookScore} · retention ${v.sustain}. ${v.disclaimer}`}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] ${
        weakHook
          ? "border-[var(--accent)] text-[var(--accent)]"
          : "border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--text-muted)]"
      }`}
    >
      Virality {v.viralPotential}
      <span className="font-medium normal-case tracking-normal">· hook {v.hookScore}</span>
    </span>
  );
}

/** Sort key for best-first ordering: predicted by viralPotential, proxy by quality. */
export function viralityRank(media: CampaignMediaAsset): number {
  const v = media.virality;
  if (!v) return -1;
  return v.kind === "predicted" ? v.viralPotential : v.qualityScore;
}
```

- [ ] **Step 2: Wire it into `asset-preview.tsx`**

In `src/app/campaigns/_components/asset-preview.tsx`:

a) Add imports:

```ts
import { ViralityBadge, viralityRank } from "./virality-badge";
```

b) In `AssetPreview`, order media best-first before slicing (replace the `.slice(0, 4).map(...)` block at lines 31-33):

```tsx
          {[...asset.media]
            .sort((a, b) => viralityRank(b) - viralityRank(a))
            .slice(0, 4)
            .map((media, index) => (
              <MediaTile key={media.id} media={media} topPick={index === 0 && viralityRank(media) >= 0} />
            ))}
```

c) Add a `topPick` prop to `MediaTile` (signature at line 106) and render the `ViralityBadge` next to the existing `MediaProvenanceBadge` (the image branch's badge container is lines 121-123):

```tsx
function MediaTile({ media, topPick = false }: { media: CampaignMediaAsset; topPick?: boolean }) {
```

and inside the image branch, replace the badge `<span>` block with:

```tsx
        <span className="absolute left-2 top-2 flex flex-wrap items-center gap-1">
          {topPick ? (
            <span className="rounded-full border border-[var(--accent)] bg-[var(--accent)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--accent-contrast)]">
              Top pick
            </span>
          ) : null}
          <MediaProvenanceBadge media={media} />
          <ViralityBadge media={media} />
        </span>
```

For the video branch (lines 128-137), wrap the `<video>` in a relative container and overlay the same badge cluster so videos (the primary scored kind) also show the badge:

```tsx
  if (media.type === "video") {
    return (
      <div className="relative overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--media-void)]">
        <video src={media.url} poster={media.thumbnailUrl ?? undefined} controls className="h-36 w-full object-contain" />
        <span className="absolute left-2 top-2 flex flex-wrap items-center gap-1">
          {topPick ? (
            <span className="rounded-full border border-[var(--accent)] bg-[var(--accent)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--accent-contrast)]">
              Top pick
            </span>
          ) : null}
          <MediaProvenanceBadge media={media} />
          <ViralityBadge media={media} />
        </span>
      </div>
    );
  }
```

> **Note:** if `--accent-contrast` is not a defined theme token, use `text-[var(--canvas)]` (verify against DESIGN.md / globals — do NOT invent a `--surface` token; see project memory "no bare --surface token").

- [ ] **Step 3: Verify in the browser** (this change IS previewable)

Follow the preview workflow: `preview_start`, navigate to a campaign detail page with a scored asset (seed one via `pnpm seed:test-campaign` if needed), `preview_snapshot` to confirm the badge + top-pick render, `preview_screenshot` to capture proof. Confirm no console errors via `preview_console_logs`.

- [ ] **Step 4: Lint the changed files + typecheck**

Run: `npx eslint src/app/campaigns/_components/virality-badge.tsx src/app/campaigns/_components/asset-preview.tsx && npx tsc --noEmit`
(Scope eslint to changed files — `pnpm lint` scans vendored files; see project memory.)
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/campaigns/_components/virality-badge.tsx src/app/campaigns/_components/asset-preview.tsx
git commit -m "feat(campaigns): ViralityBadge + best-first ranking on approval cards"
```

---

## Task 8: Runner — `submit_ad_variants` tool + prompt + pinned tests

The runner tool is thin: it POSTs the batch Arc assembled (after Arc generated N videos and called `mcp__higgsfield__virality_predictor` per video) to the new route, and surfaces a draft card with the rationale. Arc orchestrates generation + predictor calls per the prompt; the route owns ranking/persistence.

**Files:**
- Create: `apps/arc-runner/src/tools/variants.ts`, `apps/arc-runner/src/tools/variants.test.ts`
- Modify: `apps/arc-runner/src/tools/index.ts`, `apps/arc-runner/src/tools/index.test.ts`, `apps/arc-runner/src/app-map.ts`, `apps/arc-runner/src/prompt.ts`, `apps/arc-runner/src/prompt.test.ts`

> **Setup:** fresh worktrees need `pnpm install` before runner tests run (no shared node_modules — see project memory). Run the FULL runner package suite, not just new files (the tool surface is pinned across several tests — see memory "arc-runner tool surface pinned").

- [ ] **Step 1: Write the failing tool test**

Create `apps/arc-runner/src/tools/variants.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { variantsTools } from "./variants";
import type { ArcClient } from "../arc-client";

const client = { apiPost: vi.fn(async () => ({ campaignId: "c1", submitted: [{ assetId: "a1", title: "B" }], ranked: { rationale: "Top pick scores 71/100 with a solid hook (80/100).", topK: [{ title: "B" }] } })) } as unknown as ArcClient;
const step = vi.fn(async () => {});

describe("submit_ad_variants", () => {
  it("posts the batch and returns the rationale", async () => {
    const cards: unknown[] = [];
    const [submit] = variantsTools(client, step, (c) => cards.push(c), {});
    expect(submit.name).toBe("submit_ad_variants");
    const result = await submit.handler(
      { campaign_id: "c1", asset_type: "video_ad", top_k: 1, variants: [{ title: "A", media_url: "https://x/a.mp4" }, { title: "B", media_url: "https://x/b.mp4" }] },
      {} as never,
    );
    expect(client.apiPost).toHaveBeenCalledWith("/api/v1/arc/campaigns/submit-variants", expect.objectContaining({ asset_type: "video_ad" }));
    expect(JSON.stringify(result)).toContain("solid hook");
    expect(cards).toHaveLength(1);
  });
});
```

> **Note:** match the exact `tool()` handler-invocation shape used in `apps/arc-runner/src/tools/media.test.ts` (read it first — the handler is the 4th arg to `tool(...)`; call it the same way that test does).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter arc-runner test src/tools/variants.test.ts` (or `cd apps/arc-runner && pnpm test src/tools/variants.test.ts`)
Expected: FAIL — cannot find `./variants`.

- [ ] **Step 3: Write the tool**

Create `apps/arc-runner/src/tools/variants.ts` (mirror the structure of `mediaTools` in `media.ts`):

```ts
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import type { ArcClient } from "../arc-client";
import type { ArcActionCard } from "../types";
import { textResult, type StepFn } from "./helpers";

/**
 * Submit a scored batch of ad variants. Arc first generates N variants
 * (generate_video / generate_image) and, for videos, calls
 * mcp__higgsfield__virality_predictor on each to get analysis.scores. It then
 * calls this tool with every variant + its raw scores; the server ranks them,
 * submits the top-K as approval-gated drafts with virality badges, and returns
 * the ranking rationale. Never outbound.
 */
export function variantsTools(
  client: ArcClient,
  step: StepFn,
  collectCard: (card: ArcActionCard) => void,
  ctx: { conversationId?: string | null; campaignId?: string | null } = {},
) {
  const submitAdVariants = tool(
    "submit_ad_variants",
    "Submit a scored batch of generated ad variants for ranking. FIRST generate N variants (generate_video for video ads, generate_image for image ads), and for EACH video call mcp__higgsfield__virality_predictor and poll it to completion to get analysis.scores. THEN call this with every variant. For videos include `analysis` (the raw analysis.scores object: viral_potential, hook_score, sustain, brain_engagement, peak_second) and optionally `dashboard_url`. For images include format_matches_channel / has_brand / width / height. The server scores, ranks, submits the top-K as approval-gated drafts, and returns the rationale — relay it. Attach to campaign_id or start a new draft campaign with name + persona + restoration_focus.",
    {
      campaign_id: z.string().optional(),
      name: z.string().optional(),
      persona: z.string().optional(),
      restoration_focus: z.string().optional(),
      asset_type: z.string().describe("e.g. video_ad | image_prompt"),
      top_k: z.number().optional().describe("how many top variants to submit (default 2)"),
      variants: z
        .array(
          z.object({
            title: z.string(),
            media_url: z.string(),
            media_path: z.string().optional(),
            media: z.record(z.unknown()).optional(),
            analysis: z.record(z.unknown()).optional(),
            dashboard_url: z.string().optional(),
            format_matches_channel: z.boolean().optional(),
            has_brand: z.boolean().optional(),
            width: z.number().optional(),
            height: z.number().optional(),
          }),
        )
        .describe("Every generated variant with its scores"),
    },
    async (args) => {
      const label = "Ranking ad variants";
      await step(label, "running");
      try {
        const res = await client.apiPost<{ campaignId: string; submitted: Array<{ assetId: string; title: string }>; ranked: { rationale: string; topK: Array<{ title: string }> } }>(
          "/api/v1/arc/campaigns/submit-variants",
          {
            ...(args.campaign_id ? { campaign_id: args.campaign_id } : ctx.campaignId ? { campaign_id: ctx.campaignId } : {}),
            name: args.name,
            persona: args.persona,
            restoration_focus: args.restoration_focus,
            asset_type: args.asset_type,
            top_k: args.top_k,
            variants: args.variants,
            ...(ctx.conversationId ? { conversation_id: ctx.conversationId } : {}),
          },
        );
        await step(label, "done");
        collectCard({
          kind: "draft",
          title: `Top ${res.submitted.length} of ${args.variants.length} variants`,
          rows: [],
          flags: [],
          preview: res.ranked.rationale,
          approval: res.submitted[0] ? { kind: "campaign", campaignId: res.campaignId, assetId: res.submitted[0].assetId } : undefined,
        });
        return textResult(JSON.stringify({ campaignId: res.campaignId, submitted: res.submitted, rationale: res.ranked.rationale }));
      } catch (error) {
        await step(label, "done");
        const reason = error instanceof Error ? error.message : "unknown error";
        return textResult(`${label} failed: ${reason}`);
      }
    },
  );

  return [submitAdVariants];
}
```

> **Note:** verify `ArcActionCard.approval` accepts `undefined` (the `generate_image` card always sets it). If `approval` is required, omit the key instead of setting `undefined` — match how `compose_creative` handles a no-approval card.

- [ ] **Step 4: Register the tool**

In `apps/arc-runner/src/tools/index.ts`, add the import (near line 12) and add to `draftTools` (the array at lines 66-71):

```ts
import { variantsTools } from "./variants";
// ...
    ...variantsTools(client, step, sink.card, ctx),
```

- [ ] **Step 5: Update the pinned tool-surface lists**

a) `apps/arc-runner/src/tools/index.test.ts` line 50 — add `"submit_ad_variants"` to the `DRAFT` array.
b) `apps/arc-runner/src/app-map.ts` line 45 — add `"submit_ad_variants"` to the `writes` array.
c) `apps/arc-runner/src/prompt.test.ts` — if it asserts an exact media-tool list (lines ~37-38), add `"submit_ad_variants"`.

- [ ] **Step 6: Add the loop instruction to the prompt**

In `apps/arc-runner/src/prompt.ts`, near the existing Higgsfield guidance (~line 39), append:

```
When making ad creative, prefer the VARIANT LOOP: generate 3 variants, and for video call mcp__higgsfield__virality_predictor on each (poll to completion), then call submit_ad_variants with all variants and their scores. The server ranks them and submits the best — tell the operator the predicted virality, the hook score, and your pick's rationale. Scores are PREDICTIONS, never guarantees; never present them as actual performance.
```

- [ ] **Step 7: Run the full runner suite**

Run: `cd apps/arc-runner && pnpm test`
Expected: PASS — including `index.test.ts`, `app-map.test.ts`, `prompt.test.ts`, `variants.test.ts`.

- [ ] **Step 8: Commit**

```bash
git add apps/arc-runner/src/tools/variants.ts apps/arc-runner/src/tools/variants.test.ts apps/arc-runner/src/tools/index.ts apps/arc-runner/src/tools/index.test.ts apps/arc-runner/src/app-map.ts apps/arc-runner/src/prompt.ts apps/arc-runner/src/prompt.test.ts
git commit -m "feat(arc-runner): submit_ad_variants tool + variant-loop prompt"
```

---

## Task 9: Full verification + branch wrap-up

- [ ] **Step 1: Run the whole app test suite**

Run: `pnpm test`
Expected: PASS (no new failures; pre-existing draft-asset 502s from the revalidatePath-in-vitest issue are unrelated — see project memory).

- [ ] **Step 2: Typecheck + build**

Run: `pnpm build`
Expected: success (this is the real typecheck gate; `pnpm lint` does not typecheck).

- [ ] **Step 3: Runner suite**

Run: `cd apps/arc-runner && pnpm test && npx tsc --noEmit && cd ../..`
Expected: PASS.

- [ ] **Step 4: Lint changed files**

Run: `npx eslint $(git diff --name-only main...HEAD -- '*.ts' '*.tsx')`
Expected: clean.

- [ ] **Step 5: Final commit / PR**

Use the `superpowers:finishing-a-development-branch` skill to open the PR. In the PR body, **flag the dependency**: real video virality scores require the Cloud Run runner Higgsfield credential (Slice 0) to be live; until then the loop degrades gracefully (image proxy works; video assets show no virality block).

---

## Self-Review

**Spec coverage:**
- Generate-N → rank → top-K → submit: Tasks 5 (route ranking/top-K) + 8 (runner orchestration). ✓
- Video scoring via predictor + real schema: Tasks 1 (normalize, spiked fixture) + 8 (Arc calls the MCP tool). ✓
- Image quality proxy (no fake virality %): Task 2 + route branch in Task 5. ✓
- Persistence in `audit_payload.media_assets[*].virality`, no migration: Task 4. ✓
- Read-model surfaces score: Task 6. ✓
- Approval-card badge + best-first + top-pick + disclaimer link: Task 7. ✓
- Graceful degradation (no connector → no score, no crash): the route's three-case branch scores video only when `analysis` is present; a video without `analysis` persists no `virality` block (never the image proxy), and a fully-unscored batch still submits the first top_k variants unranked. ✓
- Pinned runner tool surface updated: Task 8 Step 5. ✓
- Tests incl. real fixture + next/cache mock: Tasks 1, 5. ✓

**Placeholder scan:** One intentional `TODO` marker in Task 5 Step 3 for the new-campaign-resolution helper, with explicit instructions to reuse `draft-asset`'s helper (DRY) — flagged, not silent. Fix during implementation by reading `draft-asset/route.ts`.

**Type consistency:** `ViralityScore` (union of `PredictedViralityScore | ProxyQualityScore`) is used identically across domain, `create.ts`, `read-model.ts`, route, and badge. `ScoredVariant`/`RankedVariants` only in domain + route. `normalizeViralityPrediction`/`creativeQualityScore`/`rankVariants`/`viralityRank` names match across all references. Field names camelCase in TS (`viralPotential`, `hookScore`, `sustain`) vs the predictor's snake_case raw (`viral_potential`) — the boundary is `normalizeViralityPrediction`, and only it reads snake_case. ✓

**One correction applied inline:** the Task 5 route code was revised to a three-case score branch (video+analysis → predicted; image → proxy; video without analysis → no score) plus an unscored-fallback, so the degradation path is correct in the plan itself rather than left as an implementer caveat.
