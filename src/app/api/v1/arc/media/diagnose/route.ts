import { NextResponse } from "next/server";

import { requireOperator } from "@/lib/auth/operator";
import { getMediaProviderWithKey, isMediaGenEnabled } from "@/lib/media";
import { resolveMediaGeneration } from "@/lib/media/enablement";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";

export const runtime = "nodejs";

/**
 * Operator-gated, secret-safe media-gen diagnostic. Reports whether the gate is
 * on, whether a key is present (boolean only), the configured model env, and —
 * when `?probe=1` — runs a tiny live image gen + video start to prove the key
 * actually has Imagen/Veo access. Never returns any secret value.
 *
 *   GET /api/v1/arc/media/diagnose
 *   GET /api/v1/arc/media/diagnose?probe=1   (runs live image + video-start probes)
 */
export async function GET(request: Request): Promise<NextResponse> {
  await requireOperator();
  const url = new URL(request.url);
  const probe = url.searchParams.get("probe") === "1";

  const ctx = await getCurrentWorkspaceContext().catch(() => null);
  const access = await resolveMediaGeneration(ctx?.workspaceId ?? null);
  const report: Record<string, unknown> = {
    // Per-workspace truth (the gemini-media connector), plus the legacy env flag.
    mediaEnabled: access.enabled,
    credentialSource: access.enabled ? access.source : null,
    costTier: access.enabled ? access.costTier : null,
    disabledReason: access.enabled ? null : access.reason,
    legacyEnvEnabled: isMediaGenEnabled(),
    geminiKeyPresent: Boolean(process.env.GEMINI_API_KEY?.trim()),
    imageModelEnv: process.env.GEMINI_IMAGE_MODEL ?? null,
    videoModelEnv: process.env.GEMINI_VIDEO_MODEL ?? null,
  };

  if (probe && access.enabled) {
    const provider = getMediaProviderWithKey(access.credential);
    report.imageProbe = await probeImage(provider);
    report.videoProbe = await probeVideoStart(provider);
  }

  return NextResponse.json(report);
}

/** Belt-and-suspenders: never echo the API key, even if a provider error embeds it. */
function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "unknown";
  const key = process.env.GEMINI_API_KEY?.trim();
  return key ? message.split(key).join("***") : message;
}

async function probeImage(provider: ReturnType<typeof getMediaProviderWithKey> | null) {
  if (!provider) return { ok: false, error: "provider unavailable" };
  try {
    // ImageGenInput: { prompt: string; aspectRatio?: string }
    // GeneratedMedia result: { bytes: Buffer, contentType: string, model: string, jobId: string }
    const media = await provider.generateImage({ prompt: "a plain blue square, minimal" });
    return { ok: true, model: media.model, bytes: media.bytes.length };
  } catch (error) {
    return { ok: false, error: safeError(error) };
  }
}

async function probeVideoStart(provider: ReturnType<typeof getMediaProviderWithKey> | null) {
  if (!provider) return { ok: false, error: "provider unavailable" };
  if (!provider.startVideo) return { ok: false, error: "video unsupported by provider" };
  try {
    // VideoGenInput: { prompt: string; aspectRatio?: string; durationSeconds?: number }
    // VideoStart result: { operationName: string, model: string, jobId: string }
    const start = await provider.startVideo({ prompt: "a calm ocean wave, 2 seconds" });
    return { ok: true, model: start.model, operationStarted: Boolean(start.operationName) };
  } catch (error) {
    return { ok: false, error: safeError(error) };
  }
}
