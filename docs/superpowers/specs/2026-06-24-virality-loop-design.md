# The Virality Loop — design

**Date:** 2026-06-24
**Status:** Approved design, pending spec review
**Author:** Arc / Evan

## Context

This is **Slice 1** of a larger program — "make Arc more like Higgsfield." Higgsfield's
value isn't raw generation; it's that anyone produces agency-grade, on-brand, **virality-scored**
creative in minutes via presets, consistency, and a virality feedback loop. The program
decomposes into independent slices, each with its own spec → plan → build:

- **Slice 0 — Close the Cloud Run runner Higgsfield credential decision** (gates all generation in prod).
- **Slice 1 — The virality loop** (this spec).
- **Slice 2 — The Studio surface** (fast, gallery-forward "type a vibe → batch of variants").
- **Slice 3 — Brand/product consistency engine** (Higgsfield characters / reference elements).
- **Slice 4 — Multi-format auto-packaging** (`reframe` / `personal_clipper`).
- **Slice 5 — Opportunity → creative → learning loop** (the "smarter agent" axis).

Today the *plumbing* for generation exists: the `higgsfield` connector (`src/domain/connectors.ts`),
a 59-model roster (`src/domain/higgsfield-models.ts`), runner media tools
(`apps/arc-runner/src/tools/media.ts`), the draft-asset route
(`src/app/api/v1/arc/campaigns/draft-asset/route.ts`), and approval-gated persistence into
`campaign_assets.audit_payload.media_assets[]`. What's missing is the thing that makes
Higgsfield feel like Higgsfield: **scoring creative for virality before a human approves it,
generating several variants, and surfacing the best.**

### Goal

When Arc produces ad creative, it should:

1. Generate **N** variants (default 3),
2. **Score** each — videos via Higgsfield's `virality_predictor`; images via a computed
   creative-quality proxy,
3. **Rank** them and submit the **top-K** (default 2) as approval-gated draft assets,
4. Surface each asset's score (virality / hook strength / retention) on the **approval card**,
   so the operator approves the strongest creative and Arc gets a signal to iterate on the rest.

No outbound. Every variant is still an approval-gated, provenance-tagged draft. Scores are
labelled **predictions**, never guaranteed performance.

## Spike findings (the data model is real, not guessed)

The Higgsfield MCP was live during design, so we ran `virality_predictor` against a real
completed BSR video generation (the vertical water-damage ad, job
`0962ba9c-4e10-4fa0-93a9-942868b4e0bb`) to capture the actual output. Findings:

- **It is an async job.** `virality_predictor(action:"create", params:{model:"virality_predictor",
  medias:[{role:"video", id:<job_id|media_id>}]})` returns a `job_id`; poll `job_status`
  (`raw_data:true`, `sync:true`) until `status:"completed"` (~1–3 min). The analysis lands at
  `raw_data.params.analysis` (note: `result_json` is null; there's also an HTML dashboard at
  `result_url`).
- **Input is video-only.** The schema requires `role:"video"`. It **rejects images**, and there
  is no image-virality model in the roster. This drove the image decision below.
- **The metrics** (all normalized 0–100 prediction proxies unless noted), under `analysis.scores`:
  - `viral_potential` — overall virality → **the score**
  - `hook_score` — grab strength in the first 0–3s (`score_details.hook_window_seconds:[0,3]`) → **hook strength**
  - `sustain` — attention held across the clip → **retention** (high = low risk)
  - `brain_engagement`, `overall_score` — secondary engagement proxies
  - `peak_second`, `peak_frame_index`, plus `global_scores_by_frame[]` (per-second), and
    neuro-region breakdowns under `analysis.regions[]`.
  - `score_details.disclaimer`: *"Predictive proxy metrics, not guaranteed performance or
    clinical measures."* — **must be surfaced.** The predictor is framed as an fMRI-style
    prediction; we present it as a prediction, never as truth.
