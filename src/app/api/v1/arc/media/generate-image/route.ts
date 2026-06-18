import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { INVALID_JSON, fail, guard, readJson } from "@/app/api/v1/arc/_lib/http";
import { getMediaProvider, isMediaGenEnabled } from "@/lib/media";
import { hardenImagePrompt } from "@/lib/media/prompt";
import { deriveImageRiskFlags } from "@/lib/media/risk";
import { storeGeneratedImage } from "@/lib/media/storage";
import { getAppSettings } from "@/lib/settings/store";

/**
 * Generate an image (AI) and store it in the public campaign-media Supabase
 * bucket. Flag-gated; Supabase is already required by guard(). Returns
 * not_configured when media gen isn't enabled. The result is provenance-tagged
 * (source: ai_generated) with heuristic risk flags. No outbound.
 *
 *   POST /api/v1/arc/media/generate-image
 *   { prompt: string, aspect_ratio?: string, style?: string }
 *   -> 201 { ok, status:"created", media: ArcMedia }
 */
export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  if (!isMediaGenEnabled()) {
    return fail("not_configured", "Image generation isn't enabled (needs ARC_MEDIA_ENABLED and GEMINI_API_KEY).", 503);
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
  const style = typeof body.style === "string" && body.style.trim() ? body.style.trim() : undefined;

  const settings = await getAppSettings();
  const provider = getMediaProvider({ imageModel: settings.imageModel, videoModel: settings.videoModel });
  if (!provider) return fail("not_configured", "Image generation isn't enabled.", 503);

  try {
    // Harden the prompt (strip embedded text/branding, add quality + caller style)
    // before sending; risk flags stay on the operator's original intent.
    const finalPrompt = hardenImagePrompt(prompt, { style });
    const gen = await provider.generateImage({ prompt: finalPrompt, aspectRatio });
    const ext = gen.contentType.includes("png") ? "png" : gen.contentType.includes("webp") ? "webp" : "jpg";
    const objectPath = `arc-generated/${randomUUID()}.${ext}`;
    // Permanent public URL from the campaign-media bucket — no expiry to re-sign.
    const url = await storeGeneratedImage(objectPath, gen.bytes, gen.contentType);
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
