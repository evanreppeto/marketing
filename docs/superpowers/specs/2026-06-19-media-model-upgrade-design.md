# Media Model Upgrade (Image + Video) — Design

**Date:** 2026-06-19
**Status:** Approved (design) — pending spec review
**Scope:** Move Arc's image/video generation off the deprecated Imagen 4 + older Veo onto the current Gemini generative-media models. Image + video only (audio/TTS and music/Lyria are separate future sub-projects).

## Problem

Arc's media generation defaults to **Imagen 4** (`imagen-4.0-*-generate-001`), which Google has **deprecated**, plus older Veo (`veo-2.0`/`veo-3.0`). We should run on the current models: the **Nano Banana** image family (Gemini 3 image models) and **Veo 3.1**. The provider already has a working "Nano Banana" `generateContent` code path, so this is largely a model-id/config change, not a rewrite.

## Verified model IDs (from ai.google.dev docs)

| Marketing name | API model ID | Notes |
|---|---|---|
| Nano Banana Pro | `gemini-3-pro-image` | 4K, precise text, "thinking" — highest quality |
| Nano Banana 2 | `gemini-3.1-flash-image` | fast, high-volume |
| Nano Banana | `gemini-2.5-flash-image` | already used in code; keep as fallback default |
| Veo 3.1 | `veo-3.1-generate-preview` | cinematic, synced audio |
| Veo 3.1 Lite | `veo-3.1-fast-generate-preview` | high-efficiency |

The Veo ids (and possibly the flash-image id) carry `-preview` and may rename at GA — see Caveats.

## Current state (confirmed in code)

- `src/domain/arc-levels.ts` `levelMediaModels()`: Studio = `{ image: "imagen-4.0-ultra-generate-001", video: "veo-3.0-generate-001" }`; Swift = `{ image: "imagen-4.0-generate-001", video: "veo-2.0-generate-001" }`.
- `src/lib/media/gemini.ts`: `DEFAULT_IMAGE_MODEL = "imagen-4.0-generate-001"`, `DEFAULT_VIDEO_MODEL = "veo-2.0-generate-001"`; env overrides `GEMINI_IMAGE_MODEL` / `GEMINI_VIDEO_MODEL`; per-call override via `opts.imageModel`/`opts.videoModel`. The provider branches: `model.startsWith("imagen")` → Imagen `generateImages`; **else → the Nano Banana `generateContent` path** (already works for `gemini-2.5-flash-image`).
- Model resolution precedence (existing, keep): per-call override → Arc level → env → built-in default.

## Target mapping

**`levelMediaModels()`:**
- **Studio:** image `gemini-3-pro-image`, video `veo-3.1-generate-preview`
- **Swift:** image `gemini-3.1-flash-image`, video `veo-3.1-fast-generate-preview`

**`gemini.ts` defaults:**
- `DEFAULT_IMAGE_MODEL` → `gemini-2.5-flash-image` (Nano Banana — always-available, conservative fallback when no level/override/env is set)
- `DEFAULT_VIDEO_MODEL` → `veo-3.1-fast-generate-preview`

## Why it's small

All three new image models are `gemini-*-image`, so they take the provider's **existing `generateContent` ("Nano Banana") branch** — Imagen 4's `generateImages` branch simply stops being selected. Video is a pure model-id swap on the existing Veo `generateVideos` + long-running-operation polling flow; Veo 3.1's natively-synced audio still returns as a single video file, so no handling change. No new endpoints, providers, or media kinds.

## Components touched

- **`src/domain/arc-levels.ts`** — update `levelMediaModels()` to the target mapping (pure; unit-tested).
- **`src/lib/media/gemini.ts`** — update the two `DEFAULT_*_MODEL` constants; verify/widen the aspect-ratio allowlist (currently tuned for Imagen 4) to what Nano Banana Pro / Veo 3.1 accept; confirm the `generateContent` branch handles the `gemini-3*-image` ids (same image API surface as `gemini-2.5-flash-image`).
- **Tests** — `src/lib/media/__tests__/resolve.test.ts` and `get-media-provider.test.ts` hardcode the old imagen/veo ids; update to the new ids. `src/domain/__tests__/arc-levels.test.ts` likewise.
- **`src/app/settings/media-models-settings.tsx`** — update the model-picker option list/labels to the new model names + ids (the Advanced override of the Arc level).
- **Imagen path:** left in place as harmless dead/back-compat code (an `imagen-*` id still works via env/override). Not deleted (YAGNI; explicit non-goal).

## Deploy & safety

- **App-only change → Vercel auto-deploys.** The Cloud Run runner is untouched: it passes `level` (Swift/Studio) and the model resolves app-side. No runner redeploy.
- All existing guardrails unchanged: AI-tagged provenance, approval-gated drafts, prompt hardening (strip embedded text/logos/branding), risk flags. No outbound behavior added.
- Precedence preserved, so `GEMINI_IMAGE_MODEL` / `GEMINI_VIDEO_MODEL` remain escape hatches.

## Caveats

- **Preview ids:** `veo-3.1-generate-preview`, `veo-3.1-fast-generate-preview` (and possibly the flash-image id) are preview-tier and may change/GA-rename. If generation starts failing with a model-not-found error after a GA cutover, update the ids in `arc-levels.ts` (or set the env overrides) — a one-line change. Documented here so it's a known knob.
- **Aspect ratios / resolution:** Nano Banana Pro supports up to 4K and a wider aspect-ratio set than Imagen 4; the existing allowlist must not reject valid new ratios. Verify during implementation.

## Testing

- **Domain:** `arc-levels.test.ts` — Studio/Swift resolve to the new ids.
- **Lib:** `resolve.test.ts` / `get-media-provider.test.ts` — precedence (override → level → env → default) with the new ids; the provider routes a `gemini-3*-image` id to the `generateContent` path (not Imagen).
- **Manual (post-deploy):** in `/arc`, generate an image (Swift + Studio) and a short video; confirm a real asset lands as an approval-gated draft with provenance. (The actual Gemini calls aren't unit-tested — the provider is mocked — so a live smoke test is the real verification.)

## Out of scope

- Audio / TTS generation (Gemini TTS) — separate sub-project.
- Music generation (Lyria) — separate sub-project.
- Deleting the Imagen 4 `generateImages` code path.