- **Real result on the BSR ad:** `viral_potential 42`, **`hook_score 30` (weak)**, `sustain 96`.
  Translation: the clip holds attention once watching, but the first 3s don't grab — *regenerate
  with a stronger hook.* This is the motivating example and becomes the domain-layer test fixture.

## Decisions (locked with Evan)

- **Scope:** video **and** images, but scored differently (see below).
- **Loop shape:** generate-N → rank → top-K (N=3, K=2 hard-coded for v1; no operator controls yet).
- **Image scoring:** the predictor is video-only, so images do **not** get a virality score.
  Instead they get a **computed creative-quality proxy** (pure domain logic) — brand-fit,
  risk-flag count, format/channel match, resolution — labelled a "creative check," visually
  distinct from virality so the two are never conflated. This keeps "video + images" true while
  honoring the repo's augment-never-fabricate rule (no fake virality % on stills).
- **Graceful degradation:** real video scoring runs through the runner → Higgsfield MCP path,
  which is gated on **Slice 0** (the Cloud Run runner credential). This slice ships fully and is
  testable now; when the connector is absent, video variants are generated and submitted **without**
  a virality block (and the action card says so) — no crash, no fabricated numbers. The image
  proxy needs no MCP and works regardless.

## Architecture & data flow

Scoring must happen **runner-side** — `virality_predictor` is a Higgsfield MCP tool, and only the
runner loads remote connectors (and only in `draft`/`act` modes; see
`apps/arc-runner/src/connectors.ts` `remoteConnectorsAllowedForMode`). The app has no MCP access.
The flow extends the existing media spine rather than replacing it:

```
Arc (runner, draft/act mode)
  └─ generate_ad_variants  (NEW tool)
       ├─ generate_video × N        → existing POST /api/v1/arc/media/generate-video
       │     └─ for each: mcp__higgsfield__virality_predictor → poll job_status → analysis.scores
       ├─ generate_image × N        → existing POST /api/v1/arc/media/generate-image
       │     └─ for each: creativeQualityScore()  (pure domain, no MCP)
       ├─ rankVariants()            (pure domain) → ordered list, topK, one-line rationale
       └─ POST /api/v1/arc/campaigns/draft-asset × topK   (existing route)
            └─ campaign_assets + approval_items            (existing persistence)
                 └─ approval card renders ViralityBadge + ranking   (NEW UI)
```

No new tables. Scores persist in the **existing** `campaign_assets.audit_payload.media_assets[*]`
provenance object (confirmed seam: `src/lib/campaigns/create.ts` `promoteAssetToCampaign`,
read back via `src/lib/campaigns/read-model.ts` `ASSET_SELECT` → `CampaignMediaAsset`).

## Data model (additive)

Extend the per-media provenance object stored in `audit_payload.media_assets[*]` with a typed
`virality` block. No migration required for v1 (it rides existing `jsonb`); a migration is only
needed if/when we want to query/sort by score in SQL — deferred.

```jsonc
"virality": {
  "kind": "predicted" | "proxy",   // predicted = real video predictor; proxy = computed image check
  // video (kind: "predicted"):
  "viral_potential": 42,           // 0-100
  "hook_score": 30,                // 0-100, window 0-3s
  "sustain": 96,                   // 0-100 retention
  "brain_engagement": 36,
  "peak_second": 0,
  "dashboard_url": "https://….html",
  // image (kind: "proxy"):
  "quality_score": 78,             // 0-100
  "quality_factors": ["format match", "logo present", "0 risk flags"],
  // both:
  "disclaimer": "Predictive proxy metrics, not guaranteed performance.",
  "scored_at": "2026-06-24T19:01:43Z"
}
```

## Domain logic (`src/domain/`, pure, unit-tested, re-exported through `@/domain`)

A new module `src/domain/virality.ts` exporting:

