# Arc Video Generation (Veo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let Arc generate Veo videos as approval-gated, provenance-tagged draft assets surfaced as a video draft card in chat — off by default, async-safe (no serverless long-block), nothing outbound.

**Architecture:** Extend `MediaProvider` with async `startVideo`/`pollVideo` (Gemini/Veo). One app endpoint `generate-video` with start + poll modes (key + storage server-side). A runner `generate_video` tool orchestrates the poll loop (the runner is long-running) → lands an approval-gated draft asset + video card. Reuses prompt hardening, risk flags, provenance, Supabase storage, and the `draft-asset` path from the image feature.

**Tech Stack:** `@google/genai` (Veo) + `@google-cloud`/Supabase storage (app); TypeScript + Claude Agent SDK + Vitest (runner).

Spec: `docs/superpowers/specs/2026-06-17-arc-video-generation-design.md`. **Verified:** `getVideosOperation` reads only `operation.name` (SDK `index.cjs:16263`), so polling across requests with `{ name }` works. Veo: `ai.models.generateVideos({model, prompt, config})` → operation; result `operation.response.generatedVideos[0].video` (`videoBytes` base64 or `uri`).

---

## File Structure
- `src/lib/media/types.ts` — add video types + extend `MediaProvider`.
- `src/lib/media/gemini.ts` — `startVideo`/`pollVideo`; `GEMINI_VIDEO_MODEL`.
- `src/lib/media/storage.ts` — generalize to `storeGeneratedMedia` (keep `storeGeneratedImage` as a thin alias).
- `src/lib/media/prompt.ts` — reuse `hardenImagePrompt` (no change; video calls it).
- `src/app/api/v1/arc/media/generate-video/route.ts` (+ test).
- `apps/arc-runner/src/tools/media.ts` (+ media.test.ts) — add `generate_video`.
- `apps/arc-runner/src/tools/index.test.ts` — DRAFT includes `generate_video`.
- `apps/arc-runner/src/prompt.ts` — guidance.
- `.env.example` — document `GEMINI_VIDEO_MODEL`.

---

## Task 1: Provider — video types, Gemini start/poll, generalized storage

**Files:** `src/lib/media/types.ts`, `src/lib/media/gemini.ts`, `src/lib/media/storage.ts`.

- [ ] **Step 1: types.ts** — append:
```ts
export type VideoGenInput = { prompt: string; aspectRatio?: string; durationSeconds?: number };
export type VideoStart = { operationName: string; model: string; jobId: string };
export type VideoPoll =
  | { status: "running" }
  | { status: "done"; bytes: Buffer; contentType: string };
```
and extend the interface:
```ts
export interface MediaProvider {
  generateImage(input: ImageGenInput): Promise<GeneratedMedia>;
  startVideo(input: VideoGenInput): Promise<VideoStart>;
  pollVideo(operationName: string): Promise<VideoPoll>;
}
```

- [ ] **Step 2: storage.ts** — rename the helper to a content-type-agnostic name and keep back-compat:
```ts
/** Upload generated media bytes (image or video); returns a permanent public URL. */
export async function storeGeneratedMedia(objectPath: string, bytes: Buffer, contentType: string): Promise<string> {
  const client = getSupabaseAdminClient();
  const { error } = await client.storage
    .from(CAMPAIGN_MEDIA_BUCKET)
    .upload(objectPath, bytes, { contentType, upsert: true });
  if (error) throw new Error(`media upload failed: ${error.message}`);
  return client.storage.from(CAMPAIGN_MEDIA_BUCKET).getPublicUrl(objectPath).data.publicUrl;
}

/** @deprecated use storeGeneratedMedia */
export const storeGeneratedImage = storeGeneratedMedia;
```
(The image route keeps working via the alias.)

