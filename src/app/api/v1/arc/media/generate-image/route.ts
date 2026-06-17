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
    // 7 days is the v4 signed-URL max. The durable reference is objectPath
    // (persisted on the asset); a follow-up will re-sign at render time.
    const url = await createSignedReadUrl(objectPath, 7 * 24 * 60 * 60 * 1000);
    const media = {
      kind: "image" as const,
      url,
      source: "ai_generated" as const,
      format: aspectRatio,
      model: gen.model,
      jobId: gen.jobId,
      riskFlags: deriveImageRiskFlags(prompt),
    };
    return NextResponse.json({ ok: true, status: "created", media, objectPath }, { status: 201 });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Image generation failed.", 502);
  }
}