- `type ViralityScore` — the typed shape above.
- `normalizeViralityPrediction(rawAnalysisScores, opts)` → `ViralityScore` of `kind:"predicted"`.
  Maps the spiked `analysis.scores` shape; tolerant of missing/renamed fields so a Higgsfield
  payload change touches **one adapter**, not the whole app.
- `creativeQualityScore(input)` → `ViralityScore` of `kind:"proxy"` for images, computed from
  risk-flag count, format/channel match, brand/logo presence, and resolution. Deterministic.
- `rankVariants(variants)` → `{ ordered, topK, rationale }`. Videos rank by `viral_potential`,
  images by `quality_score`; the two kinds are **never compared across kind**. `rationale` is a
  short human string ("Hook is weak (30/100) — first 3s don't grab").

Tests live in `src/domain/__tests__/virality.test.ts`, including a fixture built from the **real
spiked payload** (42/30/96).

## Runner orchestration (`apps/arc-runner/src/tools/`)

New `generate_ad_variants` tool (draft/act only), alongside the existing media tools in
`apps/arc-runner/src/tools/media.ts` (or a sibling `variants.ts`):

- Generates N variants (default 3, capped) of the requested kind via the existing media routes.
- For videos: calls `mcp__higgsfield__virality_predictor`, polls `job_status` to terminal, runs
  `normalizeViralityPrediction`. For images: runs `creativeQualityScore`.
- Runs `rankVariants`, submits the top-K (default 2) via the existing `draft-asset` route with the
  `virality` block attached to each media provenance object.
- **Degrades:** if the Higgsfield connector is absent, generates + submits without scores and notes
  it in the returned `ArcActionCard`.
- Updates the pinned per-mode tool-surface test constants and `index.test.ts` exact-set
  expectations (per the "arc-runner tool surface pinned" learning — run the full package suite).

## UI (`src/app/campaigns/_components/`)

- New `ViralityBadge` rendered next to the existing `MediaProvenanceBadge` on each `MediaTile`
  (`asset-preview.tsx`): score + a small hook/retention micro-bar, color-graded (weak hook draws
  the restoration-red accent). Image proxies render a visually distinct **"Creative check"** chip
  so a quality proxy is never read as a virality prediction.
- `AssetPreview` orders tiles best-first, marks the **"Top pick,"** and shows the one-line
  `rationale`.
- The `disclaimer` appears on hover/expand; a **"View dashboard"** link opens the predictor's HTML
  `dashboard_url`.
- Follows `DESIGN.md`: no emojis, Command Charcoal / Restoration Red, hairlines not card-soup,
  accent used sparingly.

## Testing

- **Domain:** unit tests for `normalizeViralityPrediction`, `creativeQualityScore`, `rankVariants`,
  with the real spiked payload as a fixture.
- **Runner:** tool-surface const + `index.test.ts` exact-set update; a mocked
  generate → score → rank → submit path; the connector-absent degradation path.
- **App:** read-model round-trip test that the `virality` block survives `audit_payload`
  serialization → `CampaignMediaAsset`; mock `next/cache` per the "revalidatePath throws in
  vitest" learning.

## Out of scope (YAGNI for v1)

- The 3D brain-activity GLB heatmap and per-frame timeline charts (link to the dashboard instead).
- Operator-tunable N/K controls (hard-coded defaults).
- Image animate-then-score (rejected: gimmicky, doubles cost).
- A migration to make scores SQL-queryable (only needed when we sort/report on score).
- Slices 0 and 2–5 (separate specs).

## Dependencies & risks

- **Slice 0 (runner credential)** gates *real video scoring in production.* This slice is built to
  ship and be tested without it; video scores simply appear once Slice 0 lands. Flag in the PR.
- **Predictor payload drift:** mitigated by the single `normalizeViralityPrediction` adapter +
  tolerant parsing.
- **Latency/cost:** N video generations + N predictor jobs per request. Defaults kept small (N=3,
  K=2); predictor polling reuses the existing video-poll pattern (cap retries).