- [ ] **Step 3: gemini.ts** — add a video model const + start/poll. Add to the provider object returned by `createGeminiMediaProvider`:
```ts
const DEFAULT_VIDEO_MODEL = "veo-2.0-generate-001";
const SUPPORTED_VIDEO_ASPECT = new Set(["16:9", "9:16"]);
function resolveVideoModel(): string {
  return process.env.GEMINI_VIDEO_MODEL?.trim() || DEFAULT_VIDEO_MODEL;
}
```
Inside `createGeminiMediaProvider`’s returned object (alongside `generateImage`):
```ts
    async startVideo(input: VideoGenInput): Promise<VideoStart> {
      const model = resolveVideoModel();
      const aspectRatio = input.aspectRatio && SUPPORTED_VIDEO_ASPECT.has(input.aspectRatio) ? input.aspectRatio : undefined;
      const operation = await ai.models.generateVideos({
        model,
        prompt: input.prompt,
        config: {
          numberOfVideos: 1,
          personGeneration: PersonGeneration.ALLOW_ADULT,
          ...(aspectRatio ? { aspectRatio } : {}),
          ...(input.durationSeconds ? { durationSeconds: input.durationSeconds } : {}),
        },
      });
      const operationName = operation.name;
      if (!operationName) throw new Error("Veo did not return an operation name");
      return { operationName, model, jobId: randomUUID() };
    },
    async pollVideo(operationName: string): Promise<VideoPoll> {
      const operation = await ai.operations.getVideosOperation({
        operation: { name: operationName } as Awaited<ReturnType<typeof ai.models.generateVideos>>,
      });
      if (!operation.done) return { status: "running" };
      const video = operation.response?.generatedVideos?.[0]?.video;
      if (!video) throw new Error("Veo finished but returned no video (it may have been safety-filtered)");
      const contentType = video.mimeType ?? "video/mp4";
      if (video.videoBytes) {
        return { status: "done", bytes: Buffer.from(video.videoBytes, "base64"), contentType };
      }
      if (video.uri) {
        // Download the result with the API key (the uri is a short-lived files URI).
        const res = await fetch(video.uri, { headers: { "x-goog-api-key": apiKey } });
        if (!res.ok) throw new Error(`Veo video download failed: ${res.status}`);
        return { status: "done", bytes: Buffer.from(await res.arrayBuffer()), contentType };
      }
      throw new Error("Veo result had neither videoBytes nor uri");
    },
```
(`PersonGeneration`/`randomUUID` are already imported in gemini.ts; `apiKey` is the closure param.)
> Plan-stage: if `fetch(video.uri, {headers:{"x-goog-api-key":apiKey}})` doesn't yield the bytes (some uris want `?alt=media` or the SDK `ai.files.download`), adjust to the working download per the SDK — confirm at build with the real key, but the `videoBytes` branch covers the common dev-API case.

- [ ] **Step 4: tsc** — `pnpm exec tsc --noEmit` → clean. (No unit test here; the provider is exercised via the route test with a mock.)
- [ ] **Step 5: Commit** — `git add src/lib/media && git commit -m "feat(media): MediaProvider video start/poll (Veo) + generalized storage"`

---

## Task 2: `POST /api/v1/arc/media/generate-video` (start + poll)

**Files:** Create `src/app/api/v1/arc/media/generate-video/route.ts` (+ `route.test.ts`).

- [ ] **Step 1: Route:**
```ts
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { INVALID_JSON, fail, guard, readJson } from "@/app/api/v1/arc/_lib/http";
import { getMediaProvider, isMediaGenEnabled } from "@/lib/media";
import { hardenImagePrompt } from "@/lib/media/prompt";
import { deriveImageRiskFlags } from "@/lib/media/risk";
import { storeGeneratedMedia } from "@/lib/media/storage";

/**
 * Generate a video (Veo) — async. Two modes:
 *   start: { prompt, aspect_ratio?, duration_seconds? } -> 201 { ok, status:"running", operationName, model }
 *   poll:  { operation_name } -> 200 { ok, status:"running" } | 201 { ok, status:"done", media }
 * Flag- + credential-guarded; key + storage stay server-side. No outbound.
 */
export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  if (!isMediaGenEnabled()) {
    return fail("not_configured", "Video generation isn't enabled (needs ARC_MEDIA_ENABLED and GEMINI_API_KEY).", 503);
  }
  const payload = await readJson(request);
  if (payload === INVALID_JSON || typeof payload !== "object" || payload === null) {
    return fail("rejected", "Request body must be valid JSON.", 400);
  }
  const body = payload as Record<string, unknown>;
  const provider = getMediaProvider();
  if (!provider) return fail("not_configured", "Video generation isn't enabled.", 503);

  const operationName = typeof body.operation_name === "string" ? body.operation_name.trim() : "";

  try {
    // POLL mode
    if (operationName) {
      const result = await provider.pollVideo(operationName);
      if (result.status === "running") return NextResponse.json({ ok: true, status: "running" }, { status: 200 });
      const objectPath = `arc-generated/${randomUUID()}.mp4`;
      const url = await storeGeneratedMedia(objectPath, result.bytes, result.contentType);
      const media = {
        kind: "video" as const,
        url,
        source: "ai_generated" as const,
        model: typeof body.model === "string" ? body.model : "veo",
        riskFlags: typeof body.prompt === "string" ? deriveImageRiskFlags(body.prompt) : [],
      };
      return NextResponse.json({ ok: true, status: "done", media, objectPath }, { status: 201 });
    }
    // START mode
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) return fail("rejected", "prompt is required to start a video.", 400);
    const aspectRatio = typeof body.aspect_ratio === "string" && body.aspect_ratio.trim() ? body.aspect_ratio.trim() : "16:9";
    const durationSeconds = typeof body.duration_seconds === "number" ? body.duration_seconds : undefined;
    const start = await provider.startVideo({ prompt: hardenImagePrompt(prompt), aspectRatio, durationSeconds });
    return NextResponse.json({ ok: true, status: "running", operationName: start.operationName, model: start.model }, { status: 201 });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Video generation failed.", 502);
  }
}
```
(Note: risk flags on poll are derived from the original prompt if the runner echoes it back; otherwise empty — the runner passes `prompt` + `model` on the poll body so provenance is complete. Format is set on the card by the runner.)

