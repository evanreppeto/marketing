# Arc Media Generation — Plan A: Image generation (design)

**Date:** 2026-06-17
**Status:** Approved design, pending implementation plan
**Scope:** Let Arc generate **images** (provider: Google Gemini 2.5 Flash Image, "Nano Banana") as approval-gated, provenance-tagged draft assets with a card thumbnail. Behind a feature flag, off by default. **Video (Veo) is a separate spec (Plan B)** — this design only establishes the provider abstraction + image path that B reuses.

This is sub-project A of the media-generation effort (see roadmap item #2). It builds on the merged Arc runtime (Plans 1–5): the tool surface, `create_campaign_draft` (approval-gated draft assets), and `emit_card`'s `media` field.

---

## Goal

When the operator asks Arc to make/visualize an image (an ad creative, a concept, a background), Arc generates one, stores it, and surfaces it as a **draft asset with a thumbnail + provenance + risk flags**, awaiting human approval. Nothing is generated unless the feature is enabled and credentialed; nothing goes outbound without approval.

## Non-goals
- **Video / Veo** — Plan B (async job model).
- **Higgsfield** — a future provider behind the same `MediaProvider` interface; not built here.
- **Editing/upscaling/background-removal** of existing media — later.
- Replacing real BSR proof. AI images **augment** (concepts, backgrounds, variants); they must never be passed off as photos of real BSR jobs.

---

## Architecture

### 1. `MediaProvider` abstraction (the swap seam)
A provider-agnostic interface so Veo/Nano-Banana now → Higgsfield/Vertex later is a swap, not a rewrite:

```ts
type ImageGenInput = { prompt: string; aspectRatio?: string; referenceImageUrls?: string[] };
type GeneratedMedia = {
  bytes: Buffer; contentType: string;     // raw output to store
  model: string; jobId: string;           // provenance
};
interface MediaProvider {
  generateImage(input: ImageGenInput): Promise<GeneratedMedia>;
  // generateVideo(...) added in Plan B
}
```
The active provider is chosen by config. Plan A ships one implementation: **GeminiMediaProvider** (Google Gemini API, image model). The interface lives in the app (`src/lib/media/`).

### 2. App endpoint — `POST /api/v1/arc/media/generate-image`
Bearer-gated like the other `/api/v1/arc/*` routes. Flow:
1. **Flag/credential check** — if media generation isn't enabled (flag off or no API key), return a clear `not_configured` (the runner tool surfaces "image generation isn't enabled").
2. Validate input (`prompt` required; optional `aspect_ratio`, `reference_image_urls`).
3. `provider.generateImage(...)` → bytes + model + jobId.
4. **Store to GCS** via the existing helpers → object path → signed read URL.
5. **Risk-flag pass** (see Guardrails) → `riskFlags[]`.
6. Return `{ ok, media: ArcMedia }` where `media = { kind:"image", url, source:"ai_generated", format, model, jobId, riskFlags }`.

Keys + GCS stay server-side; the runner never holds the Google key.

### 3. Runner tool — `generate_image` (draft mode)
Generating AI creative produces an approval-gated work product, so this is a **draft-mode** tool (alongside `create_campaign_draft`). It:
1. Calls `POST /api/v1/arc/media/generate-image` → `media`.
2. Creates an approval-gated draft asset carrying that media — by reusing the Plan 4 draft-asset path (`create_campaign_draft`'s endpoint, extended to accept a `media_url`/media so the asset and its card carry the image).
3. Auto-emits a **draft card** with the `media` (thumbnail + provenance/format/risk) **and** the `approval { campaignId, assetId }` block → inline Approve/Decline.

Net: one tool call → a generated image becomes an inline-approvable draft asset with a thumbnail in chat. Emits live `running → done` steps.

### 4. Config / flag
- `ARC_MEDIA_ENABLED` (or equivalent) — master on/off, **off by default**.
- `GEMINI_API_KEY` — the provider credential. Absent ⇒ effectively disabled (graceful).
- Surfaced via the existing connection/settings posture; no UI required for v1 (env-driven), but documented.

### 5. Guardrails (enforced, not advisory)
- **Provenance:** every generated asset is `source: "ai_generated"` with `model` + `jobId`. Non-removable.
- **Risk flags:** a mandatory pass tags likely issues — `embedded text`, `claim risk`, `privacy/redaction`, `unrealistic scene`. (v1: heuristic/prompt-derived; can harden later.)
- **Augment-not-fabricate:** the tool description + system prompt forbid generating images that imply a real BSR job/result. Concept/background/lifestyle/variant only; real proof uses approved BSR media.
- **Approval gate:** the asset is `pending_approval` + `dispatch_locked` (inherited from the draft-asset path). Nothing outbound.

---

## Data flow (happy path)
operator asks → Arc (`generate_image`) → app endpoint → GeminiMediaProvider → bytes → GCS (signed URL) → risk-flag → draft asset (`create_campaign_draft` + media) → `{campaignId, assetId, media}` → Arc emits a draft card (media + approval) → operator approves → existing `decideAsset` ledger.

## Error handling
- Flag off / no key → `not_configured`; tool says "image generation isn't enabled" (no throw).
- Provider error / timeout → `fail`; tool returns "image generation failed: <reason>", no card emitted.
- GCS not configured → `not_configured` (same as today's GCS-guarded paths).
- Bad input → `400`.

## Testing
- **App:** provider interface unit test (mock the Google client → returns bytes); endpoint validation + flag-off + happy-path (mock provider + GCS) tests, mirroring existing `/api/v1/arc/*` route tests.
- **Runner:** `generate_image` tool test — stub the endpoint to return media + ids; assert it emits a draft card with `media` + `approval` and returns the ids; failure path emits no card.
- **Manual:** with the flag + key set, "make a 1:1 concept image for an emergency-water ad" → thumbnail draft card with "AI" badge + inline approve; approving moves real state. Flag off → graceful message.

## Acceptance criteria
1. Flag **off** (default): `generate_image` reports it's not enabled; no external call.
2. Flag **on** + key: a prompt yields a draft asset with a real GCS-hosted image, an `ai_generated` provenance badge, a format badge, and inline Approve/Decline; approving flips real asset state.
3. Provenance + risk flags are present and non-removable; the asset is `pending_approval`/`dispatch_locked`.
4. Provider is swappable: a second provider could be added behind `MediaProvider` without touching the endpoint or tool.
5. No outbound path; ask/act modes don't expose `generate_image` (draft-only).

---

## Open items for the plan stage
- Confirm the exact Gemini image model id + call (Gemini 2.5 Flash Image via the `@google/genai` SDK or REST) against current Google docs.
- Decide whether to extend `create_campaign_draft`'s endpoint to accept media, or add a thin `media_url` param — reuse over duplication.
- Risk-flag heuristics v1 (prompt-derived list) vs deferring to a follow-up.
