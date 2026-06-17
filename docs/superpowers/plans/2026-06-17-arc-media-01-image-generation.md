# Arc Media — Plan A: Image generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let Arc generate images (Google Gemini 2.5 Flash Image, "Nano Banana") as approval-gated, provenance-tagged draft assets with a chat thumbnail — behind a feature flag, off by default.

**Architecture:** A provider-agnostic `MediaProvider` (Gemini now; Higgsfield/Vertex later) lives in `src/lib/media/`. A flag-gated app endpoint `POST /api/v1/arc/media/generate-image` runs the provider → stores bytes to GCS → returns provenance-tagged `media`. A draft-mode runner tool `generate_image` calls it, then creates an approval-gated draft asset (reusing Plan 4's `draft-asset` endpoint with `media_url`) and emits a draft card with the thumbnail + inline Approve/Decline.

**Tech Stack:** Next.js route + `@google/genai` + `@google-cloud/storage` (app); TypeScript + Claude Agent SDK + Zod + Vitest (runner).

Plan A of the media-gen effort (spec: `docs/superpowers/specs/2026-06-17-arc-media-image-generation-design.md`). Video (Veo, async) is Plan B. Builds on merged Plans 1–5 (`create_campaign_draft`, `emit_card` media field).

**Verified API (Gemini):** package `@google/genai`; `new GoogleGenAI({ apiKey })`; `ai.models.generateContent({ model: "gemini-2.5-flash-image", contents: prompt })`; image bytes at `response.candidates[0].content.parts[].inlineData.data` (base64) + `.mimeType`.

---

## File Structure
**App (`src/`):**
- `src/lib/storage/gcs.ts` — add server-side `uploadObject(objectPath, bytes, contentType)`.
- `src/lib/media/types.ts` — `MediaProvider` interface + `GeneratedMedia`/`ImageGenInput`.
- `src/lib/media/gemini.ts` — `createGeminiMediaProvider`.
- `src/lib/media/risk.ts` (+ `risk.test.ts`) — pure `deriveImageRiskFlags`.
- `src/lib/media/index.ts` — `isMediaGenEnabled` + `getMediaProvider`.
- `src/app/api/v1/arc/media/generate-image/route.ts` (+ `route.test.ts`).
- `package.json` — add `@google/genai`.

**Runner (`apps/arc-runner/`):**
- `src/tools/media.ts` (+ `media.test.ts`) — `generate_image` tool.
- `src/tools/index.ts` (+ `index.test.ts`) — add `generate_image` to the draft tier.
- `src/prompt.ts` — guidance.

---

## Task 1: GCS server-side upload helper

**Files:** Modify `src/lib/storage/gcs.ts`

- [ ] **Step 1:** Append to `gcs.ts` (after `createSignedReadUrl`):

```ts
/** Server-side upload of raw bytes (e.g. AI-generated media). Returns the object path. */
export async function uploadObject(objectPath: string, bytes: Buffer, contentType: string): Promise<string> {
  await getStorage()
    .bucket(getBucketName())
    .file(objectPath)
    .save(bytes, { contentType, resumable: false });
  return objectPath;
}
```

- [ ] **Step 2:** Typecheck — `pnpm exec tsc --noEmit` → PASS.
- [ ] **Step 3:** Commit — `git add src/lib/storage/gcs.ts && git commit -m "feat(storage): server-side uploadObject for generated media"`

---

## Task 2: Media provider abstraction + Gemini + flag + risk flags

**Files:** Create `src/lib/media/types.ts`, `src/lib/media/gemini.ts`, `src/lib/media/risk.ts`, `src/lib/media/risk.test.ts`, `src/lib/media/index.ts`; modify `package.json`.

- [ ] **Step 1: Add the dependency.** Run (repo root): `pnpm add @google/genai` (adds it to the root `package.json` + lockfile).

- [ ] **Step 2: `types.ts`:**

```ts
/** Provider-agnostic media generation. Swap Gemini → Higgsfield/Vertex behind this. */
export type ImageGenInput = { prompt: string; aspectRatio?: string };

export type GeneratedMedia = {
  bytes: Buffer;
  contentType: string;
  model: string;
  jobId: string;
};

export interface MediaProvider {
  generateImage(input: ImageGenInput): Promise<GeneratedMedia>;
  // generateVideo(...) — added in Plan B
}
```

- [ ] **Step 3: `gemini.ts`:**

```ts
import { GoogleGenAI } from "@google/genai";
import { randomUUID } from "node:crypto";

import type { GeneratedMedia, ImageGenInput, MediaProvider } from "./types";

const IMAGE_MODEL = "gemini-2.5-flash-image";

/** Google Gemini provider (Gemini 2.5 Flash Image, "Nano Banana"). */
export function createGeminiMediaProvider(apiKey: string): MediaProvider {
  const ai = new GoogleGenAI({ apiKey });
  return {
    async generateImage(input: ImageGenInput): Promise<GeneratedMedia> {
      const response = await ai.models.generateContent({
        model: IMAGE_MODEL,
        contents: input.prompt,
      });
      const parts = response.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        const inline = part.inlineData;
        if (inline?.data) {
          return {
            bytes: Buffer.from(inline.data, "base64"),
            contentType: inline.mimeType ?? "image/png",
            model: IMAGE_MODEL,
            jobId: randomUUID(),
          };
        }
      }
      throw new Error("Gemini returned no image data");
    },
  };
}
```

- [ ] **Step 4: Write the failing risk test** `src/lib/media/risk.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { deriveImageRiskFlags } from "./risk";

describe("deriveImageRiskFlags", () => {
  it("flags claim risk for before/after & proof language", () => {
    expect(deriveImageRiskFlags("before and after proof of a guaranteed restoration")).toContain("claim risk");
  });
  it("flags privacy for people/homeowner refs", () => {
    expect(deriveImageRiskFlags("a happy homeowner family outside their house")).toContain("privacy/redaction");
  });
  it("flags embedded text for headline/logo refs", () => {
    expect(deriveImageRiskFlags("poster with a bold headline and our logo")).toContain("embedded text");
  });
  it("flags unrealistic scene for damage/disaster refs", () => {
    expect(deriveImageRiskFlags("a flooded basement with severe water damage")).toContain("unrealistic scene");
  });
  it("returns no flags for a neutral concept", () => {
    expect(deriveImageRiskFlags("an abstract blue gradient background")).toEqual([]);
  });
});
```

- [ ] **Step 5: Run → FAIL.** `pnpm test src/lib/media/risk.test.ts`

- [ ] **Step 6: `risk.ts`:**

```ts
const RISK_RULES: Array<{ test: RegExp; flag: string }> = [
  { test: /\b(before|after|proof|result|results|guarantee|guaranteed|claim|approved|payout)\b/i, flag: "claim risk" },
  { test: /\b(address|name|face|person|people|family|homeowner|customer|client)\b/i, flag: "privacy/redaction" },
  { test: /\b(text|headline|logo|caption|words?|copy|sign|slogan)\b/i, flag: "embedded text" },
  { test: /\b(damage|flood|flooded|fire|mold|sewage|disaster|destroyed|wreckage)\b/i, flag: "unrealistic scene" },
];

/**
 * Heuristic risk-flag pass for an AI image prompt (v1). Surfaces likely review
 * concerns so the operator scrutinizes them before approving. Order-stable, deduped.
 */
export function deriveImageRiskFlags(prompt: string): string[] {
  const flags: string[] = [];
  for (const rule of RISK_RULES) {
    if (rule.test.test(prompt) && !flags.includes(rule.flag)) flags.push(rule.flag);
  }
  return flags;
}
```

- [ ] **Step 7: Run → PASS.** `pnpm test src/lib/media/risk.test.ts`

- [ ] **Step 8: `index.ts`:**

```ts
import { createGeminiMediaProvider } from "./gemini";
import type { MediaProvider } from "./types";

export type { MediaProvider, GeneratedMedia, ImageGenInput } from "./types";

/** Master flag: media generation is on only when explicitly enabled AND credentialed. */
export function isMediaGenEnabled(): boolean {
  return process.env.ARC_MEDIA_ENABLED === "1" && Boolean(process.env.GEMINI_API_KEY?.trim());
}

/** The active provider, or null when disabled/uncredentialed (graceful off). */
export function getMediaProvider(): MediaProvider | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (process.env.ARC_MEDIA_ENABLED !== "1" || !key) return null;
  return createGeminiMediaProvider(key);
}
```

- [ ] **Step 9: Typecheck + commit.** `pnpm exec tsc --noEmit` → PASS.
```
git add src/lib/media package.json pnpm-lock.yaml
git commit -m "feat(media): MediaProvider abstraction (Gemini) + flag + risk flags"
```

---

## Task 3: `POST /api/v1/arc/media/generate-image`

**Files:** Create `src/app/api/v1/arc/media/generate-image/route.ts` (+ `route.test.ts`).

- [ ] **Step 1: Implement the route:**

```ts
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { INVALID_JSON, fail, guard, readJson } from "@/app/api/v1/arc/_lib/http";
import { getMediaProvider, isMediaGenEnabled } from "@/lib/media";
import { deriveImageRiskFlags } from "@/lib/media/risk";
import { createSignedReadUrl, isGcsConfigured, uploadObject } from "@/lib/storage/gcs";

/**
 * Generate an image (AI) and store it in GCS. Flag-gated + credential-guarded:
 * returns not_configured when media gen or GCS isn't set up. The result is
 * provenance-tagged (source: ai_generated) with heuristic risk flags. No outbound.
 *
 *   POST /api/v1/arc/media/generate-image
 *   { prompt: string, aspect_ratio?: string }
 *   -> 201 { ok, status:"created", media: ArcMedia }
 */
export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  if (!isMediaGenEnabled() || !isGcsConfigured()) {
    return fail("not_configured", "Image generation isn't enabled (needs ARC_MEDIA_ENABLED, GEMINI_API_KEY, and GCS).", 503);
  }

  const payload = await readJson(request);
  if (payload === INVALID_JSON || typeof payload !== "object" || payload === null) {
    return fail("rejected", "Request body must be valid JSON.", 400);
  }
  const body = payload as Record<string, unknown>;
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return fail("rejected", "prompt is required.", 400);
  const aspectRatio =
    typeof body.aspect_ratio === "string" && body.aspect_ratio.trim() ? body.aspect_ratio.trim() : "1:1";

  const provider = getMediaProvider();
  if (!provider) return fail("not_configured", "Image generation isn't enabled.", 503);

  try {
    const gen = await provider.generateImage({ prompt, aspectRatio });
    const ext = gen.contentType.includes("png") ? "png" : gen.contentType.includes("webp") ? "webp" : "jpg";
    const objectPath = `arc-generated/${randomUUID()}.${ext}`;
    await uploadObject(objectPath, gen.bytes, gen.contentType);
    const url = await createSignedReadUrl(objectPath);
    const media = {
      kind: "image" as const,
      url,
      source: "ai_generated" as const,
      format: aspectRatio,
      model: gen.model,
      jobId: gen.jobId,
      riskFlags: deriveImageRiskFlags(prompt),
    };
    return NextResponse.json({ ok: true, status: "created", media }, { status: 201 });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Image generation failed.", 502);
  }
}
```

- [ ] **Step 2: Test** `route.test.ts` (mock media + gcs; env+bearer pattern from `drafts/route.test.ts`):

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateImage = vi.fn();
vi.mock("@/lib/media", () => ({
  isMediaGenEnabled: () => process.env.ARC_MEDIA_ENABLED === "1",
  getMediaProvider: () => ({ generateImage }),
}));
vi.mock("@/lib/storage/gcs", () => ({
  isGcsConfigured: () => true,
  uploadObject: vi.fn(async (p: string) => p),
  createSignedReadUrl: vi.fn(async () => "https://signed.example/img.png"),
}));

import { POST } from "./route";

function req(authorization: string | undefined, body?: unknown) {
  return new Request("http://localhost/api/v1/arc/media/generate-image", {
    method: "POST",
    headers: { ...(authorization ? { authorization } : {}), "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const env = {
  ARC_AGENT_API_TOKEN: process.env.ARC_AGENT_API_TOKEN,
  ARC_MEDIA_ENABLED: process.env.ARC_MEDIA_ENABLED,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
function configure() {
  process.env.ARC_AGENT_API_TOKEN = "secret";
  process.env.ARC_MEDIA_ENABLED = "1";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
}

beforeEach(() => {
  generateImage.mockReset();
  generateImage.mockResolvedValue({
    bytes: Buffer.from("x"),
    contentType: "image/png",
    model: "gemini-2.5-flash-image",
    jobId: "job_1",
  });
});
afterEach(() => {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("POST /api/v1/arc/media/generate-image", () => {
  it("401 without a valid token, no generation", async () => {
    process.env.ARC_AGENT_API_TOKEN = "secret";
    process.env.ARC_MEDIA_ENABLED = "1";
    const res = await POST(req("Bearer wrong", { prompt: "x" }));
    expect(res.status).toBe(401);
    expect(generateImage).not.toHaveBeenCalled();
  });

  it("503 when the flag is off", async () => {
    configure();
    process.env.ARC_MEDIA_ENABLED = "0";
    const res = await POST(req("Bearer secret", { prompt: "x" }));
    expect(res.status).toBe(503);
    expect(generateImage).not.toHaveBeenCalled();
  });

  it("400 when prompt is missing", async () => {
    configure();
    const res = await POST(req("Bearer secret", {}));
    expect(res.status).toBe(400);
  });

  it("201 with provenance-tagged media on success", async () => {
    configure();
    const res = await POST(req("Bearer secret", { prompt: "abstract blue gradient", aspect_ratio: "9:16" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.media).toMatchObject({
      kind: "image",
      url: "https://signed.example/img.png",
      source: "ai_generated",
      format: "9:16",
      model: "gemini-2.5-flash-image",
    });
    expect(generateImage).toHaveBeenCalledWith({ prompt: "abstract blue gradient", aspectRatio: "9:16" });
  });
});
```

- [ ] **Step 3: Run + commit.** `pnpm test src/app/api/v1/arc/media/generate-image` → PASS.
```
git add src/app/api/v1/arc/media/generate-image
git commit -m "feat(arc-api): generate-image endpoint (flag-gated, provenance-tagged)"
```

---

## Task 4: Runner `generate_image` tool

**Files:** Create `apps/arc-runner/src/tools/media.ts` (+ `media.test.ts`).

- [ ] **Step 1: Write the failing test** `apps/arc-runner/src/tools/media.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import type { ArcClient } from "../arc-client";
import type { ArcActionCard } from "../types";
import { mediaTools } from "./media";

function setup(posts: Array<() => Promise<unknown>>) {
  const cards: ArcActionCard[] = [];
  let i = 0;
  const apiPost = vi.fn(async () => posts[i++]());
  const client = { apiPost } as unknown as ArcClient;
  const step = vi.fn(async () => {});
  const [genImage] = mediaTools(client, step, (c) => cards.push(c));
  const call = (args: Record<string, unknown>) =>
    (genImage.handler as (a: Record<string, unknown>, e?: unknown) => Promise<{ content: Array<{ type: string; text: string }> }>)(args);
  return { cards, apiPost, call, genImage };
}

describe("generate_image", () => {
  it("is named generate_image", () => {
    const { genImage } = setup([async () => ({})]);
    expect(genImage.name).toBe("generate_image");
  });

  it("generates, creates a draft asset, and emits a media+approval card", async () => {
    const media = { kind: "image", url: "https://x/y.png", source: "ai_generated", format: "1:1", model: "m", jobId: "j" };
    const { cards, apiPost, call } = setup([
      async () => ({ media }),
      async () => ({ campaignId: "c1", assetId: "a1" }),
    ]);
    const out = await call({ prompt: "blue gradient", title: "BG", name: "Brand", persona: "persona_landlord", restoration_focus: "water" });

    expect(apiPost).toHaveBeenNthCalledWith(1, "/api/v1/arc/media/generate-image", expect.objectContaining({ prompt: "blue gradient" }));
    expect(apiPost).toHaveBeenNthCalledWith(2, "/api/v1/arc/campaigns/draft-asset", expect.objectContaining({ media_url: "https://x/y.png", title: "BG" }));
    expect(cards[0]).toMatchObject({
      kind: "draft",
      title: "BG",
      media,
      approval: { kind: "campaign", campaignId: "c1", assetId: "a1" },
    });
    expect(out.content[0].text).toContain("a1");
  });

  it("emits no card when generation fails", async () => {
    const { cards, call } = setup([
      async () => {
        throw new Error("quota");
      },
    ]);
    const out = await call({ prompt: "x", title: "T", campaign_id: "c1" });
    expect(cards).toHaveLength(0);
    expect(out.content[0].text).toContain("failed");
  });
});
```

- [ ] **Step 2: Run → FAIL.** `pnpm --filter @bsr/arc-runner test`

- [ ] **Step 3: Implement** `apps/arc-runner/src/tools/media.ts`:

```ts
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import type { ArcClient } from "../arc-client";
import type { ArcActionCard, ArcMedia } from "../types";
import { textResult, type StepFn } from "./helpers";

/**
 * Media generation (DRAFT mode only). `generate_image` creates an AI image and
 * lands it as an approval-gated draft campaign asset with a thumbnail card.
 * AI-tagged + risk-flagged + locked pending approval — never outbound, never a
 * fabricated "proof" of a real BSR job.
 */
export function mediaTools(client: ArcClient, step: StepFn, collectCard: (card: ArcActionCard) => void) {
  const generateImage = tool(
    "generate_image",
    "Generate an AI image for a campaign asset and surface it as an approval-gated draft with a thumbnail. Use for concept / background / lifestyle / variant creative — NEVER to fabricate proof of a real BSR job or result. Attach to an existing campaign with campaign_id, or start a new draft campaign with name + persona (a persona key) + restoration_focus (water|flood|sewage|mold|fire|storm). The image is AI-generated, tagged as such, risk-flagged, and awaits approval.",
    {
      prompt: z.string().describe("What to generate — an illustrative concept, not a staged 'real job'"),
      title: z.string().describe("Short title for the asset"),
      aspect_ratio: z.string().optional().describe("1:1 | 4:5 | 9:16 | 16:9 (default 1:1)"),
      asset_type: z.string().optional().describe("default image_prompt"),
      campaign_id: z.string().optional().describe("Existing campaign to attach to; omit to create a new draft campaign"),
      name: z.string().optional().describe("New campaign name (when campaign_id omitted)"),
      persona: z.string().optional(),
      restoration_focus: z.string().optional(),
    },
    async (args) => {
      const label = "Generating image";
      await step(label, "running");
      try {
        const gen = await client.apiPost<{ media: ArcMedia }>("/api/v1/arc/media/generate-image", {
          prompt: args.prompt,
          aspect_ratio: args.aspect_ratio,
        });
        const draft = await client.apiPost<{ campaignId: string; assetId: string }>(
          "/api/v1/arc/campaigns/draft-asset",
          {
            campaign_id: args.campaign_id,
            name: args.name,
            persona: args.persona,
            restoration_focus: args.restoration_focus,
            asset_type: args.asset_type ?? "image_prompt",
            title: args.title,
            media_url: gen.media.url,
          },
        );
        await step(label, "done");
        collectCard({
          kind: "draft",
          title: args.title,
          rows: [],
          flags: [],
          media: gen.media,
          approval: { kind: "campaign", campaignId: draft.campaignId, assetId: draft.assetId },
        });
        return textResult(
          JSON.stringify({
            campaignId: draft.campaignId,
            assetId: draft.assetId,
            media: gen.media,
            status: "image draft created, pending approval",
          }),
        );
      } catch (error) {
        await step(label, "done");
        const reason = error instanceof Error ? error.message : "unknown error";
        return textResult(`${label} failed: ${reason}`);
      }
    },
  );

  return [generateImage];
}
```

- [ ] **Step 4: Run → PASS.** `pnpm --filter @bsr/arc-runner test`
- [ ] **Step 5: Commit** — `git add apps/arc-runner/src/tools/media.ts apps/arc-runner/src/tools/media.test.ts && git commit -m "feat(arc-runner): generate_image tool (AI image → approval-gated draft card)"`

---

## Task 5: Add `generate_image` to the draft tier

**Files:** Modify `apps/arc-runner/src/tools/index.ts`, `apps/arc-runner/src/tools/index.test.ts`.

- [ ] **Step 1: `index.ts`.** Import and add to `draftTools`:

Add import: `import { mediaTools } from "./media";`

Change `draftTools`:
```ts
function draftTools(client: ArcClient, step: StepFn, sink: TurnSink) {
  return [...draftWorkProductTools(client, step, sink.card), ...mediaTools(client, step, sink.card)];
}
```
(No other change — `toolsForMode` already adds `draftTools` for draft mode; `allowedToolNames` derives from it.)

- [ ] **Step 2: `index.test.ts`.** Add `generate_image` to the `DRAFT` constant:
```ts
const DRAFT = ["create_campaign_draft", "generate_image"];
```
(The existing "draft mode adds draft work products on top of act" and "act does not include draft work products" tests now also cover `generate_image` via the `DRAFT` array; add an explicit guard:)
```ts
  it("act mode does not include generate_image", () => {
    const names = toolsForMode("act", stubClient, step, sink).map((t) => t.name);
    expect(names).not.toContain("generate_image");
  });
```

- [ ] **Step 3: Run typecheck + tests** — PASS. `pnpm --filter @bsr/arc-runner typecheck && pnpm --filter @bsr/arc-runner test`
- [ ] **Step 4: Commit** — `git add apps/arc-runner/src/tools/index.ts apps/arc-runner/src/tools/index.test.ts && git commit -m "feat(arc-runner): generate_image in the draft tier"`

---

## Task 6: Prompt guidance

**Files:** Modify `apps/arc-runner/src/prompt.ts`

- [ ] **Step 1:** After the "Make replies rich…" paragraph, add:

```
Images: in draft mode you can call \`generate_image\` to create AI visuals (concept ads, backgrounds, lifestyle, variants) — it lands an approval-gated draft asset with a thumbnail. Use it to enhance a package, never to fabricate a photo of a real BSR job or a 'before/after' that didn't happen. Prefer the business's real, approved media for proof. Every generated image is tagged AI and risk-flagged; the operator approves before anything is used.
```

- [ ] **Step 2:** Typecheck → PASS. Commit — `git add apps/arc-runner/src/prompt.ts && git commit -m "feat(arc-runner): prompt guidance for generate_image"`

---

## Task 7: Manual acceptance

To test live, set (app env): `ARC_MEDIA_ENABLED=1`, `GEMINI_API_KEY=<key>`, and GCS vars; restart app + runner.

- [ ] **Step 1: Flag off (default).** With `ARC_MEDIA_ENABLED` unset, in draft mode: "Generate a concept image for a water-damage ad." → Arc reports image generation isn't enabled; no crash, no external call.
- [ ] **Step 2: Flag on.** Set the env, restart. Same ask → a `Generating image` step, then a **draft card with a real thumbnail**, an **"AI" provenance badge**, a format badge, and inline **Approve/Decline**. The image is in GCS.
- [ ] **Step 3: Risk flags.** "Generate a before/after of a flooded basement with our logo." → the card shows risk pills (claim risk, unrealistic scene, embedded text). Arc should also push back per the augment-not-fabricate guidance.
- [ ] **Step 4: Approve.** Approving the card flips real asset state in `/campaigns` (the asset carries the generated media URL).
- [ ] **Step 5: Mode gating.** In **act** mode, asking to generate an image → Arc explains it needs draft mode (tool unavailable in act).

---

## Self-review notes
- **Spec coverage:** MediaProvider abstraction (Task 2) + Gemini provider; flag-gated endpoint → GCS → provenance-tagged media (Tasks 1–3); draft-mode `generate_image` → approval-gated draft card with thumbnail (Tasks 4–5); guardrails — provenance `ai_generated`, heuristic risk flags, approval gate, augment-not-fabricate prompt (Tasks 2, 6). Acceptance criteria mapped to Task 7.
- **Type/name consistency:** endpoint returns `{ media }` with `ArcMedia` shape; `generate_image` reads `gen.media`, passes `media_url` to the Plan 4 draft-asset endpoint, emits a card with `media` (Plan 5 field) + `approval` (Plan 3/4). `MediaProvider`/`GeneratedMedia`/`ImageGenInput` defined in Task 2 and consumed in Tasks 2–3. `mediaTools(client, step, sink.card)` matches the `draftWorkProductTools` factory shape.
- **Reuse:** composes Plan 4 (`draft-asset`) + Plan 5 (`media` card) rather than duplicating; no endpoint change needed there.
- **Restraint:** flag off by default; provider null when uncredentialed (graceful); draft-only; risk-flag heuristic is v1 (hardening deferred to a follow-up). Video = Plan B.
- **Deferred:** Veo/video (Plan B); Higgsfield/Vertex providers (same interface); richer risk detection.
```
