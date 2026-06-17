# Arc Video Generation (Veo) — design

**Date:** 2026-06-17
**Status:** Approved direction (was "Plan B" of the media-gen effort), pending spec review
**Scope:** Let Arc generate **videos** (Google **Veo** via `@google/genai`) as approval-gated, provenance-tagged draft assets, surfaced as a video draft card in Arc chat. Reuses the merged image-generation architecture (`MediaProvider`, prompt hardening, risk flags, Supabase storage, `create_campaign_draft`); the new dimension is Veo's **async/long-running** job model.

## Goal
The operator asks Arc to make a short video (a concept ad, a lifestyle clip); Arc generates it via Veo, stores it, and lands it as a **draft asset with a playable video + provenance + risk flags**, awaiting approval. Off by default; nothing outbound.

## Non-goals
- The media tab UI (the operator is building that separately — this produces the data + a chat draft card only).
- Image-to-video / video extension / reference-image video (Veo supports it; defer — v1 is text-to-video).
- A persistent DB job table / cron poller (v1 polls within the runner turn; see Async model).

## Verified API (`@google/genai`)
`ai.models.generateVideos({ model, prompt, config:{ numberOfVideos:1, aspectRatio, personGeneration, durationSeconds? } })` → a `GenerateVideosOperation`. Poll: `operation = await ai.operations.getVideosOperation({ operation })` until `operation.done`. Result: `operation.response.generatedVideos[0].video` → `Video { uri?, videoBytes?(base64), mimeType? }`. On the Gemini Developer API the video usually comes back as a short-lived `uri` that must be downloaded with the API key (or as `videoBytes`). Aspect ratios: **16:9, 9:16** only. `personGeneration`: `dont_allow | allow_adult`.

## Architecture

### 1. Provider — extend `MediaProvider`
Video is async, so it's split into start + poll rather than one call:
```ts
type VideoGenInput = { prompt: string; aspectRatio?: string; durationSeconds?: number };
type VideoStart = { operationName: string; model: string; jobId: string };
type VideoPoll =
  | { status: "running" }
  | { status: "done"; bytes: Buffer; contentType: string };
interface MediaProvider {
  generateImage(input): Promise<GeneratedMedia>;     // existing
  startVideo(input: VideoGenInput): Promise<VideoStart>;
  pollVideo(operationName: string): Promise<VideoPoll>;   // downloads bytes when done
}
```
`GeminiMediaProvider` implements both: `startVideo` calls `generateVideos` and returns `operation.name`; `pollVideo` reconstructs the operation from the name, calls `getVideosOperation`, and on `done` downloads the video bytes (via the key) and returns them. Model from `GEMINI_VIDEO_MODEL` (default `veo-2.0-generate-001`).

### 2. App endpoint — `POST /api/v1/arc/media/generate-video`
Bearer-gated + flag/cred-guarded (same as generate-image). One route, two modes:
- **start** (`{ prompt, aspect_ratio?, duration_seconds? }`, no `operation_name`): harden prompt → `provider.startVideo(...)` → `201 { ok, status:"running", operationName, model }`.
- **poll** (`{ operation_name }`): `provider.pollVideo(name)` → if running `200 { ok, status:"running" }`; if done → store bytes to the `campaign-media` Supabase bucket (reuse the image storage helper, generalized) → `201 { ok, status:"done", media: ArcMedia(kind:"video") }` with provenance (`source:"ai_generated"`, model, jobId, format, riskFlags).

Each request is fast (start = kick off; poll = one status check + a download only on the final poll). Key + storage stay server-side.

### 3. Runner tool — `generate_video` (draft/act mode)
Mirrors `generate_image` but orchestrates the poll loop (the runner is long-running, so minutes are fine):
1. `apiPost(generate-video, { prompt, aspect_ratio, duration_seconds })` → `{ operationName }`.
2. Loop: `apiPost(generate-video, { operation_name })` every ~10s until `status:"done"` or a cap (e.g. ~6 min); emit `running` steps so the chat shows progress.
3. On done: `apiPost(draft-asset, { ..., media_url, media })` (the existing path) → emit a **draft card** with `media (kind:"video", poster?)` + the inline `approval` block.
4. On timeout/failure: return a "still rendering / failed" message, no card.

### 4. Guardrails (same as images)
Provenance (`ai_generated` + model + jobId, non-removable), heuristic risk flags (reuse `deriveImageRiskFlags`), prompt hardening (reuse the no-text/branding directives), approval gate (`pending_approval`/`dispatch_locked`), augment-not-fabricate (never a fake "real BSR job" clip). Off by default (`ARC_MEDIA_ENABLED` + `GEMINI_API_KEY`).

## Data flow (happy path)
operator asks → Arc `generate_video` → start (Veo operation) → runner polls app until done → app downloads + stores video → `media(kind:"video")` → draft asset (`draft-asset`) → draft card with playable video + approval → operator approves → existing ledger.

## Error handling
- Flag off / no key → `not_configured`; tool says video gen isn't enabled.
- Veo error → `fail`; tool returns the reason, no card.
- Poll exceeds the runner cap → tool reports "still rendering, check later"; no card (no orphan — the asset is only created on done). (A durable job table + resumable poll is a future enhancement.)
- GCS/Supabase store failure → `502`.

## Testing
- **App:** provider start/poll unit tests (mock the Google client → operation running then done with bytes); endpoint start-mode + poll-running + poll-done (mock provider + storage) + flag-off + bad-input.
- **Runner:** `generate_video` tool test — stub start then poll(running)→poll(done); assert it emits a video draft card with `media.kind:"video"` + approval and returns ids; timeout path emits no card; failure path emits no card.
- **Manual:** flag on + key + billing → "make a 9:16 concept clip for an emergency water-damage ad" → progress steps, then a playable video draft card + inline approve; flag off → graceful message.

## Acceptance criteria
1. Flag off (default): `generate_video` reports not enabled; no external call.
2. Flag on + key: a prompt yields a draft asset with a real stored video, `ai_generated` provenance, format badge, risk flags, inline Approve/Decline; approving flips real asset state.
3. Async handled cleanly: start returns fast; the runner polls to completion; no serverless long-block.
4. Draft-only safety: video tool is act/draft (not ask); approval-gated; nothing outbound.
5. Provider stays swappable (Veo behind `MediaProvider`, like the image provider).

## Open items for the plan stage
- Confirm `getVideosOperation` accepts a reconstructed `{ name }` across requests (cross-request poll), or whether the operation object must be retained; if it can't be reconstructed from a name string, fall back to the runner holding the operation via a single longer request or a minimal in-memory/job record.
- Confirm how to download the result `video.uri` with the API key (files API vs direct fetch with key) vs using `videoBytes` directly.
- Generalize the image storage helper (`storeGeneratedImage` → a content-type-agnostic `storeGeneratedMedia`) reused by both image and video.
- Default Veo model id (`veo-2.0-generate-001` is SDK-documented; allow `GEMINI_VIDEO_MODEL` to select Veo 3).