- [ ] **Step 2: Test** `route.test.ts` (mock `@/lib/media` provider with `startVideo`/`pollVideo`, mock `@/lib/media/storage` `storeGeneratedMedia`; env+bearer pattern from generate-image test): assert 401 no token; 503 flag off; 400 no prompt on start; start returns `{status:"running", operationName}`; poll-running returns 200 `{status:"running"}`; poll-done returns 201 with `media.kind:"video"` + url.

- [ ] **Step 3: Run + commit** — `pnpm test src/app/api/v1/arc/media/generate-video` → PASS; `git add src/app/api/v1/arc/media/generate-video && git commit -m "feat(arc-api): generate-video endpoint (Veo start/poll, flag-gated)"`

---

## Task 3: Runner `generate_video` tool (poll loop) + draft tier

**Files:** `apps/arc-runner/src/tools/media.ts` (+ `media.test.ts`), `apps/arc-runner/src/tools/index.test.ts`.

- [ ] **Step 1: Add `generate_video` to `mediaTools`** in `apps/arc-runner/src/tools/media.ts` (return both tools). It mirrors `generate_image` but loops the poll. Add a small sleep helper and a cap:
```ts
const VIDEO_POLL_MS = 10_000;
const VIDEO_MAX_POLLS = 36; // ~6 min
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const generateVideo = tool(
  "generate_video",
  "Generate an AI VIDEO (Veo) for a campaign asset and surface it as an approval-gated draft with a playable clip. Use for short concept/lifestyle/ad clips — NEVER a fabricated 'real job' video. Describe the scene in prompt + the look in style. Videos render asynchronously (about 1-3 minutes); the operator sees progress. aspect_ratio is 16:9 or 9:16. Attach with campaign_id, or start a new draft campaign with name + persona + restoration_focus.",
  {
    prompt: z.string().describe("The scene to generate. No text/logos."),
    title: z.string(),
    style: z.string().optional(),
    aspect_ratio: z.string().optional().describe("16:9 | 9:16 (default 16:9)"),
    duration_seconds: z.number().optional(),
    asset_type: z.string().optional(),
    campaign_id: z.string().optional(),
    name: z.string().optional(),
    persona: z.string().optional(),
    restoration_focus: z.string().optional(),
  },
  async (args) => {
    const label = "Generating video";
    await step(label, "running");
    try {
      const promptWithStyle = args.style ? `${args.prompt}\n\nStyle: ${args.style}.` : args.prompt;
      const start = await client.apiPost<{ operationName: string; model: string }>(
        "/api/v1/arc/media/generate-video",
        { prompt: promptWithStyle, aspect_ratio: args.aspect_ratio, duration_seconds: args.duration_seconds },
      );
      let media: ArcMedia | null = null;
      let objectPath: string | undefined;
      for (let i = 0; i < VIDEO_MAX_POLLS; i++) {
        await sleep(VIDEO_POLL_MS);
        const poll = await client.apiPost<{ status: string; media?: ArcMedia; objectPath?: string }>(
          "/api/v1/arc/media/generate-video",
          { operation_name: start.operationName, prompt: promptWithStyle, model: start.model },
        );
        if (poll.status === "done" && poll.media) { media = poll.media; objectPath = poll.objectPath; break; }
      }
      if (!media) {
        await step(label, "done");
        return textResult(`${label} timed out — Veo is still rendering. Try again shortly.`);
      }
      const withFormat: ArcMedia = { ...media, format: args.aspect_ratio ?? "16:9" };
      const draft = await client.apiPost<{ campaignId: string; assetId: string }>(
        "/api/v1/arc/campaigns/draft-asset",
        {
          campaign_id: args.campaign_id, name: args.name, persona: args.persona,
          restoration_focus: args.restoration_focus, asset_type: args.asset_type ?? "video_ad",
          title: args.title, media_url: withFormat.url, media_path: objectPath, media: withFormat,
        },
      );
      await step(label, "done");
      collectCard({
        kind: "draft", title: args.title, rows: [], flags: [],
        media: withFormat,
        approval: { kind: "campaign", campaignId: draft.campaignId, assetId: draft.assetId },
      });
      return textResult(JSON.stringify({ campaignId: draft.campaignId, assetId: draft.assetId, media: withFormat, status: "video draft created, pending approval" }));
    } catch (error) {
      await step(label, "done");
      return textResult(`${label} failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  },
);

return [generateImage, generateVideo];
```
(The draft-asset `media` carries provenance; `format` is set from the requested aspect. `objectPath` flows as `media_path`.)

- [ ] **Step 2: media.test.ts** — add a `generate_video` test: stub `apiPost` to return `{operationName}` then `{status:"running"}` then `{status:"done", media:{kind:"video",url,...}}` then the draft `{campaignId,assetId}`; use fake timers (`vi.useFakeTimers()` + advance) so the sleep loop resolves without real waits; assert a video draft card is emitted with `media.kind:"video"` + approval. Also a timeout test (always "running") → no card, "timed out" text.

- [ ] **Step 3: index.test.ts** — extend the `DRAFT` array to include `generate_video` (it's added to `mediaTools`, already in the draft tier).

- [ ] **Step 4: Run + commit** — `pnpm --filter @bsr/arc-runner typecheck && pnpm --filter @bsr/arc-runner test` → PASS; `git add apps/arc-runner/src/tools && git commit -m "feat(arc-runner): generate_video tool (Veo poll loop -> approval-gated draft)"`

---

## Task 4: Prompt guidance + env docs

**Files:** `apps/arc-runner/src/prompt.ts`, `.env.example`.

- [ ] **Step 1:** In `prompt.ts`, after the Images paragraph add a Videos line: in act/draft mode `generate_video` makes short Veo clips (asynchronous, ~1-3 min; 16:9 or 9:16); same rules — no in-image text/logos, augment-not-fabricate, approval-gated.
- [ ] **Step 2:** In `.env.example`, under the media block, document `GEMINI_VIDEO_MODEL` (optional; default `veo-2.0-generate-001`; set a Veo 3 id for higher quality).
- [ ] **Step 3:** typecheck + commit — `git add apps/arc-runner/src/prompt.ts .env.example && git commit -m "feat(arc-runner): prompt + env docs for generate_video"`

---

## Task 5: Manual acceptance
- [ ] Flag off → `generate_video` reports not enabled; no call.
- [ ] Flag on + key (billing) → draft mode: "make a 9:16 concept clip for an emergency water-damage ad" → `Generating video` running steps for 1-3 min → a **playable video draft card** with AI badge + inline Approve/Decline; the video is in the campaign-media bucket.
- [ ] Approve → flips real asset state in `/campaigns`.
- [ ] act mode includes `generate_video`; ask mode does not.

---

## Self-review notes
- **Spec coverage:** provider start/poll (T1) + endpoint start/poll (T2) + runner poll-loop tool (T3) + guidance/env (T4) + manual (T5). Async handled without serverless long-block (start fast; runner loops; each poll fast). Guardrails reuse images' (provenance, risk, hardening, approval gate, off-by-default).
- **Type/name consistency:** `VideoGenInput`/`VideoStart`/`VideoPoll` (types) → `startVideo`/`pollVideo` (gemini) → endpoint start/poll → runner loop → `ArcMedia kind:"video"` card + `draft-asset` media. `storeGeneratedMedia` reused by both image (alias) and video.
- **Reuse:** `hardenImagePrompt`, `deriveImageRiskFlags`, `getMediaProvider`/`isMediaGenEnabled`, `draft-asset` endpoint, the `ArcMedia kind:"video"` card the app already renders.
- **Build-time confirms:** the `video.uri` download (key header vs `ai.files.download`); fake-timers in the runner test; the default Veo model id (configurable).
- **Deferred:** image-to-video, durable resumable job table (runner-loop is v1), the media tab UI (operator owns it).
